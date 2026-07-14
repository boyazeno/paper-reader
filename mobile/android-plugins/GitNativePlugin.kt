package de.unituebingen.paperreader.mobile

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.api.MergeResult
import org.eclipse.jgit.transport.RefSpec
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import java.io.File

/**
 * Native git (JGit) for arbitrarily large repos — JGit streams packs to disk,
 * so memory stays bounded regardless of repo size. JGit needs a real
 * filesystem path, so the repo lives in an app-private "clone" dir; before/after
 * each git op we mirror files between that clone and the user's SAF vault
 * (per-file streaming copies, bounded memory). The SAF vault stays the user's
 * folder; the `.git` lives only in the hidden clone.
 */
@CapacitorPlugin(name = "GitNative")
class GitNativePlugin : Plugin() {

  private fun cloneDir(): File = File(context.getExternalFilesDir(null), "gitclone")

  private fun vaultRoot(): DocumentFile? {
    val uri = context.getSharedPreferences("vaultfs", Context.MODE_PRIVATE)
      .getString("treeUri", null) ?: return null
    return DocumentFile.fromTreeUri(context, Uri.parse(uri))
  }

  private fun emit(line: String) {
    notifyListeners("progress", JSObject().put("line", line))
  }

  @PluginMethod
  fun sync(call: PluginCall) {
    Thread {
      var git: Git? = null
      try {
        val remoteUrl = call.getString("remoteUrl") ?: return@Thread call.reject("remoteUrl required")
        val branch = call.getString("branch") ?: "main"
        val username = call.getString("username") ?: "x-access-token"
        val token = call.getString("token") ?: ""
        val shallow = call.getBoolean("shallow", true) ?: true
        val message = call.getString("message") ?: "Sync"
        val cp = UsernamePasswordCredentialsProvider(username, token)
        val dir = cloneDir()
        val log = StringBuilder()
        fun step(s: String) { log.append(s).append('\n'); emit(s) }

        val root = vaultRoot() ?: return@Thread call.reject("No vault folder chosen")

        // 1) Open or init the hidden clone.
        git = if (File(dir, ".git").isDirectory) {
          Git.open(dir)
        } else {
          dir.mkdirs()
          Git.init().setDirectory(dir).setInitialBranch(branch).call()
        }
        git.repository.config.apply {
          setString("remote", "origin", "url", remoteUrl)
          setString("remote", "origin", "fetch", "+refs/heads/*:refs/remotes/origin/*")
          save()
        }
        step("repo ready at ${dir.name}")

        // 2) Vault → clone working tree.
        val copied = mirrorToClone(root, dir)
        step("mirrored vault → clone ($copied changed)")

        // 3) Stage everything (adds/mods + deletions), untrack now-ignored PDFs,
        //    and commit if changed.
        git.add().addFilepattern(".").call()
        git.add().setUpdate(true).addFilepattern(".").call()
        untrackIgnoredPdfs(git, dir)
        if (!git.status().call().isClean) {
          git.commit()
            .setMessage(message)
            .setAuthor("Paper Reader", "paper-reader@localhost")
            .call()
          step("committed local changes")
        } else {
          step("nothing to commit")
        }

        // 4) Fetch + merge (shallow by default). JGit streams the pack to disk.
        try {
          val fetch = git.fetch().setRemote("origin").setCredentialsProvider(cp)
          if (shallow) fetch.setDepth(1)
          fetch.call()
          step("fetched" + if (shallow) " (shallow)" else "")
          val remoteRef = git.repository.resolve("refs/remotes/origin/$branch")
          if (remoteRef != null) {
            val merge = git.merge().include(remoteRef).call()
            if (merge.mergeStatus == MergeResult.MergeStatus.CONFLICTING) {
              call.reject("Merge conflict in: ${merge.conflicts?.keys?.joinToString()}")
              return@Thread
            }
            step("merged remote (${merge.mergeStatus})")
          } else {
            step("no remote branch yet (first push)")
          }
        } catch (e: Exception) {
          step("fetch/merge note: ${e.message}")
        }

        // 5) Push.
        git.push()
          .setRemote("origin")
          .setCredentialsProvider(cp)
          .setRefSpecs(RefSpec("refs/heads/$branch:refs/heads/$branch"))
          .call()
        step("pushed")

        // 6) Clone working tree → vault (bring merged remote changes back).
        val back = mirrorFromClone(dir, root)
        step("mirrored clone → vault ($back changed)")

        call.resolve(JSObject().put("status", "ok").put("log", log.toString()))
      } catch (e: Exception) {
        call.reject(e.message ?: "git error", e)
      } finally {
        git?.close()
      }
    }.start()
  }

  /** Drop from the index any `paper.pdf` whose per-project `.gitignore` marks it
   * re-fetchable, so re-downloadable PDFs stop syncing (working copies stay). */
  private fun untrackIgnoredPdfs(git: Git, clone: File) {
    val cache = git.repository.readDirCache()
    val rm = git.rm().setCached(true)
    var any = false
    fun walk(dir: File, rel: String) {
      val files = dir.listFiles() ?: return
      for (f in files) {
        if (f.name == ".git") continue
        val childRel = if (rel.isEmpty()) f.name else "$rel/${f.name}"
        if (f.isDirectory) {
          walk(f, childRel)
        } else if (f.name == ".gitignore" &&
          f.readText().lineSequence().any { it.trim() == "paper.pdf" }
        ) {
          val pdfRel = if (rel.isEmpty()) "paper.pdf" else "$rel/paper.pdf"
          if (cache.findEntry(pdfRel) >= 0) {
            rm.addFilepattern(pdfRel)
            any = true
          }
        }
      }
    }
    walk(clone, "")
    if (any) rm.call()
  }

  // ---------- mirroring: SAF DocumentFile <-> real File tree ----------

  /** Copy vault files into the clone (skip unchanged by size+mtime); delete
   * clone files no longer in the vault. Returns the number of files written. */
  private fun mirrorToClone(root: DocumentFile, clone: File): Int {
    val seen = HashSet<String>()
    var changed = 0
    fun walk(doc: DocumentFile, rel: String) {
      for (child in doc.listFiles()) {
        val name = child.name ?: continue
        val childRel = if (rel.isEmpty()) name else "$rel/$name"
        if (child.isDirectory) {
          File(clone, childRel).mkdirs()
          walk(child, childRel)
        } else {
          seen.add(childRel)
          val target = File(clone, childRel)
          if (!target.exists() || target.length() != child.length() ||
            child.lastModified() > target.lastModified()
          ) {
            target.parentFile?.mkdirs()
            context.contentResolver.openInputStream(child.uri)?.use { input ->
              target.outputStream().use { input.copyTo(it, 65536) }
            }
            changed++
          }
        }
      }
    }
    walk(root, "")
    deleteCloneMissing(clone, clone, seen)
    return changed
  }

  private fun deleteCloneMissing(base: File, cur: File, seen: Set<String>) {
    val files = cur.listFiles() ?: return
    for (f in files) {
      if (f.name == ".git") continue
      if (f.isDirectory) {
        deleteCloneMissing(base, f, seen)
        if (f.listFiles()?.isEmpty() == true) f.delete()
      } else {
        val rel = f.relativeTo(base).path.replace(File.separatorChar, '/')
        if (rel !in seen) f.delete()
      }
    }
  }

  /** Copy clone files (excluding .git) into the vault; delete vault files no
   * longer in the clone. Returns the number of files written. */
  private fun mirrorFromClone(clone: File, root: DocumentFile): Int {
    var changed = 0
    val seen = HashSet<String>()
    fun walk(cur: File, rel: String) {
      val files = cur.listFiles() ?: return
      for (f in files) {
        if (rel.isEmpty() && f.name == ".git") continue
        val childRel = if (rel.isEmpty()) f.name else "$rel/${f.name}"
        if (f.isDirectory) {
          walk(f, childRel)
        } else {
          seen.add(childRel)
          val existing = findByPath(root, childRel)
          if (existing == null || existing.length() != f.length() ||
            f.lastModified() > existing.lastModified()
          ) {
            writeSaf(root, childRel, f)
            changed++
          }
        }
      }
    }
    walk(clone, "")
    deleteVaultMissing(root, "", seen)
    return changed
  }

  private fun segments(path: String): List<String> = path.split('/').filter { it.isNotEmpty() }

  private fun findByPath(root: DocumentFile, path: String): DocumentFile? {
    var cur: DocumentFile? = root
    for (seg in segments(path)) {
      cur = cur?.findFile(seg) ?: return null
    }
    return cur
  }

  private fun writeSaf(root: DocumentFile, path: String, src: File) {
    val segs = segments(path)
    var dir = root
    for (i in 0 until segs.size - 1) {
      dir = dir.findFile(segs[i])?.takeIf { it.isDirectory } ?: dir.createDirectory(segs[i]) ?: return
    }
    val name = segs.last()
    val target = dir.findFile(name) ?: dir.createFile("application/octet-stream", name) ?: return
    context.contentResolver.openOutputStream(target.uri, "wt")?.use { out ->
      src.inputStream().use { it.copyTo(out, 65536) }
    }
  }

  private fun deleteVaultMissing(dir: DocumentFile, rel: String, seen: Set<String>) {
    for (child in dir.listFiles()) {
      val name = child.name ?: continue
      val childRel = if (rel.isEmpty()) name else "$rel/$name"
      if (child.isDirectory) {
        deleteVaultMissing(child, childRel, seen)
      } else if (childRel !in seen) {
        child.delete()
      }
    }
  }
}

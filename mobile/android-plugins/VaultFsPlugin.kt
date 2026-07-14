package de.unituebingen.paperreader.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import android.util.Base64
import org.json.JSONArray

/**
 * VaultFs — the vault filesystem over the Storage Access Framework. The user
 * picks a folder (persistable grant); every JS `path` is POSIX-relative to it.
 * Bytes cross the bridge base64-encoded. Backs both the project/library file
 * I/O and the isomorphic-git fs adapter.
 */
@CapacitorPlugin(name = "VaultFs")
class VaultFsPlugin : Plugin() {

    private val prefs by lazy {
        context.getSharedPreferences("vaultfs", Context.MODE_PRIVATE)
    }

    private fun rootUri(): Uri? =
        prefs.getString("treeUri", null)?.let { Uri.parse(it) }

    private fun root(): DocumentFile? =
        rootUri()?.let { DocumentFile.fromTreeUri(context, it) }

    // ---- folder picking ----
    @PluginMethod
    fun chooseFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
        startActivityForResult(call, intent, "onFolderPicked")
    }

    @ActivityCallback
    private fun onFolderPicked(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (uri == null) {
            call.reject("No folder selected")
            return
        }
        context.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
        prefs.edit().putString("treeUri", uri.toString()).apply()
        call.resolve(JSObject().put("uri", uri.toString()))
    }

    @PluginMethod
    fun getFolder(call: PluginCall) {
        call.resolve(JSObject().put("uri", prefs.getString("treeUri", null)))
    }

    // ---- path resolution over DocumentFile ----
    private fun segments(path: String): List<String> =
        path.trim('/').split('/').filter { it.isNotEmpty() && it != "." }

    /** Resolve an existing node, or null. */
    private fun resolve(path: String): DocumentFile? {
        var cur = root() ?: return null
        for (seg in segments(path)) {
            cur = cur.findFile(seg) ?: return null
        }
        return cur
    }

    /** Resolve (creating intermediate directories) the parent of `path`. */
    private fun ensureParent(path: String): DocumentFile? {
        var cur = root() ?: return null
        val segs = segments(path)
        for (i in 0 until segs.size - 1) {
            val name = segs[i]
            cur = cur.findFile(name)?.takeIf { it.isDirectory }
                ?: cur.createDirectory(name) ?: return null
        }
        return cur
    }

    @PluginMethod
    fun readFile(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        val file = resolve(path) ?: return call.reject("ENOENT: $path")
        val bytes = context.contentResolver.openInputStream(file.uri)?.use { it.readBytes() }
            ?: return call.reject("EIO: $path")
        call.resolve(JSObject().put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)))
    }

    @PluginMethod
    fun writeFile(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        val data = call.getString("data") ?: return call.reject("data required")
        val bytes = Base64.decode(data, Base64.NO_WRAP)
        val parent = ensureParent(path) ?: return call.reject("ENOENT parent: $path")
        val name = segments(path).last()
        val existing = parent.findFile(name)
        val target = existing ?: parent.createFile("application/octet-stream", name)
            ?: return call.reject("EIO create: $path")
        // "wt" truncates so overwrites don't leave a stale tail.
        context.contentResolver.openOutputStream(target.uri, "wt")?.use { it.write(bytes) }
            ?: return call.reject("EIO write: $path")
        call.resolve()
    }

    @PluginMethod
    fun exists(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        call.resolve(JSObject().put("exists", resolve(path) != null))
    }

    @PluginMethod
    fun stat(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        val f = resolve(path) ?: return call.reject("ENOENT: $path")
        call.resolve(
            JSObject()
                .put("type", if (f.isDirectory) "dir" else "file")
                .put("size", f.length())
                .put("mtime", f.lastModified())
        )
    }

    @PluginMethod
    fun list(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        val dir = resolve(path) ?: return call.resolve(JSObject().put("entries", JSONArray()))
        val arr = JSONArray()
        for (child in dir.listFiles()) {
            arr.put(
                JSObject()
                    .put("name", child.name ?: "")
                    .put("type", if (child.isDirectory) "dir" else "file")
            )
        }
        call.resolve(JSObject().put("entries", arr))
    }

    @PluginMethod
    fun mkdir(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        var cur = root() ?: return call.reject("No vault folder")
        for (seg in segments(path)) {
            cur = cur.findFile(seg)?.takeIf { it.isDirectory }
                ?: cur.createDirectory(seg) ?: return call.reject("EIO mkdir: $path")
        }
        call.resolve()
    }

    @PluginMethod
    fun delete(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("path required")
        resolve(path)?.delete()
        call.resolve()
    }

    @PluginMethod
    fun rename(call: PluginCall) {
        val from = call.getString("from") ?: return call.reject("from required")
        val to = call.getString("to") ?: return call.reject("to required")
        val src = resolve(from) ?: return call.reject("ENOENT: $from")
        val toSegs = segments(to)
        val sameParent = segments(from).dropLast(1) == toSegs.dropLast(1)
        if (sameParent) {
            // Pure rename within the same directory.
            DocumentsContract.renameDocument(context.contentResolver, src.uri, toSegs.last())
            call.resolve()
            return
        }
        // Cross-directory move: copy bytes then delete (SAF has no atomic move).
        val bytes = context.contentResolver.openInputStream(src.uri)?.use { it.readBytes() }
            ?: return call.reject("EIO: $from")
        val parent = ensureParent(to) ?: return call.reject("ENOENT parent: $to")
        val name = toSegs.last()
        parent.findFile(name)?.delete()
        val target = parent.createFile("application/octet-stream", name)
            ?: return call.reject("EIO create: $to")
        context.contentResolver.openOutputStream(target.uri, "wt")?.use { it.write(bytes) }
        src.delete()
        call.resolve()
    }

    @PluginMethod
    fun reveal(call: PluginCall) {
        val uri = rootUri()
        if (uri != null) {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
            } catch (_: Exception) {
                /* no file app available */
            }
        }
        call.resolve()
    }
}

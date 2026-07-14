package de.unituebingen.paperreader.mobile

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native HTTP transport for isomorphic-git. Git smart-HTTP from the WebView is
 * blocked by CORS (GitHub/GitLab don't send the headers a browser needs); this
 * plugin performs the request with the platform HTTP stack instead, straight to
 * the host — no CORS, no third-party proxy. Bodies cross the bridge base64.
 */
@CapacitorPlugin(name = "GitHttp")
class GitHttpPlugin : Plugin() {

  private val maxResponse = 128 * 1024 * 1024 // 128 MB

  private fun readCapped(stream: java.io.InputStream?): ByteArray {
    if (stream == null) return ByteArray(0)
    val out = ByteArrayOutputStream()
    val buf = ByteArray(65536)
    var total = 0L
    while (true) {
      val n = stream.read(buf)
      if (n < 0) break
      total += n
      if (total > maxResponse) {
        throw IOException(
          "Fetch too large (>128 MB) for on-device memory. Seed the remote from " +
            "desktop, then sync incremental changes."
        )
      }
      out.write(buf, 0, n)
    }
    return out.toByteArray()
  }

  @PluginMethod
  fun request(call: PluginCall) {
    // Network must not run on the main thread.
    Thread {
      var conn: HttpURLConnection? = null
      try {
        val url = URL(call.getString("url") ?: return@Thread call.reject("url required"))
        val method = call.getString("method") ?: "GET"
        val headers = call.getObject("headers") ?: JSObject()
        val bodyB64 = call.getString("body") ?: ""

        conn = (url.openConnection() as HttpURLConnection).apply {
          instanceFollowRedirects = false // let isomorphic-git handle redirects
          requestMethod = method
          connectTimeout = 30000
          readTimeout = 120000
        }

        val keys = headers.keys()
        while (keys.hasNext()) {
          val k = keys.next()
          // content-length is managed by the stream mode below; identity avoids
          // gzip ambiguity with git packfiles.
          if (k.equals("content-length", true)) continue
          conn.setRequestProperty(k, headers.getString(k))
        }
        conn.setRequestProperty("Accept-Encoding", "identity")

        if (method == "POST" || method == "PUT") {
          val body = Base64.decode(bodyB64, Base64.NO_WRAP)
          conn.doOutput = true
          conn.setFixedLengthStreamingMode(body.size)
          conn.outputStream.use { it.write(body) }
        }

        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
        // Bounded read: a huge fetch (large packfile) would OOM-kill the app.
        // Cap it and fail cleanly with guidance instead of crashing.
        val respBytes = readCapped(stream)

        val respHeaders = JSObject()
        for ((k, v) in conn.headerFields) {
          if (k != null) respHeaders.put(k.lowercase(), v.joinToString(","))
        }

        val ret = JSObject()
        ret.put("status", status)
        ret.put("statusText", conn.responseMessage ?: "")
        ret.put("headers", respHeaders)
        ret.put("body", Base64.encodeToString(respBytes, Base64.NO_WRAP))
        call.resolve(ret)
      } catch (e: Exception) {
        call.reject(e.message ?: "git http error", e)
      } finally {
        conn?.disconnect()
      }
    }.start()
  }
}

package de.unituebingen.paperreader.mobile

import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * A native full-screen WebView for Scholar Inbox, overlaid on top of the app's
 * Capacitor WebView but with a top inset so the React toolbar (back/forward/
 * URL/login-link) stays visible above it. Cookies persist (login survives
 * restarts). PDF links (target=_blank popups or downloads) are intercepted and
 * emitted to JS as `openUrl`, which imports the paper as a tab — mirroring the
 * desktop popup interception.
 */
@CapacitorPlugin(name = "ScholarWebView")
class ScholarWebViewPlugin : Plugin() {

  private var webView: WebView? = null

  private fun emitPdf(url: String) {
    notifyListeners("openUrl", JSObject().put("url", url))
  }

  @PluginMethod
  fun open(call: PluginCall) {
    val url = call.getString("url") ?: "https://www.scholar-inbox.com/"
    val topDp = call.getDouble("top") ?: 0.0
    activity.runOnUiThread {
      val wv = webView ?: WebView(context).also { webView = it }
      wv.settings.javaScriptEnabled = true
      wv.settings.domStorageEnabled = true
      wv.settings.databaseEnabled = true
      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)

      wv.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
          val u = req.url.toString()
          if (u.endsWith(".pdf", ignoreCase = true) || u.contains("/pdf/")) {
            emitPdf(u)
            return true // don't navigate; import instead
          }
          return false
        }
      }
      // Direct PDF responses the WebView would download → import instead.
      wv.setDownloadListener { u, _, _, _, _ -> emitPdf(u) }

      wv.setBackgroundColor(android.graphics.Color.WHITE)
      if (wv.parent == null) {
        val density = context.resources.displayMetrics.density.toDouble()
        val lp = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
        lp.topMargin = (topDp * density).toInt()
        // Parent to the content frame (same coordinate space as the app's
        // WebView) so the React toolbar strip above stays visible — NOT the
        // decorView, which would cover it.
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        content.addView(wv, lp)
      }
      wv.loadUrl(url)
    }
    call.resolve()
  }

  @PluginMethod
  fun loadUrl(call: PluginCall) {
    val url = call.getString("url") ?: return call.reject("url required")
    activity.runOnUiThread { webView?.loadUrl(url) }
    call.resolve()
  }

  @PluginMethod
  fun close(call: PluginCall) {
    activity.runOnUiThread {
      webView?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
      webView = null
    }
    call.resolve()
  }

  @PluginMethod fun goBack(call: PluginCall) { activity.runOnUiThread { webView?.goBack() }; call.resolve() }
  @PluginMethod fun goForward(call: PluginCall) { activity.runOnUiThread { webView?.goForward() }; call.resolve() }
  @PluginMethod fun reload(call: PluginCall) { activity.runOnUiThread { webView?.reload() }; call.resolve() }
}

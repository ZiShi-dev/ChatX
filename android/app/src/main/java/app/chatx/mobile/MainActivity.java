package app.chatx.mobile;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    static volatile boolean foreground = false;
    private int navigationExtraPx = 0;
    private int statusTopPx = 0;
    private boolean loginWatchStarted = false;

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;
        InboxLifecycle.foreground(true);
        InboxWatch.pauseAlarm(getApplicationContext());
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            ViewCompat.requestApplyInsets(webView);
            publishNavigationExtra(webView);
        }
    }

    @Override
    public void onPause() {
        foreground = false;
        InboxLifecycle.foreground(false);
        super.onPause();
        Context app = getApplicationContext();
        String origin = InboxWatch.prefs(app).getString("origin", "");
        if (origin != null && origin.startsWith("https://")) {
            try {
                String cookie = CookieManager.getInstance().getCookie(origin);
                if (cookie != null && cookie.contains("chatx_session=")) {
                    InboxWatch.prefs(app).edit().putString("cookie", cookie).commit();
                }
                CookieManager.getInstance().flush();
            } catch (RuntimeException error) {
                // The stored cookie from the last open is still used.
            }
        }
        new Thread(() -> InboxPoll.run(app)).start();
        InboxWatch.schedule(app);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        registerPlugin(InboxWatchPlugin.class);
        registerPlugin(AppReleasePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().getSettings().setAllowFileAccess(false);
        getBridge().getWebView().getSettings().setAllowContentAccess(false);
        getBridge().getWebView().getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setSupportMultipleWindows(true);
        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                return openGoogleWindow(resultMsg);
            }
        });
        watchNavigationMode(webView);
    }

    private void watchNavigationMode(WebView webView) {
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            int extra = 0;
            if (!keyboard && buttonNavigation(insets)) {
                int bars = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
                int tappable = insets.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom;
                extra = Math.max(bars, tappable);
            }
            int status = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            if (status == 0) {
                WindowInsetsCompat root = ViewCompat.getRootWindowInsets(view);
                if (root != null) status = root.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            }
            float density = getResources().getDisplayMetrics().density;
            navigationExtraPx = density > 0 ? Math.round(extra / density) : 0;
            statusTopPx = density > 0 ? Math.round(status / density) : 0;
            publishNavigationExtra(webView);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private boolean buttonNavigation(WindowInsetsCompat insets) {
        int id = getResources().getIdentifier("config_navBarInteractionMode", "integer", "android");
        if (id != 0) return getResources().getInteger(id) != 2;
        return insets.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom > 0;
    }

    private void publishNavigationExtra(WebView webView) {
        webView.evaluateJavascript(
            "try{var root=document.documentElement.style;root.setProperty('--chatx-nav-bottom','" + navigationExtraPx + "px');root.setProperty('--chatx-system-bottom','" + navigationExtraPx + "px');root.setProperty('--chatx-status-top','" + statusTopPx + "px');root.setProperty('--chatx-gesture-extra','0px')}catch(e){}",
            null
        );
    }

    @Override
    public void onStart() {
        super.onStart();
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private boolean openGoogleWindow(Message resultMsg) {
        FrameLayout layout = new FrameLayout(this);
        Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.setContentView(layout);
        dialog.setOnKeyListener((view, keyCode, event) -> {
            if (keyCode != KeyEvent.KEYCODE_BACK || event.getAction() != KeyEvent.ACTION_UP) return false;
            retireGoogleDialog(dialog, layout, false);
            return true;
        });
        WebView popup = createGooglePopup(layout, dialog);
        dialog.show();
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createGooglePopup(FrameLayout layout, Dialog dialog) {
        WebView popup = new WebView(this);
        WebSettings settings = popup.getSettings();
        WebSettings hostSettings = getBridge().getWebView().getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(hostSettings.getUserAgentString());
        CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);
        layout.addView(popup, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        popup.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                // Google asks to close as soon as the account is chosen. The app may still be
                // signing in inside this window, so keep it until the login is stored.
                if (Boolean.TRUE.equals(window.getTag())) return;
                if (isAppHost(window.getUrl()) || loginWatchStarted) {
                    watchInstalledLogin(dialog, layout);
                    return;
                }
                window.setTag(Boolean.TRUE);
                getBridge().getWebView().postDelayed(() -> {
                    if (loginWatchStarted || window.getParent() != layout) return;
                    layout.removeView(window);
                    window.destroy();
                    if (layout.getChildCount() == 0 && dialog.isShowing()) dialog.dismiss();
                }, 4000);
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView child = createGooglePopup(layout, dialog);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(child);
                resultMsg.sendToTarget();
                return true;
            }
        });
        popup.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView window, WebResourceRequest request) {
                if (isAppHost(request.getUrl())) watchInstalledLogin(dialog, layout);
                return !allowedGoogleUrl(request.getUrl());
            }
        });
        return popup;
    }

    private void retireGoogleDialog(Dialog dialog, FrameLayout layout, boolean delay) {
        loginWatchStarted = false;
        Runnable close = () -> {
            try {
                CookieManager.getInstance().flush();
            } catch (RuntimeException ignored) {
                // The login stored in the page remains.
            }
            if (dialog.isShowing()) dialog.dismiss();
            for (int index = layout.getChildCount() - 1; index >= 0; index--) {
                View child = layout.getChildAt(index);
                child.setTag(Boolean.TRUE);
                layout.removeViewAt(index);
                if (child instanceof WebView web) web.destroy();
            }
        };
        if (delay) getBridge().getWebView().postDelayed(close, 700);
        else close.run();
    }

    private void watchInstalledLogin(Dialog dialog, FrameLayout layout) {
        if (loginWatchStarted) return;
        loginWatchStarted = true;
        WebView host = getBridge().getWebView();
        Runnable check = new Runnable() {
            int tries = 0;

            @Override
            public void run() {
                if (!dialog.isShowing()) return;
                host.evaluateJavascript(
                    "(function(){try{var raw=localStorage.getItem('chatx.auth')||'';if(raw.indexOf('\"activated\":true')<0)return 'wait';return (location.pathname==='/activation'||location.pathname==='/')?'reload':'close';}catch(e){return 'wait';}})()",
                    value -> {
                        if (!dialog.isShowing()) return;
                        if (value != null && value.contains("reload")) {
                            retireGoogleDialog(dialog, layout, false);
                            host.reload();
                            return;
                        }
                        if (value != null && value.contains("close")) {
                            retireGoogleDialog(dialog, layout, false);
                            return;
                        }
                        if (tries++ < 180) host.postDelayed(this, 1000);
                        else retireGoogleDialog(dialog, layout, false);
                    }
                );
            }
        };
        host.postDelayed(check, 500);
    }

    private static boolean isAppHost(Uri url) {
        if (url == null) return false;
        String host = url.getHost();
        return "localhost".equals(host) || "127.0.0.1".equals(host);
    }

    private static boolean isAppHost(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            return isAppHost(Uri.parse(url));
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static boolean allowedGoogleUrl(Uri url) {
        if ("about:blank".equals(url.toString())) return true;
        String host = url.getHost();
        if (!"https".equals(url.getScheme()) || host == null) return false;
        return host.equals("localhost")
            || host.equals("accounts.google.com")
            || host.endsWith(".google.com")
            || host.endsWith(".gstatic.com")
            || host.endsWith(".googleapis.com")
            || host.endsWith(".googleusercontent.com");
    }
}

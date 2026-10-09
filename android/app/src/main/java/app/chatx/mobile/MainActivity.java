package app.chatx.mobile;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.os.Bundle;
import android.os.Message;
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

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            ViewCompat.requestApplyInsets(webView);
            publishNavigationExtra(webView);
        }
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        registerPlugin(InboxWatchPlugin.class);
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
            if (!keyboard) {
                int buttons = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
                int gestures = insets.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures()).bottom;
                extra = Math.max(0, gestures - buttons);
            }
            float density = getResources().getDisplayMetrics().density;
            navigationExtraPx = density > 0 ? Math.round(extra / density) : 0;
            publishNavigationExtra(webView);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void publishNavigationExtra(WebView webView) {
        webView.evaluateJavascript(
            "try{document.documentElement.style.setProperty('--chatx-gesture-extra','" + navigationExtraPx + "px')}catch(e){}",
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
        WebView popup = new WebView(this);
        WebSettings settings = popup.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);

        FrameLayout layout = new FrameLayout(this);
        layout.addView(popup, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.setContentView(layout);
        dialog.setOnDismissListener(unused -> popup.destroy());
        dialog.show();

        popup.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                if (dialog.isShowing()) dialog.dismiss();
            }
        });
        popup.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView window, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                boolean allowed = "https".equals(request.getUrl().getScheme()) && host != null && (host.equals("localhost") || host.equals("accounts.google.com") || host.endsWith(".google.com") || host.endsWith(".gstatic.com") || host.endsWith(".googleusercontent.com"));
                if (!allowed && dialog.isShowing()) dialog.dismiss();
                return !allowed;
            }
        });

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
    }
}

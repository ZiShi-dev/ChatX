package app.chatx.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppRelease")
public class AppReleasePlugin extends Plugin {
    @PluginMethod
    public void openPlayStore(PluginCall call) {
        String id = getContext().getPackageName();
        Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id));
        market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(market);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + id));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(web);
                call.resolve();
            } catch (ActivityNotFoundException nested) {
                call.reject("unavailable");
            }
        }
    }
}

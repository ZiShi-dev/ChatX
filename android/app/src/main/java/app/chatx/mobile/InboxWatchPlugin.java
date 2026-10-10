package app.chatx.mobile;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

@CapacitorPlugin(name = "InboxWatch")
public class InboxWatchPlugin extends Plugin {
    @Override
    public void load() {
        deliver(getActivity() == null ? null : getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliver(intent);
    }

    @PluginMethod
    public void remember(PluginCall call) {
        InboxWatch.remember(getContext(), call.getString("origin", ""), call.getString("quiet", ""), call.getString("hiddenKinds", ""));
        JSONArray rows = call.getArray("seen");
        if (rows != null) {
            Set<String> seen = new HashSet<>();
            for (int index = 0; index < Math.min(30, rows.length()); index++) {
                String id = rows.optString(index, "");
                if (!id.isEmpty()) seen.add(id);
            }
            InboxWatch.markSeen(getContext(), seen);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        InboxWatch.stop(getContext());
        call.resolve();
    }

    private void deliver(Intent intent) {
        if (intent == null) return;
        String conversationId = intent.getStringExtra("chatxConversation");
        if (conversationId == null || conversationId.isEmpty()) return;
        JSObject data = new JSObject();
        data.put("conversationId", conversationId);
        data.put("messageId", intent.getStringExtra("chatxMessage"));
        notifyListeners("open", data);
    }
}

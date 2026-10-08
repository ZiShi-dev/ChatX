package app.chatx.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

final class InboxPoll {
    private static final String CHANNEL = "chatx-messages";
    private static final int MAX_ALERTS = 3;

    private InboxPoll() {}

    static void run(Context context) {
        if (MainActivity.foreground) return;
        SharedPreferences prefs = InboxWatch.prefs(context);
        String origin = prefs.getString("origin", "");
        if (origin == null || !origin.startsWith("https://")) return;
        String cookie;
        try {
            cookie = CookieManager.getInstance().getCookie(origin);
        } catch (RuntimeException error) {
            return;
        }
        if (cookie == null || !cookie.contains("chatx_session=")) return;
        String body = request(origin + "/api/notifications", cookie);
        if (body == null) return;
        try {
            JSONArray rows = new JSONObject(body).optJSONArray("notifications");
            if (rows == null) return;
            boolean primed = prefs.getBoolean("primed", false);
            Set<String> already = InboxWatch.seen(prefs);
            Set<String> seen = new HashSet<>();
            int shown = 0;
            for (int index = 0; index < rows.length(); index += 1) {
                JSONObject row = rows.optJSONObject(index);
                if (row == null || !row.optBoolean("unread")) continue;
                String id = row.optString("id", "");
                String conversationId = row.optString("conversationId", "");
                String kind = row.optString("kind", "");
                if (id.isEmpty() || conversationId.isEmpty()) continue;
                seen.add(id);
                if (!primed || already.contains(id) || shown >= MAX_ALERTS || InboxWatch.suppressed(prefs, conversationId, kind)) continue;
                show(context, row);
                shown += 1;
            }
            prefs.edit().putStringSet("seen", seen).putBoolean("primed", true).apply();
        } catch (Exception error) {
            // A bad payload waits for the next check.
        }
    }

    private static void show(Context context, JSONObject row) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || MainActivity.foreground) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "الرسائل", NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
        String conversationId = row.optString("conversationId");
        String messageId = row.optString("id");
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("chatxConversation", conversationId);
        open.putExtra("chatxMessage", messageId);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            messageId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String title = row.optString("senderName", "");
        if (title.isEmpty()) title = "ChatX";
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL)
            : new Notification.Builder(context);
        builder.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(row.optString("preview", ""))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) builder.setPriority(Notification.PRIORITY_HIGH);
        manager.notify(messageId.hashCode(), builder.build());
    }

    private static String request(String address, String cookie) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Cookie", cookie);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            if (connection.getResponseCode() != 200) return null;
            InputStream stream = connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = stream.read(chunk)) >= 0) {
                if (buffer.size() > 200_000) return null;
                buffer.write(chunk, 0, read);
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}

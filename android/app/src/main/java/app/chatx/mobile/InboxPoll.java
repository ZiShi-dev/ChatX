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
    private static String validatedScope = "";
    private static String validatedEtag = "";

    private InboxPoll() {}

    static void run(Context context) {
        long lease = InboxLifecycle.begin();
        if (lease < 0) return;
        try { check(context, lease); } finally { InboxLifecycle.end(); }
    }

    private static void check(Context context, long lease) {
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
        if (!InboxLifecycle.current(lease)) { validatedEtag = ""; return; }
        if (body == null) return;
        try {
            JSONArray rows = new JSONObject(body).optJSONArray("notifications");
            if (rows == null) return;
            boolean primed = prefs.getBoolean("primed", false);
            Set<String> already = InboxWatch.seen(prefs);
            Set<String> seen = new HashSet<>(already);
            int shown = 0;
            for (int index = 0; index < rows.length() && InboxLifecycle.current(lease); index += 1) {
                JSONObject row = rows.optJSONObject(index);
                if (row == null || !row.optBoolean("unread")) continue;
                String id = row.optString("id", "");
                String conversationId = row.optString("conversationId", "");
                String kind = row.optString("kind", "");
                if (id.isEmpty() || conversationId.isEmpty()) continue;
                if (!primed || already.contains(id) || InboxWatch.suppressed(prefs, conversationId, kind)) {
                    seen.add(id);
                    continue;
                }
                if (shown >= MAX_ALERTS) { validatedEtag = ""; continue; }
                if (!show(context, row, lease)) continue;
                seen.add(id);
                shown += 1;
            }
            synchronized (InboxLifecycle.LOCK) {
                if (InboxLifecycle.current(lease)) InboxWatch.markSeen(context, seen);
                else validatedEtag = "";
            }
        } catch (Exception error) {
            validatedEtag = "";
            // A bad payload waits for the next check.
        }
    }

    private static boolean show(Context context, JSONObject row, long lease) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !InboxLifecycle.current(lease)) return false;
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
        synchronized (InboxLifecycle.LOCK) {
            synchronized (InboxWatch.class) {
                if (!InboxLifecycle.current(lease) || InboxWatch.seen(InboxWatch.prefs(context)).contains(messageId)) return false;
                manager.notify(messageId.hashCode(), builder.build());
                InboxWatch.markSeen(context, java.util.Collections.singleton(messageId));
            }
        }
        return true;
    }

    private static String request(String address, String cookie) {
        HttpURLConnection connection = null;
        try {
            String scope = address + "\n" + cookie;
            if (!scope.equals(validatedScope)) {
                validatedScope = scope;
                validatedEtag = "";
            }
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Cookie", cookie);
            if (!validatedEtag.isEmpty()) connection.setRequestProperty("If-None-Match", validatedEtag);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            int status = connection.getResponseCode();
            if (status == 304) return null;
            if (status != 200) { validatedEtag = ""; return null; }
            InputStream stream = connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = stream.read(chunk)) >= 0) {
                if (buffer.size() > 200_000) return null;
                buffer.write(chunk, 0, read);
            }
            String body = buffer.toString(StandardCharsets.UTF_8.name());
            if (new JSONObject(body).optJSONArray("notifications") == null) return null;
            String etag = connection.getHeaderField("ETag");
            validatedEtag = etag == null ? "" : etag;
            return body;
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}

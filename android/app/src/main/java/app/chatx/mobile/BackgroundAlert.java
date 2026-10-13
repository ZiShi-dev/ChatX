package app.chatx.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;
import java.util.List;

/** Posts the tray alert FCM skips when it mistakes a background process for the open app. */
final class BackgroundAlert {
    private static final String CHANNEL = "chatx-messages";

    private BackgroundAlert() {}

    static boolean shouldPost(boolean activityVisible) {
        return !activityVisible;
    }

    static void show(Context context, String title, String body, String conversationId, String messageId) {
        show(context, title, body, conversationId, messageId, false);
    }

    static synchronized void show(Context context, String title, String body, String conversationId, String messageId, boolean important) {
        if (!shouldPost(MainActivity.foreground)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "الرسائل", NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        String heading = title == null || title.trim().isEmpty() ? "ChatX" : title.trim();
        String text = body == null || body.trim().isEmpty() ? "رسالة جديدة" : body.trim();
        String id = messageId == null ? "" : messageId;
        Intent open = new Intent(context, MainActivity.class);
        if (!conversationId.isEmpty()) open.putExtra("chatxConversation", conversationId);
        if (!id.isEmpty()) open.putExtra("chatxMessage", id);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            conversationId.isEmpty() ? heading.hashCode() : conversationId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL)
            : new Notification.Builder(context);
        String tag = conversationId.isEmpty() ? "chatx" : conversationId;
        List<CharSequence> lines = new ArrayList<>();
        int count = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                if (!tag.equals(active.getTag())) continue;
                Bundle previous = active.getNotification().extras;
                if (!id.isEmpty() && id.equals(previous.getString("messageId"))) return;
                count = previous.getInt("chatxCount", 1);
                CharSequence[] history = previous.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if (history != null) for (CharSequence line : history) lines.add(line);
            }
        }
        lines.add(text);
        while (lines.size() > 5) lines.remove(0);
        Notification.InboxStyle style = new Notification.InboxStyle();
        for (CharSequence line : lines) style.addLine(line);
        if (count > 0) style.setSummaryText((count + 1) + " رسائل");
        Bundle extras = new Bundle();
        extras.putString("messageId", id);
        extras.putString("conversationId", conversationId);
        extras.putInt("chatxCount", count + 1);
        android.graphics.Bitmap photo = InboxWatch.avatar(context, conversationId);
        if (photo != null) builder.setLargeIcon(photo);
        builder.setSmallIcon(R.drawable.ic_stat_chatx)
            .setContentTitle(heading)
            .setContentText(text)
            .setStyle(style)
            .addExtras(extras)
            .setNumber(count + 1)
            .setOnlyAlertOnce(!important)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setContentIntent(pending)
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        manager.notify(tag, tag.hashCode(), builder.build());
    }
}

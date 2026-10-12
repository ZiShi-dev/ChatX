package app.chatx.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Posts the tray alert FCM skips when it mistakes a background process for the open app. */
final class BackgroundAlert {
    private static final String CHANNEL = "chatx-messages";

    private BackgroundAlert() {}

    static boolean shouldPost(boolean activityVisible) {
        return !activityVisible;
    }

    static void show(Context context, String title, String body, String conversationId, String messageId) {
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
            id.isEmpty() ? heading.hashCode() : id.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL)
            : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_stat_chatx)
            .setContentTitle(heading)
            .setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setContentIntent(pending)
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        String tag = id.isEmpty() ? "chatx" : id;
        manager.notify(tag, tag.hashCode(), builder.build());
    }
}

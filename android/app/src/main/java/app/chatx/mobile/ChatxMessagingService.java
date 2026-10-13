package app.chatx.mobile;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Replaces the plugin service so a background message still reaches the notification tray. */
public class ChatxMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        if (BackgroundAlert.shouldPost(MainActivity.foreground)) {
            RemoteMessage.Notification notification = remoteMessage.getNotification();
            Map<String, String> data = remoteMessage.getData();
            String title = notification != null && notification.getTitle() != null ? notification.getTitle() : data.get("title");
            String body = notification != null && notification.getBody() != null ? notification.getBody() : data.get("body");
            String conversationId = data.get("conversationId");
            String roomId = conversationId == null ? "" : conversationId;
            String messageId = data.get("messageId");
            String sealed = data.get("sealed");
            String preview = sealed == null ? null : InboxPoll.openSealed(this, roomId, messageId == null ? "" : messageId, sealed);
            String sender = data.get("senderName");
            if (preview != null && !preview.isEmpty()) {
                preview = preview.replaceAll("\\s+", " ").trim();
                if (preview.length() > 240) preview = preview.substring(0, 240) + "…";
                body = sender == null || sender.isEmpty() ? preview : sender + ": " + preview;
            }
            String kind = data.get("kind");
            String label = "mention".equals(kind) ? "إشارة إليك" : "everyone".equals(kind) ? "إشارة للجميع" : "reply".equals(kind) ? "رد على رسالتك" : "";
            if (!label.isEmpty() && (title == null || !title.endsWith(label))) title = (title == null ? "ChatX" : title) + " · " + label;
            BackgroundAlert.show(this, title, body, roomId, messageId, !label.isEmpty());
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}

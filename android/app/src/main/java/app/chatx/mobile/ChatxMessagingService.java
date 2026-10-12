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
            BackgroundAlert.show(this, title, body, conversationId == null ? "" : conversationId, data.get("messageId"));
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}

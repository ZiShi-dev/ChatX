package app.chatx.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

public class InboxAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !InboxWatch.ACTION.equals(intent.getAction())) return;
        PendingResult pending = goAsync();
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock lock = power == null ? null : power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chatx:inbox");
        if (lock != null) lock.acquire(15_000L);
        new Thread(() -> {
            try {
                InboxPoll.run(context.getApplicationContext());
            } finally {
                InboxWatch.schedule(context.getApplicationContext());
                if (lock != null && lock.isHeld()) lock.release();
                pending.finish();
            }
        }).start();
    }
}

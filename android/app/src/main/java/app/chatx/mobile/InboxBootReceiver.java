package app.chatx.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class InboxBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        InboxWatch.schedule(context.getApplicationContext());
    }
}

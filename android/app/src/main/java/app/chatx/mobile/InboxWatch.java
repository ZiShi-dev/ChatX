package app.chatx.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class InboxWatch {
    static final String PREFS = "chatx.inbox";
    static final String ACTION = "app.chatx.mobile.INBOX_CHECK";
    private static final long INTERVAL_MS = 120_000L;

    private InboxWatch() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void remember(Context context, String origin, String quiet, String hiddenKinds) {
        if (origin == null || !origin.startsWith("https://")) return;
        prefs(context).edit()
            .putString("origin", origin.replaceAll("/$", ""))
            .putString("quiet", quiet == null ? "" : quiet)
            .putString("hiddenKinds", hiddenKinds == null ? "" : hiddenKinds)
            .putBoolean("armed", true)
            .apply();
        if (!pending(context)) schedule(context);
    }

    static void stop(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(broadcast(context));
        prefs(context).edit().clear().apply();
    }

    static void schedule(Context context) {
        if (!prefs(context).getBoolean("armed", false)) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long at = System.currentTimeMillis() + INTERVAL_MS;
        PendingIntent intent = broadcast(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
            return;
        }
        alarms.set(AlarmManager.RTC_WAKEUP, at, intent);
    }

    static boolean suppressed(SharedPreferences prefs, String conversationId, String kind) {
        String hidden = prefs.getString("hiddenKinds", "");
        if (hidden != null && kind != null) {
            for (String item : hidden.split(",")) {
                if (kind.equals(item)) return true;
            }
        }
        String quiet = prefs.getString("quiet", "");
        if (quiet == null || conversationId == null) return false;
        String level = "";
        for (String item : quiet.split(",")) {
            int mark = item.indexOf('=');
            if (mark > 0 && conversationId.equals(item.substring(0, mark))) level = item.substring(mark + 1);
        }
        if ("none".equals(level)) return true;
        if ("mentions".equals(level)) return !"mention".equals(kind) && !"reply".equals(kind);
        if ("everyone".equals(level)) return !"everyone".equals(kind) && !"mention".equals(kind);
        if (level.startsWith("off:")) {
            String blocked = "." + level.substring(4) + ".";
            return kind != null && blocked.contains("." + kind + ".");
        }
        return false;
    }

    static Set<String> seen(SharedPreferences prefs) {
        Set<String> stored = prefs.getStringSet("seen", Collections.emptySet());
        return new HashSet<>(stored == null ? Collections.emptySet() : stored);
    }

    private static boolean pending(Context context) {
        return PendingIntent.getBroadcast(
            context,
            0,
            new Intent(context, InboxAlarmReceiver.class).setAction(ACTION),
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        ) != null;
    }

    private static PendingIntent broadcast(Context context) {
        Intent intent = new Intent(context, InboxAlarmReceiver.class).setAction(ACTION);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}

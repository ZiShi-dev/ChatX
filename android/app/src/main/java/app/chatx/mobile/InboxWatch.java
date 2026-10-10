package app.chatx.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Build;
import android.webkit.CookieManager;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

final class InboxWatch {
    static final String PREFS = "chatx.inbox";
    static final String KEYS = "chatx.roomkeys";
    static final String ACTION = "app.chatx.mobile.INBOX_CHECK";
    /** Background inbox poll; longer saves battery and mobile data. */
    private static final long INTERVAL_MS = 45_000L;
    private static final Pattern ID = Pattern.compile("^[0-9a-f-]{36}$", Pattern.CASE_INSENSITIVE);

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
        try {
            String cookie = CookieManager.getInstance().getCookie(origin);
            if (cookie != null && cookie.contains("chatx_session=")) {
                prefs(context).edit().putString("cookie", cookie).commit();
            }
            CookieManager.getInstance().flush();
        } catch (RuntimeException error) {
            // The next open retries. A missing flush must not block the alarm.
        }
        if (!pending(context)) schedule(context);
    }

    static SharedPreferences keyPrefs(Context context) {
        return context.getSharedPreferences(KEYS, Context.MODE_PRIVATE);
    }

    static void rememberKeys(Context context, JSONArray rows) {
        if (rows == null) return;
        JSONObject map = new JSONObject();
        try {
            for (int index = 0; index < rows.length() && map.length() < 200; index += 1) {
                JSONObject row = rows.optJSONObject(index);
                if (row == null) continue;
                String roomId = row.optString("roomId", "");
                String keyId = row.optString("keyId", "");
                String raw = row.optString("raw", "");
                byte[] bytes = base64Url(raw);
                if (!ID.matcher(roomId).matches() || !ID.matcher(keyId).matches() || bytes == null || bytes.length != 32) continue;
                map.put(roomId + ":" + keyId, raw);
            }
            keyPrefs(context).edit().putString("keys", map.toString()).apply();
        } catch (Exception error) {
            // The next open retries with the same keys.
        }
    }

    static byte[] roomKey(Context context, String roomId, String keyId) {
        String stored = keyPrefs(context).getString("keys", "");
        if (stored == null || stored.isEmpty()) return null;
        try {
            String raw = new JSONObject(stored).optString(roomId + ":" + keyId, "");
            byte[] bytes = base64Url(raw);
            return bytes != null && bytes.length == 32 ? bytes : null;
        } catch (Exception error) {
            return null;
        }
    }

    static byte[] base64Url(String value) {
        if (value == null || value.isEmpty()) return null;
        try {
            int pad = (4 - value.length() % 4) % 4;
            String padded = pad == 0 ? value : value + "====".substring(0, pad);
            return Base64.decode(padded, Base64.URL_SAFE | Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    static void rememberAvatars(Context context, JSONArray rows) {
        if (rows == null) return;
        File dir = avatarDir(context);
        if (!dir.isDirectory() && !dir.mkdirs()) return;
        Set<String> keep = new HashSet<>();
        for (int index = 0; index < rows.length() && keep.size() < 40; index += 1) {
            JSONObject row = rows.optJSONObject(index);
            if (row == null) continue;
            String id = row.optString("conversationId", "");
            String jpeg = row.optString("jpeg", "");
            File file = new File(dir, id + ".jpg");
            if (!ID.matcher(id).matches() || jpeg.length() < 8 || jpeg.length() > 80_000) continue;
            byte[] bytes;
            try {
                bytes = Base64.decode(jpeg, Base64.DEFAULT);
            } catch (IllegalArgumentException error) {
                file.delete();
                continue;
            }
            if (bytes.length < 4 || bytes.length > 60_000 || (bytes[0] & 0xff) != 0xff || (bytes[1] & 0xff) != 0xd8) {
                file.delete();
                continue;
            }
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
                keep.add(id);
            } catch (IOException error) {
                // The next open retries.
            }
        }
        File[] existing = dir.listFiles();
        if (existing == null) return;
        for (File file : existing) {
            String name = file.getName();
            if (!name.endsWith(".jpg") || !keep.contains(name.substring(0, name.length() - 4))) file.delete();
        }
    }

    static Bitmap avatar(Context context, String conversationId) {
        if (conversationId == null || !ID.matcher(conversationId).matches()) return null;
        File file = new File(avatarDir(context), conversationId + ".jpg");
        if (!file.isFile() || file.length() <= 0 || file.length() > 60_000) return null;
        Bitmap source = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (source == null || source.getWidth() < 1 || source.getHeight() < 1) return null;
        int size = 128;
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        BitmapShader shader = new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        float scale = size / (float) Math.min(source.getWidth(), source.getHeight());
        Matrix matrix = new Matrix();
        matrix.setScale(scale, scale);
        matrix.postTranslate((size - source.getWidth() * scale) / 2f, (size - source.getHeight() * scale) / 2f);
        shader.setLocalMatrix(matrix);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(shader);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        if (source != out) source.recycle();
        return out;
    }

    private static File avatarDir(Context context) {
        return new File(context.getFilesDir(), "notif-avatars");
    }

    private static void clearAvatars(Context context) {
        File dir = avatarDir(context);
        File[] files = dir.listFiles();
        if (files != null) for (File file : files) file.delete();
        dir.delete();
    }

    static void stop(Context context) {
        InboxLifecycle.invalidate();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(broadcast(context));
        prefs(context).edit().clear().apply();
        keyPrefs(context).edit().clear().apply();
        clearAvatars(context);
    }

    static void pauseAlarm(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(broadcast(context));
    }

    static void schedule(Context context) {
        if (MainActivity.foreground) return;
        if (!prefs(context).getBoolean("armed", false)) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long at = System.currentTimeMillis() + Math.max(INTERVAL_MS, prefs(context).getLong("retryAt", 0) - System.currentTimeMillis());
        PendingIntent intent = broadcast(context);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarms.canScheduleExactAlarms()) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
                return;
            }
        } catch (SecurityException error) {
            // The inexact alarm below still runs when exact alarms are not allowed.
        }
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

    static synchronized void markSeen(Context context, Set<String> incoming) {
        SharedPreferences prefs = prefs(context);
        Set<String> merged = seen(prefs);
        merged.addAll(incoming);
        if (merged.size() > 400) {
            Set<String> bounded = new HashSet<>();
            for (String id : incoming) { if (bounded.size() >= 400) break; bounded.add(id); }
            for (String id : merged) { if (bounded.size() >= 400) break; bounded.add(id); }
            merged = bounded;
        }
        prefs.edit().putStringSet("seen", new HashSet<>(merged)).putBoolean("primed", true).apply();
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

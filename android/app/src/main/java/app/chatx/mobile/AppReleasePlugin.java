package app.chatx.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Locale;

@CapacitorPlugin(name = "AppRelease")
public class AppReleasePlugin extends Plugin {
    private static final int MAX_BYTES = 80 * 1024 * 1024;
    private File pendingApk;

    @PluginMethod
    public void installApk(PluginCall call) {
        String url = call.getString("url", "");
        String sha256 = call.getString("sha256", "");
        String signature = call.getString("signature", "");
        Integer versionCode = call.getInt("versionCode");
        if (versionCode == null || versionCode < 1 || versionCode > 1_000_000
            || !sha256.matches("[a-f0-9]{64}")
            || !signature.matches("[A-Za-z0-9+/=]{64,1024}")
            || !httpsApk(url)) {
            call.reject("invalid");
            return;
        }
        int expectedVersion = versionCode;
        getBridge().execute(() -> {
            File file = null;
            try {
                file = download(url, sha256, signature, expectedVersion);
                File verified = file;
                Activity activity = getActivity();
                if (activity == null) {
                    call.reject("unavailable");
                    return;
                }
                activity.runOnUiThread(() -> offerInstall(call, verified));
            } catch (Exception error) {
                if (file != null) file.delete();
                String message = error.getMessage() == null ? "" : error.getMessage();
                if (!"invalid".equals(message) && !"signature".equals(message)) message = "download_failed";
                call.reject(message);
            }
        });
    }

    private void offerInstall(PluginCall call, File file) {
        pendingApk = file;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, settings, "installPermissionResult");
            return;
        }
        launchInstaller(call, file);
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("install_permission");
            return;
        }
        File file = pendingApk;
        if (file == null || !file.isFile()) {
            call.reject("download_failed");
            return;
        }
        launchInstaller(call, file);
    }

    private void launchInstaller(PluginCall call, File file) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("ChatX", uri));
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("unavailable");
                return;
            }
            activity.startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("unavailable");
        }
    }

    private File download(String url, String expectedHash, String signature, int versionCode) throws Exception {
        File directory = new File(getContext().getCacheDir(), "app-release");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("download_failed");
        File previous = new File(directory, "chatx-update.apk");
        if (previous.exists() && !previous.delete()) throw new IllegalStateException("download_failed");
        File partial = new File(directory, "chatx-update.part");
        if (partial.exists()) partial.delete();
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(180_000);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("download_failed");
            long advertised = connection.getContentLengthLong();
            if (advertised > MAX_BYTES) throw new IllegalStateException("download_failed");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                byte[] buffer = new byte[8192];
                int count;
                int total = 0;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_BYTES) throw new IllegalStateException("download_failed");
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
            }
            if (!sameHash(digest.digest(), expectedHash) || !verifySignature(partial, signature)) {
                partial.delete();
                throw new IllegalStateException("signature");
            }
            if (!partial.renameTo(previous)) throw new IllegalStateException("download_failed");
            assertPackage(previous, versionCode);
            return previous;
        } finally {
            connection.disconnect();
        }
    }

    private void assertPackage(File file, int expectedVersion) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        PackageInfo archive = readArchive(manager, file.getAbsolutePath());
        if (archive == null || !"app.chatx.mobile".equals(archive.packageName)) throw new IllegalStateException("invalid");
        if (PackageInfoCompat.getLongVersionCode(archive) != expectedVersion) throw new IllegalStateException("invalid");
        PackageInfo installed = manager.getPackageInfo(getContext().getPackageName(), 0);
        if (expectedVersion <= PackageInfoCompat.getLongVersionCode(installed)) throw new IllegalStateException("invalid");
    }

    private PackageInfo readArchive(PackageManager manager, String path) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return manager.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(0));
        }
        return manager.getPackageArchiveInfo(path, 0);
    }

    private boolean verifySignature(File file, String signature) throws Exception {
        String key = getContext().getString(R.string.update_public_key)
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\n", "")
            .replace("\r", "");
        byte[] encoded = Base64.decode(key, Base64.DEFAULT);
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(encoded)));
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) verifier.update(buffer, 0, count);
        }
        return verifier.verify(Base64.decode(signature, Base64.DEFAULT));
    }

    private boolean sameHash(byte[] digest, String expected) {
        StringBuilder builder = new StringBuilder(digest.length * 2);
        for (byte value : digest) builder.append(String.format(Locale.US, "%02x", value));
        return MessageDigest.isEqual(builder.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII), expected.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }

    private boolean httpsApk(String url) {
        if (url.length() > 500) return false;
        try {
            URL parsed = new URL(url);
            String host = parsed.getHost();
            return "https".equals(parsed.getProtocol())
                && parsed.getUserInfo() == null
                && host != null
                && !host.isEmpty()
                && parsed.getPath().matches("/app/releases/apk/[A-Za-z0-9._-]{1,80}\\.apk");
        } catch (Exception error) {
            return false;
        }
    }
}

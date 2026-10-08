package app.chatx.mobile;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import androidx.annotation.NonNull;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(
    name = "StorageAccess",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = StorageAccessPlugin.READ_EXTERNAL_STORAGE),
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = StorageAccessPlugin.READ_MEDIA_IMAGES),
        @Permission(strings = { Manifest.permission.READ_MEDIA_VIDEO }, alias = StorageAccessPlugin.READ_MEDIA_VIDEO),
        @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = StorageAccessPlugin.READ_MEDIA_AUDIO)
    }
)
public class StorageAccessPlugin extends Plugin {

    static final String READ_EXTERNAL_STORAGE = "readExternalStorage";
    static final String READ_MEDIA_IMAGES = "readMediaImages";
    static final String READ_MEDIA_VIDEO = "readMediaVideo";
    static final String READ_MEDIA_AUDIO = "readMediaAudio";

    private static final int MAX_FILES = 50;
    private static final int MAX_ENTRIES = 200;

    @PluginMethod
    public void requestAccess(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            aliases.add(READ_MEDIA_IMAGES);
            aliases.add(READ_MEDIA_VIDEO);
            aliases.add(READ_MEDIA_AUDIO);
        } else {
            aliases.add(READ_EXTERNAL_STORAGE);
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasStorageAccess());
        call.resolve(result);
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Directory path is missing.");
            return;
        }
        DocumentFile directory = DocumentFile.fromTreeUri(getContext(), Uri.parse(path));
        if (directory == null || !directory.exists()) {
            call.reject("Directory is unavailable.");
            return;
        }
        JSArray files = new JSArray();
        collectFiles(directory, files, 0);
        JSObject result = new JSObject();
        result.put("files", files);
        call.resolve(result);
    }

    @PluginMethod
    public void listEntries(PluginCall call) {
        String path = call.getString("path", "");
        if (path == null) path = "";
        JSArray entries = new JSArray();
        try {
            if (path.isEmpty()) {
                addMediaRoot(entries, "الصور", "media:images");
                addMediaRoot(entries, "الفيديو", "media:videos");
                addMediaRoot(entries, "الصوت", "media:audio");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) addMediaRoot(entries, "التنزيلات", "media:downloads");
                addMediaRoot(entries, "المستندات", "media:files");
                addReadableDir(entries, Environment.DIRECTORY_DCIM);
                addReadableDir(entries, Environment.DIRECTORY_PICTURES);
                addReadableDir(entries, Environment.DIRECTORY_DOWNLOADS);
                addReadableDir(entries, Environment.DIRECTORY_DOCUMENTS);
                addReadableDir(entries, Environment.DIRECTORY_MOVIES);
            } else if (path.startsWith("media:")) {
                listMedia(entries, path.substring("media:".length()));
            } else if (path.startsWith("content://")) {
                listTree(entries, path);
            } else {
                listFileDir(entries, path);
            }
            JSObject result = new JSObject();
            result.put("entries", entries);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to list directory.", error);
        }
    }

    private boolean hasStorageAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return isGranted(READ_MEDIA_IMAGES) || isGranted(READ_MEDIA_VIDEO) || isGranted(READ_MEDIA_AUDIO);
        }
        return isGranted(READ_EXTERNAL_STORAGE);
    }

    private boolean isGranted(String alias) {
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    private void addMediaRoot(@NonNull JSArray entries, @NonNull String name, @NonNull String path) {
        entries.put(directoryEntry(name, path));
    }

    private void addReadableDir(@NonNull JSArray entries, @NonNull String type) {
        File dir = Environment.getExternalStoragePublicDirectory(type);
        if (dir == null || !dir.isDirectory() || dir.listFiles() == null) return;
        entries.put(directoryEntry(dir.getName(), dir.getAbsolutePath()));
    }

    private void listFileDir(@NonNull JSArray entries, @NonNull String path) {
        File dir = new File(path);
        File[] children = dir.listFiles();
        if (children == null) throw new IllegalStateException("Directory is unavailable.");
        Arrays.sort(children, (left, right) -> {
            if (left.isDirectory() != right.isDirectory()) return left.isDirectory() ? -1 : 1;
            return left.getName().compareToIgnoreCase(right.getName());
        });
        int count = 0;
        for (File child : children) {
            if (count >= MAX_ENTRIES) return;
            if (child.getName().startsWith(".")) continue;
            count++;
            if (child.isDirectory()) {
                entries.put(directoryEntry(child.getName(), child.getAbsolutePath()));
                continue;
            }
            String mime = mimeFromName(child.getName());
            entries.put(fileEntry(child.getName(), mime, child.length(), child.getAbsolutePath(), toWebPath(Uri.fromFile(child))));
        }
    }

    private void listTree(@NonNull JSArray entries, @NonNull String path) {
        DocumentFile directory = DocumentFile.fromTreeUri(getContext(), Uri.parse(path));
        if (directory == null || !directory.isDirectory()) throw new IllegalStateException("Directory is unavailable.");
        DocumentFile[] children = directory.listFiles();
        if (children == null) return;
        int count = 0;
        for (DocumentFile child : children) {
            if (count >= MAX_ENTRIES) return;
            String name = child.getName() == null ? "ملف" : child.getName();
            if (name.startsWith(".")) continue;
            count++;
            Uri uri = child.getUri();
            if (child.isDirectory()) {
                entries.put(directoryEntry(name, uri.toString()));
                continue;
            }
            String mime = child.getType() == null ? "application/octet-stream" : child.getType();
            entries.put(fileEntry(name, mime, Math.max(child.length(), 0), uri.toString(), toWebPath(uri)));
        }
    }

    private void listMedia(@NonNull JSArray entries, @NonNull String spec) {
        String kind = spec;
        String relative = "";
        int slash = spec.indexOf('/');
        if (slash >= 0) {
            kind = spec.substring(0, slash);
            relative = spec.substring(slash + 1);
        }
        Uri uri = uriFor(kind);
        if (uri == null) return;
        boolean modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        String locationColumn = modern ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA;
        String[] projection = new String[] {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            locationColumn
        };
        try (Cursor cursor = getContext().getContentResolver().query(
            uri,
            projection,
            null,
            null,
            MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
        )) {
            if (cursor == null) return;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
            int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
            int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
            int locationCol = cursor.getColumnIndexOrThrow(locationColumn);
            Set<String> folders = new HashSet<>();
            int files = 0;
            while (cursor.moveToNext() && folders.size() + files < MAX_ENTRIES * 2) {
                String location = cursor.isNull(locationCol) ? "" : cursor.getString(locationCol);
                String rel = modern ? (location == null ? "" : location) : parentFolder(location);
                if (!relative.isEmpty() && !rel.equals(relative) && !rel.startsWith(relative)) continue;
                if (relative.isEmpty() && !rel.isEmpty()) {
                    if (folders.add(rel)) entries.put(directoryEntry(folderLabel(rel), "media:" + kind + "/" + rel));
                    continue;
                }
                if (!relative.isEmpty() && !rel.equals(relative)) {
                    String rest = rel.substring(relative.length());
                    int cut = rest.indexOf('/');
                    String next = cut < 0 ? rest : rest.substring(0, cut + 1);
                    String child = relative + next;
                    if (folders.add(child)) entries.put(directoryEntry(folderLabel(child), "media:" + kind + "/" + child));
                    continue;
                }
                if (files >= MAX_ENTRIES) continue;
                long id = cursor.getLong(idCol);
                String name = cursor.getString(nameCol);
                String mime = cursor.isNull(mimeCol) ? mimeFromName(name) : cursor.getString(mimeCol);
                long size = cursor.isNull(sizeCol) ? 0 : cursor.getLong(sizeCol);
                Uri item = ContentUris.withAppendedId(uri, id);
                entries.put(fileEntry(name, mime, size, item.toString(), toWebPath(item)));
                files++;
            }
        } catch (SecurityException ignored) {
            return;
        }
    }

    private Uri uriFor(String kind) {
        switch (kind) {
            case "images":
                return MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            case "videos":
                return MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            case "audio":
                return MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            case "downloads":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                return null;
            case "files":
                return MediaStore.Files.getContentUri("external");
            default:
                return null;
        }
    }

    private String parentFolder(String dataPath) {
        if (dataPath == null || dataPath.isEmpty()) return "";
        File parent = new File(dataPath).getParentFile();
        if (parent == null) return "";
        return parent.getName() + "/";
    }

    private String folderLabel(String relative) {
        String trimmed = relative.endsWith("/") ? relative.substring(0, relative.length() - 1) : relative;
        int slash = trimmed.lastIndexOf('/');
        String label = slash >= 0 ? trimmed.substring(slash + 1) : trimmed;
        return label.isEmpty() ? "مجلد" : label;
    }

    private String mimeFromName(String name) {
        if (name == null) return "application/octet-stream";
        int dot = name.lastIndexOf('.');
        if (dot < 0) return "application/octet-stream";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
        return mime == null ? "application/octet-stream" : mime;
    }

    private JSObject directoryEntry(String name, String path) {
        JSObject entry = new JSObject();
        entry.put("name", name == null || name.isEmpty() ? "مجلد" : name);
        entry.put("kind", "directory");
        entry.put("mimeType", "");
        entry.put("size", 0);
        entry.put("path", path);
        return entry;
    }

    private JSObject fileEntry(String name, String mime, long size, String path, String webPath) {
        JSObject entry = new JSObject();
        entry.put("name", name == null || name.isEmpty() ? "ملف" : name);
        entry.put("kind", "file");
        entry.put("mimeType", mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        entry.put("size", Math.max(size, 0));
        entry.put("path", path);
        if (webPath != null) entry.put("webPath", webPath);
        return entry;
    }

    private void collectFiles(@NonNull DocumentFile directory, @NonNull JSArray files, int depth) {
        if (depth > 3 || files.length() >= MAX_FILES) return;
        DocumentFile[] children = directory.listFiles();
        if (children == null) return;
        for (DocumentFile child : children) {
            if (files.length() >= MAX_FILES) return;
            if (child.isDirectory()) {
                collectFiles(child, files, depth + 1);
                continue;
            }
            Uri uri = child.getUri();
            JSObject file = new JSObject();
            file.put("name", child.getName() == null ? "file" : child.getName());
            file.put("mimeType", child.getType() == null ? "application/octet-stream" : child.getType());
            file.put("size", Math.max(child.length(), 0));
            file.put("path", uri.toString());
            file.put("webPath", toWebPath(uri));
            files.put(file);
        }
    }

    private String toWebPath(@NonNull Uri uri) {
        String value = uri.toString();
        if ("content".equals(uri.getScheme())) {
            return getBridge().getLocalUrl() + value.replaceFirst("content:/", "/_capacitor_content_");
        }
        if ("file".equals(uri.getScheme())) {
            return getBridge().getLocalUrl() + value.replaceFirst("file://", "/_capacitor_file_");
        }
        return value;
    }
}

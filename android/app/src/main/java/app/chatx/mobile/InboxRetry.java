package app.chatx.mobile;

/** Bounded retry timing, independent of Android so offline behavior can be tested. */
final class InboxRetry {
    private InboxRetry() {}
    static long delay(int failures, String retryAfter, long now) {
        long base = Math.min(900_000L, 30_000L << Math.min(Math.max(failures - 1, 0), 5));
        long requested = 0;
        try { requested = Math.min(86_400L, Math.max(0, Long.parseLong(retryAfter.trim()))) * 1000L; }
        catch (Exception ignored) {
            try {
                java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("EEE, d MMM yyyy HH:mm:ss z", java.util.Locale.US);
                format.setLenient(false);
                requested = Math.max(0, format.parse(retryAfter).getTime() - now);
            }
            catch (Exception invalid) { /* Missing or invalid header uses the bounded backoff. */ }
        }
        return Math.max(base, Math.min(86_400_000L, requested));
    }
}

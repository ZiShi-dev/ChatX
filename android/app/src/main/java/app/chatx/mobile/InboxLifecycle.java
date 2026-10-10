package app.chatx.mobile;

/** A response belongs to one background period, never to a later pause. */
final class InboxLifecycle {
    static final Object LOCK = new Object();
    private static long generation;
    private static boolean foreground;
    private static boolean running;
    private InboxLifecycle() {}
    static void foreground(boolean value) {
        synchronized (LOCK) { foreground = value; generation++; }
    }
    static long begin() {
        synchronized (LOCK) {
            if (foreground || running) return -1;
            running = true;
            return generation;
        }
    }
    static boolean current(long lease) {
        synchronized (LOCK) { return !foreground && generation == lease; }
    }
    static void end() { synchronized (LOCK) { running = false; } }
    static void invalidate() { synchronized (LOCK) { generation++; } }
}

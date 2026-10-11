package app.chatx.mobile;

/** Inbox entries and unread counts are independent from interrupting system alerts. */
final class InboxAlertPolicy {
    private InboxAlertPolicy() {}
    static boolean allows(String kind, String conversationType) {
        return "mention".equals(kind) || "everyone".equals(kind) || "reply".equals(kind)
            || ("message".equals(kind) && "private".equals(conversationType));
    }
}

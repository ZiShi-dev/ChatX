package app.chatx.mobile;
import org.junit.Test;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;

public class InboxAlertPolicyTest {
    @Test public void allowsMentionsRepliesAndPrivateMessages() {
        for (String room : new String[] { "private", "group", "global" }) {
            assertTrue(InboxAlertPolicy.allows("mention", room));
            assertTrue(InboxAlertPolicy.allows("everyone", room));
            assertTrue(InboxAlertPolicy.allows("reply", room));
        }
        assertTrue(InboxAlertPolicy.allows("message", "private"));
    }
    @Test public void allowsGroupMessagesAndKeepsOtherEventsInTheInboxOnly() {
        assertTrue(InboxAlertPolicy.allows("message", "group"));
        assertTrue(InboxAlertPolicy.allows("message", "global"));
        assertTrue(InboxAlertPolicy.allows("message", ""));
        for (String room : new String[] { "private", "group", "global" }) {
            assertFalse(InboxAlertPolicy.allows("reaction", room));
            assertFalse(InboxAlertPolicy.allows("signal", room));
        }
    }
}

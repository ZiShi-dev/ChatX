package app.chatx.mobile;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class BackgroundAlertTest {
    @Test public void postsATrayAlertOnlyWhenTheScreenIsNotOnChatX() {
        assertTrue(BackgroundAlert.shouldPost(false));
        assertFalse(BackgroundAlert.shouldPost(true));
    }
}

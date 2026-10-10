package app.chatx.mobile;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
public class InboxRetryTest {
    @Test public void backsOffRepeatedFailuresWithABoundedDelay() {
        assertEquals(30_000L, InboxRetry.delay(1, null, 0));
        assertEquals(60_000L, InboxRetry.delay(2, null, 0));
        assertEquals(900_000L, InboxRetry.delay(20, null, 0));
    }
    @Test public void honorsServerRetryAfterAndRejectsInvalidValues() {
        assertEquals(90_000L, InboxRetry.delay(1, "90", 0));
        assertEquals(30_000L, InboxRetry.delay(1, "invalid", 0));
        assertEquals(86_400_000L, InboxRetry.delay(1, Long.toString(Long.MAX_VALUE), 0));
        assertEquals(90_000L, InboxRetry.delay(1, "Thu, 1 Jan 1970 00:01:30 GMT", 0));
    }
}

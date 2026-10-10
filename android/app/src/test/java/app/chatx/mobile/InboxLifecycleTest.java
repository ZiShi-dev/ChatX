package app.chatx.mobile;

import static org.junit.Assert.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Before;
import org.junit.Test;

public class InboxLifecycleTest {
    @Before public void reset() { InboxLifecycle.end(); InboxLifecycle.foreground(false); }
    @Test public void oldResponseCannotBelongToAnotherPause() {
        long old = InboxLifecycle.begin();
        assertTrue(InboxLifecycle.current(old));
        InboxLifecycle.foreground(true);
        assertFalse(InboxLifecycle.current(old));
        InboxLifecycle.foreground(false);
        assertFalse(InboxLifecycle.current(old));
        assertEquals(-1L, InboxLifecycle.begin());
        InboxLifecycle.end();
        long next = InboxLifecycle.begin();
        assertTrue(InboxLifecycle.current(next));
        InboxLifecycle.invalidate();
        assertFalse(InboxLifecycle.current(next));
    }
    @Test public void onlyOneConcurrentCheckStarts() throws Exception {
        CountDownLatch start = new CountDownLatch(1), done = new CountDownLatch(12);
        AtomicInteger started = new AtomicInteger();
        for (int index = 0; index < 12; index++) new Thread(() -> {
            try { start.await(); if (InboxLifecycle.begin() >= 0) started.incrementAndGet(); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            finally { done.countDown(); }
        }).start();
        start.countDown(); done.await(); assertEquals(1, started.get());
    }
    @Test public void foregroundDoesNotStartABackgroundCheck() {
        InboxLifecycle.foreground(true);
        assertEquals(-1L, InboxLifecycle.begin());
    }
}

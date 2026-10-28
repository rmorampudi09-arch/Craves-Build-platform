package in.craves.fleetengine.support;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class LatencyTest {
    @Test
    void quantilesAreBucketBoundsAndAWindowSeesOnlyItsPeriod() throws InterruptedException {
        Latency h = new Latency();
        Latency.Window all = h.window();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            threads.add(Thread.ofVirtual().start(() -> {
                for (int j = 0; j < 1000; j++) {
                    h.observe(j % 100);
                }
            }));
        }
        for (Thread t : threads) {
            t.join();
        }
        assertArrayEquals(new double[] {8000, 50, 100}, all.next(0.5, 0.99));

        Latency slow = new Latency();
        Latency.Window w = slow.window();
        slow.observe(60_000);
        assertArrayEquals(new double[] {1, 10_000}, w.next(0.99), "a value past the last bucket reads as the last bound");

        // A window sees only what came since its last read: one slow minute shows, however much came before.
        Latency busy = new Latency();
        for (int i = 0; i < 1000; i++) {
            busy.observe(3);
        }
        Latency.Window minute = busy.window();
        assertArrayEquals(new double[] {0, 0}, minute.next(0.99), "nothing new");
        busy.observe(700);
        assertArrayEquals(new double[] {1, 1_000, 1_000}, minute.next(0.5, 0.99));
    }
}

package in.craves.fleetengine;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class LiveRuntimeLockTest {
    @Test
    void theLockFileIsInTheBuildAndEveryListedClassIsPresent() {
        ClassLoader loader = LiveRuntimeLock.class.getClassLoader();
        assertTrue(LiveRuntimeLock.required(loader).isEmpty(), "the engine serves no API, so nothing is locked yet");
        assertDoesNotThrow(() -> LiveRuntimeLock.verify("prodlow", loader));
        assertDoesNotThrow(() -> LiveRuntimeLock.verify(null, loader));
    }
}

package in.craves.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LiveRuntimeLockTest {

    @Test
    void doesNothingOutsideProduction() {
        assertDoesNotThrow(() -> LiveRuntimeLock.verify(null, lock("in.craves.Missing")));
        assertDoesNotThrow(() -> LiveRuntimeLock.verify("local", lock(null)));
    }

    @Test
    void startsInProductionWhenEveryListedClassIsPresent() {
        assertDoesNotThrow(() -> LiveRuntimeLock.verify("prodlow", lock("# header\n\njava.lang.String   # note\n")));
    }

    @Test
    void refusesProductionWhenTheBuildLacksLiveCode() {
        var failure = assertThrows(IllegalStateException.class,
                () -> LiveRuntimeLock.verify("prodlow", lock("java.lang.String\nin.craves.auth.centralotp.Missing # live-only")));
        assertTrue(failure.getMessage().contains("in.craves.auth.centralotp.Missing"));
    }

    @Test
    void refusesProductionWhenTheLockFileIsMissing() {
        assertThrows(IllegalStateException.class, () -> LiveRuntimeLock.verify("prodlow", lock(null)));
    }

    private static ClassLoader lock(String content) {
        return new ClassLoader(LiveRuntimeLockTest.class.getClassLoader()) {
            @Override
            public InputStream getResourceAsStream(String name) {
                return content != null && LiveRuntimeLock.RESOURCE.equals(name)
                        ? new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)) : null;
            }
        };
    }
}

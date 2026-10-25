package in.craves.userchef;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Refuses to start in production when this build lacks code that production already runs
 * (listed in live-runtime-lock.txt). It runs before Spring and Flyway, so the database is untouched,
 * and a revision that never starts never takes traffic: the running revision keeps serving.
 * See docs/runbooks/live-runtime-safety.md.
 */
final class LiveRuntimeLock {
    static final String RESOURCE = "live-runtime-lock.txt";

    private LiveRuntimeLock() {
    }

    static void verify() {
        verify(System.getenv("CRAVES_ENVIRONMENT"), LiveRuntimeLock.class.getClassLoader());
    }

    static void verify(String environment, ClassLoader loader) {
        if (environment == null || !environment.startsWith("prod")) {
            return;
        }
        List<String> missing = required(loader).stream().filter(name -> !present(name, loader)).toList();
        if (!missing.isEmpty()) {
            throw new IllegalStateException("LIVE_RUNTIME_LOCK: refusing to start in " + environment
                    + " because this build lacks code production already runs: " + missing
                    + ". See docs/runbooks/live-runtime-safety.md");
        }
    }

    static List<String> required(ClassLoader loader) {
        try (InputStream in = loader.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("LIVE_RUNTIME_LOCK: " + RESOURCE + " is missing from this build");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .map(line -> line.replaceFirst("#.*", "").strip())
                    .filter(name -> !name.isEmpty())
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean present(String name, ClassLoader loader) {
        try {
            Class.forName(name, false, loader);
            return true;
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
    }
}

package in.craves.order.security.internalcall;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.SequenceInputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.util.UrlPathHelper;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * CH-03: identity check for internal routes, added to the Spring Security chain.
 * <ul>
 *   <li>Signed call: the signature, timestamp, nonce and per-route caller allow-list are verified.</li>
 *   <li>Unsigned call: passes on to the route's existing shared-secret check, unless the path is enforced.</li>
 *   <li>Paths in {@code craves.internal-auth.enforced-paths} reject unsigned or invalid calls (401/403).
 *       Everywhere else a bad signature is only reported, so turning signing on can never break a working flow.</li>
 * </ul>
 */
public final class InternalCallFilter extends OncePerRequestFilter {
    private static final Logger LOGGER = LoggerFactory.getLogger(InternalCallFilter.class);
    static final int MAX_SIGNED_BODY_BYTES = 1024 * 1024;
    private static final long LOG_WINDOW_MILLIS = 60_000;
    private static final int MAX_LOG_KEYS = 256;

    private final AntPathMatcher paths = new AntPathMatcher();
    private final List<String> internalPatterns;
    private final InternalCallSignature.Verifier verifier;
    private final List<String> enforcedPatterns;
    private final Map<String, Set<String>> allowedCallers;
    private final Map<String, LogWindow> logWindows = new ConcurrentHashMap<>();

    public InternalCallFilter(
        List<String> internalPatterns,
        InternalCallSignature.Verifier verifier,
        List<String> enforcedPatterns,
        Map<String, Set<String>> allowedCallers
    ) {
        this.internalPatterns = List.copyOf(internalPatterns);
        this.verifier = verifier;
        this.enforcedPatterns = List.copyOf(enforcedPatterns);
        this.allowedCallers = Map.copyOf(allowedCallers);
    }

    /** Reads craves.internal-auth.caller-keys, enforced-paths and allowed-callers. Bad configuration never stops startup. */
    public static InternalCallFilter fromEnvironment(Environment environment, String... internalPatterns) {
        Map<String, byte[]> callerKeys = Map.of();
        try {
            callerKeys = InternalCallSignature.parseCallerKeys(environment.getProperty("craves.internal-auth.caller-keys", ""));
        } catch (IllegalArgumentException exception) {
            LOGGER.error("CRAVES_ALERT alert=INTERNAL_CALL_CONFIG_INVALID setting=caller-keys reason={}", exception.getMessage());
        }
        return new InternalCallFilter(
            List.of(internalPatterns),
            new InternalCallSignature.Verifier(callerKeys, Clock.systemUTC()),
            csv(environment.getProperty("craves.internal-auth.enforced-paths", "")),
            parseAllowedCallers(environment.getProperty("craves.internal-auth.allowed-callers", ""))
        );
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = routedPath(request);
        return internalPatterns.stream().noneMatch(pattern -> paths.match(pattern, path));
    }

    /** The decoded path that Spring Security and MVC route on, so /%69nternal/... cannot slip past the patterns. */
    static String routedPath(HttpServletRequest request) {
        return UrlPathHelper.defaultInstance.getPathWithinApplication(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = routedPath(request);
        boolean enforced = enforcedPatterns.stream().anyMatch(pattern -> paths.match(pattern, path));
        String signature = request.getHeader(InternalCallSignature.SIGNATURE_HEADER);
        if (signature == null) {
            if (enforced) {
                reject(response, HttpServletResponse.SC_UNAUTHORIZED, "INTERNAL_CALL_SIGNATURE_REQUIRED", path, null);
                return;
            }
            // Unsigned legacy call: the route's own shared-secret check still decides, exactly as before.
            // Sampled, so operators can see which routes still need signing before enforcing them.
            long skipped = sample("UNSIGNED " + path);
            if (skipped >= 0) {
                LOGGER.info("INTERNAL_CALL_UNSIGNED mode=monitor path={} unloggedSinceLast={}", printable(path), skipped);
            }
            chain.doFilter(request, response);
            return;
        }

        String caller = request.getHeader(InternalCallSignature.CALLER_HEADER);
        HttpServletRequest forwarded;
        InternalCallSignature.Result result;
        byte[] body = request.getContentLengthLong() > MAX_SIGNED_BODY_BYTES
            ? null
            : request.getInputStream().readNBytes(MAX_SIGNED_BODY_BYTES + 1);
        if (body == null || body.length > MAX_SIGNED_BODY_BYTES) {
            // Not buffered further: an oversized body can never carry a valid signature.
            forwarded = body == null ? request : new CachedBodyRequest(request, body, request.getInputStream());
            result = new InternalCallSignature.Result(false, caller, "BODY_TOO_LARGE");
        } else {
            forwarded = new CachedBodyRequest(request, body, null);
            String query = request.getQueryString();
            result = verifier.verify(
                caller,
                request.getHeader(InternalCallSignature.TIMESTAMP_HEADER),
                request.getHeader(InternalCallSignature.NONCE_HEADER),
                signature,
                request.getMethod(),
                // The signer signs the raw path, so verify against the raw request URI.
                query == null ? request.getRequestURI() : request.getRequestURI() + "?" + query,
                body
            );
            if (result.valid() && !callerAllowed(path, result.caller())) {
                result = new InternalCallSignature.Result(false, result.caller(), "CALLER_NOT_ALLOWED");
            }
        }

        if (!result.valid()) {
            if (enforced) {
                int status = "CALLER_NOT_ALLOWED".equals(result.reason())
                    ? HttpServletResponse.SC_FORBIDDEN
                    : HttpServletResponse.SC_UNAUTHORIZED;
                reject(response, status, result.reason(), path, result.caller());
                return;
            }
            long skipped = sample("INVALID " + result.reason());
            if (skipped >= 0) {
                LOGGER.warn(
                    "CRAVES_ALERT alert=INTERNAL_CALL_SIGNATURE_INVALID mode=monitor path={} caller={} reason={} unloggedSinceLast={}",
                    printable(path), printable(result.caller()), result.reason(), skipped
                );
            }
        }
        chain.doFilter(forwarded, response);
    }

    private boolean callerAllowed(String path, String caller) {
        for (Map.Entry<String, Set<String>> rule : allowedCallers.entrySet()) {
            if (paths.match(rule.getKey(), path) && !rule.getValue().contains(caller)) {
                return false;
            }
        }
        return true;
    }

    private void reject(HttpServletResponse response, int status, String reason, String path, String caller)
        throws IOException {
        long skipped = sample("REJECTED " + reason);
        if (skipped >= 0) {
            LOGGER.warn("CRAVES_ALERT alert=INTERNAL_CALL_REJECTED path={} caller={} reason={} unloggedSinceLast={}",
                printable(path), printable(caller), reason, skipped);
        }
        // The detailed reason stays in the log; callers only learn whether a signature is missing or not accepted.
        String code = "INTERNAL_CALL_SIGNATURE_REQUIRED".equals(reason) ? reason
            : status == HttpServletResponse.SC_FORBIDDEN ? "INTERNAL_CALL_FORBIDDEN" : "INTERNAL_CALL_UNAUTHORIZED";
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\"}");
    }

    /**
     * At most one log line per key per minute, so a flood of bad calls cannot bury the alert.
     * Returns how many events were not logged since the last line, or -1 when this one is not logged.
     * shortcut: per replica and capped at 256 keys; move to a metric if the counts are needed centrally.
     */
    private long sample(String key) {
        String bounded = logWindows.size() < MAX_LOG_KEYS || logWindows.containsKey(key) ? key : key.substring(0, key.indexOf(' ')) + " other";
        return logWindows.computeIfAbsent(bounded, ignored -> new LogWindow()).next(System.currentTimeMillis());
    }

    private static final class LogWindow {
        private long startedAt = Long.MIN_VALUE;
        private long skipped;

        synchronized long next(long now) {
            if (startedAt != Long.MIN_VALUE && now - startedAt < LOG_WINDOW_MILLIS) {
                skipped++;
                return -1;
            }
            long previous = skipped;
            startedAt = now;
            skipped = 0;
            return previous;
        }
    }

    /** {@code /internal/v1/roles/chef/**=user-chef;/internal/v1/notifications=order|user-chef} */
    static Map<String, Set<String>> parseAllowedCallers(String spec) {
        Map<String, Set<String>> rules = new LinkedHashMap<>();
        for (String entry : csv(spec.replace(';', ','))) {
            int separator = entry.indexOf('=');
            if (separator <= 0) {
                LOGGER.error("CRAVES_ALERT alert=INTERNAL_CALL_CONFIG_INVALID setting=allowed-callers entry={}", printable(entry));
                continue;
            }
            rules.put(entry.substring(0, separator).trim(), Set.copyOf(csv(entry.substring(separator + 1).replace('|', ','))));
        }
        return rules;
    }

    private static List<String> csv(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty()).toList();
    }

    private static String printable(String value) {
        if (value == null) {
            return "-";
        }
        String cleaned = value.replaceAll("[^A-Za-z0-9/_*|=.-]", "?");
        return cleaned.length() <= 80 ? cleaned : cleaned.substring(0, 80);
    }

    /** Lets the controller read the body that was hashed for the signature. */
    static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] prefix;
        private final InputStream rest;

        CachedBodyRequest(HttpServletRequest request, byte[] prefix, InputStream rest) {
            super(request);
            this.prefix = prefix;
            this.rest = rest;
        }

        @Override
        public ServletInputStream getInputStream() {
            InputStream source = rest == null
                ? new ByteArrayInputStream(prefix)
                : new SequenceInputStream(new ByteArrayInputStream(prefix), rest);
            return new ServletInputStream() {
                private boolean finished;

                @Override
                public int read() throws IOException {
                    int value = source.read();
                    finished = value < 0;
                    return value;
                }

                @Override
                public int read(byte[] buffer, int offset, int length) throws IOException {
                    int count = source.read(buffer, offset, length);
                    finished = count < 0;
                    return count;
                }

                @Override
                public boolean isFinished() {
                    return finished;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("Internal calls are read synchronously");
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }
}

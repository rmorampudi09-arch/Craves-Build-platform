package in.craves.order.idempotency;

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
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import org.springframework.web.util.UrlPathHelper;

/**
 * CH-07: Idempotency-Key for mutating client APIs. Opt-in per request: nothing changes for a request without the
 * header. With it:
 * <ul>
 *   <li>the first request runs, and a 2xx response (body, content type, Location) is kept for 72 hours;</li>
 *   <li>the same key and the same request replays that response (Idempotent-Replayed: true) instead of running again;</li>
 *   <li>the same key with a different request is 422; a retry while the first is still running is 409.</li>
 * </ul>
 * Only signed-in callers are covered (the key is scoped to the caller). Non-2xx results are not stored, so a retry
 * runs normally. Any store failure falls back to running the request.
 * Dependency-light on purpose: copied unchanged (apart from the package) into each service that uses it.
 */
public final class IdempotencyKeyFilter extends OncePerRequestFilter {
    public static final String HEADER = "Idempotency-Key";
    private static final Logger LOGGER = LoggerFactory.getLogger(IdempotencyKeyFilter.class);
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._:-]{8,128}");
    private static final Pattern TABLE = Pattern.compile("[a-z_]+(\\.[a-z_]+)?");
    private static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final HexFormat HEX = HexFormat.of();
    static final int MAX_BODY_BYTES = 1024 * 1024;
    static final int MAX_STORED_RESPONSE_BYTES = 64 * 1024;
    // Longer than any request can run, so a slow first attempt is never run a second time beside it.
    static final int IN_PROGRESS_TAKEOVER_SECONDS = 300;
    private static final String RETENTION = "INTERVAL '72 hours'";
    private static final long PURGE_INTERVAL_MILLIS = 15 * 60_000;

    private final JdbcTemplate jdbc;
    private final String table;
    private final List<String> excludedPaths;
    private final Function<Authentication, String> callerId;
    private final AntPathMatcher paths = new AntPathMatcher();
    private final AtomicLong lastPurge = new AtomicLong();

    /** {@code callerId} returns a stable id for the signed-in caller (e.g. the identity id), or null to skip. */
    public IdempotencyKeyFilter(
        JdbcTemplate jdbc,
        String table,
        List<String> excludedPaths,
        Function<Authentication, String> callerId
    ) {
        if (!TABLE.matcher(table).matches()) {
            throw new IllegalArgumentException("Invalid idempotency table name: " + table);
        }
        this.jdbc = jdbc;
        this.table = table;
        this.excludedPaths = List.copyOf(excludedPaths);
        this.callerId = callerId;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!MUTATING.contains(request.getMethod()) || request.getHeader(HEADER) == null) {
            return true;
        }
        // Decoded, as MVC routes it, so an encoded path cannot dodge the exclusions.
        String path = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        String contentType = request.getContentType();
        return !path.startsWith("/api/")
            || (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/"))
            || excludedPaths.stream().anyMatch(pattern -> paths.match(pattern, path));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String key = request.getHeader(HEADER).trim();
        String actor = actor();
        if (actor == null || !KEY.matcher(key).matches() || request.getContentLengthLong() > MAX_BODY_BYTES) {
            chain.doFilter(request, response);
            return;
        }
        InputStream original = request.getInputStream();
        byte[] body = original.readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            chain.doFilter(new BodyReplayRequest(request, body, original), response);
            return;
        }
        HttpServletRequest replayable = new BodyReplayRequest(request, body, null);
        String fingerprint = sha256(
            request.getMethod() + "\n" + request.getRequestURI() + "\n" + Objects.toString(request.getQueryString(), "") + "\n",
            body
        );

        UUID owner = UUID.randomUUID();
        Claim claim;
        try {
            claim = claim(actor, key, fingerprint, owner);
        } catch (DataAccessException exception) {
            LOGGER.warn("Idempotency store unavailable; the request runs without replay protection: {}", exception.toString());
            chain.doFilter(replayable, response);
            return;
        }
        switch (claim.outcome()) {
            case MISMATCH -> {
                writeError(response, 422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request");
                return;
            }
            case IN_PROGRESS -> {
                response.setHeader("Retry-After", "2");
                writeError(response, 409, "IDEMPOTENT_REQUEST_IN_PROGRESS", "The first request with this Idempotency-Key is still running");
                return;
            }
            case REPLAY -> {
                response.setStatus(claim.httpStatus());
                if (claim.contentType() != null) {
                    response.setContentType(claim.contentType());
                }
                if (claim.location() != null) {
                    response.setHeader("Location", claim.location());
                }
                response.setHeader("Idempotent-Replayed", "true");
                if (claim.responseBody() != null) {
                    response.getOutputStream().write(claim.responseBody());
                }
                return;
            }
            case OWNER -> {
                // Run the request below.
            }
        }

        ContentCachingResponseWrapper captured = new ContentCachingResponseWrapper(response);
        boolean stored = false;
        try {
            chain.doFilter(replayable, captured);
            stored = complete(actor, key, owner, captured);
        } finally {
            if (!stored) {
                release(actor, key, owner);
            }
            captured.copyBodyToResponse();
        }
    }

    private Claim claim(String actor, String key, String fingerprint, UUID owner) {
        if (insert(actor, key, fingerprint, owner)) {
            return Claim.of(Outcome.OWNER);
        }
        List<Claim> existing = jdbc.query(
            "SELECT request_hash, state, http_status, content_type, response_location, response_body, "
                + "created_at < now() - " + RETENTION + " AS expired, "
                + "created_at < now() - (? * INTERVAL '1 second') AS stale FROM " + table
                + " WHERE actor_hash = ? AND idem_key = ?",
            (row, rowNumber) -> {
                if (row.getBoolean("expired")) {
                    return Claim.of(Outcome.EXPIRED);
                }
                if (!fingerprint.equals(row.getString("request_hash"))) {
                    return Claim.of(Outcome.MISMATCH);
                }
                if ("COMPLETED".equals(row.getString("state"))) {
                    return new Claim(Outcome.REPLAY, row.getInt("http_status"), row.getString("content_type"),
                        row.getString("response_location"), row.getBytes("response_body"));
                }
                return Claim.of(row.getBoolean("stale") ? Outcome.TAKE_OVER : Outcome.IN_PROGRESS);
            },
            IN_PROGRESS_TAKEOVER_SECONDS, actor, key
        );
        Outcome found = existing.isEmpty() ? Outcome.EXPIRED : existing.get(0).outcome();
        if (found == Outcome.EXPIRED) {
            // Older than the retention window (or just purged): the key starts fresh.
            jdbc.update("DELETE FROM " + table + " WHERE actor_hash = ? AND idem_key = ? AND created_at < now() - " + RETENTION,
                actor, key);
            return Claim.of(insert(actor, key, fingerprint, owner) ? Outcome.OWNER : Outcome.IN_PROGRESS);
        }
        if (found == Outcome.TAKE_OVER) {
            // The first attempt died mid-request; take the claim over, but only once.
            int taken = jdbc.update(
                "UPDATE " + table + " SET created_at = now(), owner_token = ? WHERE actor_hash = ? AND idem_key = ? "
                    + "AND state = 'IN_PROGRESS' AND created_at < now() - (? * INTERVAL '1 second')",
                owner, actor, key, IN_PROGRESS_TAKEOVER_SECONDS
            );
            return Claim.of(taken == 1 ? Outcome.OWNER : Outcome.IN_PROGRESS);
        }
        return existing.get(0);
    }

    private boolean insert(String actor, String key, String fingerprint, UUID owner) {
        boolean inserted = jdbc.update(
            "INSERT INTO " + table + " (actor_hash, idem_key, request_hash, state, owner_token, created_at) "
                + "VALUES (?, ?, ?, 'IN_PROGRESS', ?, now()) ON CONFLICT (actor_hash, idem_key) DO NOTHING",
            actor, key, fingerprint, owner
        ) == 1;
        long now = System.currentTimeMillis();
        long previous = lastPurge.get();
        if (inserted && now - previous >= PURGE_INTERVAL_MILLIS && lastPurge.compareAndSet(previous, now)) {
            // shortcut: purges ride on inserts (1,000 rows per 15 min per replica); add a scheduled job if volume outgrows it.
            try {
                jdbc.update(
                    "DELETE FROM " + table + " WHERE (actor_hash, idem_key) IN (SELECT actor_hash, idem_key FROM " + table
                        + " WHERE created_at < now() - " + RETENTION + " LIMIT 1000)"
                );
            } catch (DataAccessException exception) {
                LOGGER.warn("Could not purge expired idempotency records: {}", exception.toString());
            }
        }
        return inserted;
    }

    private boolean complete(String actor, String key, UUID owner, ContentCachingResponseWrapper captured) {
        int status = captured.getStatus();
        byte[] responseBody = captured.getContentAsByteArray();
        if (status < 200 || status >= 300 || responseBody.length > MAX_STORED_RESPONSE_BYTES) {
            return false;
        }
        try {
            return jdbc.update(
                "UPDATE " + table + " SET state = 'COMPLETED', http_status = ?, content_type = ?, response_location = ?, "
                    + "response_body = ?, completed_at = now() "
                    + "WHERE actor_hash = ? AND idem_key = ? AND state = 'IN_PROGRESS' AND owner_token = ?",
                status, captured.getContentType(), captured.getHeader("Location"), responseBody, actor, key, owner
            ) == 1;
        } catch (DataAccessException exception) {
            LOGGER.warn("Could not store the idempotent response; a retry will run the request again: {}", exception.toString());
            return false;
        }
    }

    /** Only the attempt that holds the claim may release it, so a late failure cannot free a newer attempt's claim. */
    private void release(String actor, String key, UUID owner) {
        try {
            jdbc.update(
                "DELETE FROM " + table + " WHERE actor_hash = ? AND idem_key = ? AND state = 'IN_PROGRESS' AND owner_token = ?",
                actor, key, owner
            );
        } catch (DataAccessException exception) {
            LOGGER.warn("Could not release an idempotency claim; it can be taken over after {} seconds: {}",
                IN_PROGRESS_TAKEOVER_SECONDS, exception.toString());
        }
    }

    /** A stable id for the signed-in caller; anonymous requests are not covered. */
    private String actor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }
        String id = callerId.apply(authentication);
        return id == null || id.isBlank() ? null : sha256("caller:" + id, new byte[0]);
    }

    private static void writeError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
    }

    private static String sha256(String prefix, byte[] body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(prefix.getBytes(StandardCharsets.UTF_8));
            digest.update(body);
            return HEX.formatHex(digest.digest());
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    enum Outcome { OWNER, REPLAY, IN_PROGRESS, MISMATCH, TAKE_OVER, EXPIRED }

    record Claim(Outcome outcome, int httpStatus, String contentType, String location, byte[] responseBody) {
        static Claim of(Outcome outcome) {
            return new Claim(outcome, 0, null, null, null);
        }
    }

    /** Lets the controller read the body that was fingerprinted. */
    static final class BodyReplayRequest extends HttpServletRequestWrapper {
        private final byte[] prefix;
        private final InputStream rest;

        BodyReplayRequest(HttpServletRequest request, byte[] prefix, InputStream rest) {
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
                    throw new UnsupportedOperationException("Requests are read synchronously");
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

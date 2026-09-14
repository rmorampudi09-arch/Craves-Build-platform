package in.craves.adminexplorer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Validated read filters. A cursor is a position, never a permission or an SQL fragment. */
public record ExplorerQuery(LocalDate from, LocalDate to, String status, String search,
        String facet, int size, boolean ascending, boolean records, Instant boundary,
        Instant afterTime, UUID afterId, String fingerprint, String reason) {
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    public record Request(String fromDate, String toDate, String status, String search,
            String facet, Integer pageSize, String sort, String mode, String boundary,
            String cursor, String reason) {}
    public static ExplorerQuery parse(Request r, String dataset, Instant now) {
        if (r == null) throw new IllegalArgumentException("A query is required");
        LocalDate from = date(r.fromDate()), to = date(r.toDate());
        if (from != null && to != null && from.isAfter(to)) throw new IllegalArgumentException("Start date must precede end date");
        String status = text(r.status(), 40), search = text(r.search(), 160).toLowerCase(Locale.ROOT), facet = text(r.facet(), 120);
        if (!status.isEmpty() && !status.matches("[A-Z][A-Z0-9_]{0,39}")) throw new IllegalArgumentException("Invalid status");
        if (dataset.equals("users") && !facet.isEmpty() && !facet.matches("[A-Z][A-Z0-9_]{0,39}")) throw new IllegalArgumentException("Invalid role");
        if (dataset.equals("orders") && !Set.of("", "ON_DEMAND", "SUBSCRIPTION").contains(facet)) throw new IllegalArgumentException("Invalid order source");
        int size = r.pageSize() == null ? 25 : r.pageSize();
        if (!Set.of(25, 50, 100).contains(size)) throw new IllegalArgumentException("Page size must be 25, 50 or 100");
        String sort = text(r.sort(), 10), mode = text(r.mode(), 10);
        if (!Set.of("", "newest", "oldest").contains(sort)) throw new IllegalArgumentException("Invalid sort");
        if (!Set.of("summary", "records").contains(mode)) throw new IllegalArgumentException("Invalid mode");
        String reason = mode.equals("summary") ? "Administration aggregate analytics overview" : text(r.reason(), 500);
        if (reason.length() < 10) throw new IllegalArgumentException("A 10 to 500 character operational reason is required");
        Instant boundary = instant(r.boundary(), now.truncatedTo(ChronoUnit.MICROS));
        if (boundary.isAfter(now.plusSeconds(1)) || boundary.isBefore(Instant.EPOCH)) throw new IllegalArgumentException("Invalid creation boundary");
        String fingerprint = hash(dataset + "\n" + from + "\n" + to + "\n" + status + "\n" + search + "\n" + facet + "\n" + sort + "\n" + size);
        Instant afterTime = null; UUID afterId = null;
        if (r.cursor() != null && !r.cursor().isBlank()) {
            if (!mode.equals("records") || r.cursor().length() > 600) throw new IllegalArgumentException("Invalid cursor");
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(r.cursor()), StandardCharsets.UTF_8).split("\\|", -1);
                if (parts.length != 5 || !parts[0].equals("1") || !parts[4].equals(fingerprint)) throw new IllegalArgumentException();
                Instant cursorBoundary = Instant.parse(parts[1]);
                if (!cursorBoundary.equals(boundary)) throw new IllegalArgumentException();
                afterTime = Instant.parse(parts[2]);
                if (!parts[3].matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException();
                afterId = UUID.fromString(parts[3]);
                if (!afterTime.isBefore(boundary)) throw new IllegalArgumentException();
            } catch (RuntimeException e) { throw new IllegalArgumentException("Cursor does not match this view. Refresh from the first page."); }
        }
        return new ExplorerQuery(from, to, status, search, facet, size, sort.equals("oldest"), mode.equals("records"), boundary, afterTime, afterId, fingerprint, reason);
    }
    public String next(Instant time, UUID id) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(("1|" + boundary + "|" + time + "|" + id + "|" + fingerprint).getBytes(StandardCharsets.UTF_8));
    }
    public Instant start() { return from == null ? null : from.atStartOfDay(ZONE).toInstant(); }
    public Instant end() {
        Instant end = to == null ? boundary : to.plusDays(1).atStartOfDay(ZONE).toInstant();
        return end.isBefore(boundary) ? end : boundary;
    }
    public static LocalDate date(String value) {
        if (value == null || value.isBlank()) return null;
        if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("Use a calendar date YYYY-MM-DD");
        try { LocalDate d = LocalDate.parse(value); if (d.getYear() < 1970 || d.getYear() > 2100) throw new IllegalArgumentException(); return d; }
        catch (RuntimeException e) { throw new IllegalArgumentException("Invalid calendar date"); }
    }
    public static Instant instant(String value, Instant fallback) {
        if (value == null || value.isBlank()) return fallback;
        if (value.length() > 40) throw new IllegalArgumentException("Invalid timestamp");
        try { return Instant.parse(value); } catch (RuntimeException e) { throw new IllegalArgumentException("Invalid timestamp"); }
    }
    public static String text(String value, int max) {
        if (value == null) return "";
        String s = value.strip();
        if (s.length() > max || s.codePoints().anyMatch(Character::isISOControl)) throw new IllegalArgumentException("Invalid filter text");
        return s;
    }
    public static String like(String s) { return "%" + s.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"; }
    public static String hash(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}

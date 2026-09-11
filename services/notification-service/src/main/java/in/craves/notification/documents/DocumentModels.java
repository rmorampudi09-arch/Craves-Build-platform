package in.craves.notification.documents;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Versioned rendering input. Only trusted, owner-authorized source adapters create snapshots. */
public final class DocumentModels {
    private DocumentModels() {}
    public static final int MAX_ROWS = 1000;
    public static final int MAX_PDF_BYTES = 4 * 1024 * 1024;
    public static final String TEMPLATE_VERSION = "craves-documents-v1";

    public enum Type {
        ORDER_SUMMARY("Order summary", false),
        PAYMENT_RECEIPT("Payment receipt", false),
        SUBSCRIPTION_RECEIPT("Subscription receipt", false),
        CHEF_ORDER_STATEMENT("Chef order activity", true),
        CHEF_EARNINGS_STATEMENT("Chef earnings statement", true),
        CHEF_SETTLEMENT_STATEMENT("Chef settlement statement", true);
        private final String title;
        private final boolean chef;
        Type(String title, boolean chef) { this.title = title; this.chef = chef; }
        public String title() { return title; }
        public boolean chef() { return chef; }
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Request(Type type, UUID sourceId, LocalDate from, LocalDate to,
                          String timezone, String currency) {
        public Request normalize() {
            if (type == null) throw bad("DOCUMENT_TYPE_REQUIRED");
            String zone = timezone == null ? "Asia/Kolkata" : timezone;
            String unit = currency == null ? "INR" : currency.toUpperCase(Locale.ROOT);
            try { ZoneId.of(zone); } catch (RuntimeException ex) { throw bad("INVALID_TIMEZONE"); }
            if (!unit.matches("[A-Z]{3}")) throw bad("INVALID_CURRENCY");
            if (type.chef()) {
                if (sourceId != null || from == null || to == null || !from.isBefore(to)
                    || Duration.between(from.atStartOfDay(), to.atStartOfDay()).toDays() > 31)
                    throw bad("PERIOD_REQUIRES_1_TO_31_DAYS_END_EXCLUSIVE");
            } else if (sourceId == null || from != null || to != null) {
                throw bad("SOURCE_ID_REQUIRED_WITHOUT_PERIOD");
            }
            return new Request(type, sourceId, from, to, zone, unit);
        }
        public Instant start() { return from.atStartOfDay(ZoneId.of(timezone)).toInstant(); }
        public Instant end() { return to.atStartOfDay(ZoneId.of(timezone)).toInstant(); }
        public String fingerprint() {
            return sha256((type + "|" + sourceId + "|" + from + "|" + to + "|" + timezone + "|" + currency)
                .getBytes(StandardCharsets.UTF_8));
        }
    }

    public record Field(String label, String value) {}
    public record Table(String title, List<String> columns, List<List<String>> rows) {}
    public record Snapshot(int version, Type type, UUID ownerIdentityId, String reference,
                           String currency, Instant asOf, List<Field> facts, List<Table> tables,
                           String notice) {
        public Snapshot validated(UUID owner, Type expected, String expectedCurrency) {
            if (version != 1 || type != expected || !owner.equals(ownerIdentityId)
                || !expectedCurrency.equals(currency) || asOf == null || asOf.isAfter(Instant.now().plusSeconds(60)))
                throw upstream("SOURCE_IDENTITY_OR_CONTRACT_MISMATCH");
            text(reference, 160); text(notice, 1600);
            if (facts == null || facts.size() > 40 || tables == null || tables.size() > 12)
                throw upstream("SOURCE_SIZE_LIMIT");
            int total = 0;
            for (Field field : facts) {
                if (field == null) throw upstream("INVALID_SOURCE_FIELD");
                text(field.label(), 100); text(field.value(), 800);
            }
            for (Table table : tables) {
                if (table == null || table.columns() == null || table.columns().isEmpty()
                    || table.columns().size() > 8 || table.rows() == null)
                    throw upstream("INVALID_SOURCE_TABLE");
                text(table.title(), 120);
                for (String col : table.columns()) text(col, 100);
                total += table.rows().size();
                if (total > MAX_ROWS + 100) throw upstream("SOURCE_ROW_LIMIT");
                for (List<String> row : table.rows()) {
                    if (row == null || row.size() != table.columns().size())
                        throw upstream("INVALID_SOURCE_ROW");
                    for (String cell : row) text(cell, 800);
                }
            }
            return this;
        }
    }

    public record Summary(UUID id, Type type, String reference, String currency, String status,
                          Instant createdAt, Instant readyAt, String sha256, Long bytes,
                          String templateVersion, String errorCode) {}
    public record Page(List<Summary> items, String nextCursor) {}
    public record EmailSummary(UUID id, UUID documentId, String status, Instant createdAt,
                               Instant updatedAt, String errorCode) {}
    public record Stored(UUID id, UUID owner, String fingerprint, String snapshot, String snapshotHash,
                         String timezone, Summary summary) {}
    public record RenderClaim(Stored document, UUID token, int attempt) {}
    public record EmailClaim(UUID id, UUID documentId, UUID owner, UUID token) {}

    public static void idempotencyKey(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{16,100}"))
            throw bad("INVALID_IDEMPOTENCY_KEY");
    }
    private static void text(String value, int limit) {
        if (value == null || value.length() > limit || value.codePoints().anyMatch(c -> c < 32 && c != 10))
            throw upstream("INVALID_SOURCE_TEXT");
    }
    public static String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    public static ResponseStatusException bad(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }
    public static ResponseStatusException upstream(String code) { return new ResponseStatusException(HttpStatus.BAD_GATEWAY, code); }
    public static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
    public static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "DOCUMENT_NOT_FOUND"); }
}

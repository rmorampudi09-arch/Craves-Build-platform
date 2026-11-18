package in.craves.integration.delivery.billing;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * The courier-billing admin routes' work (CRAVES_DELIVERY_COURIER_CHARGE_ENABLED; off, this bean does not exist): an
 * admin's billing settings per courier, and courier invoices imported as CSV and compared with courier_charge by the
 * courier's booking id. It stores and compares only: no dispute, payment, adjustment or ledger entry is made, and of the
 * settings only the two alert thresholds are read by other code (CourierCharges, for an alert line).
 */
@Service
@ConditionalOnProperty(name = "craves.delivery-command.courier-charge-enabled", havingValue = "true")
public class CourierBilling {
    static final List<String> COURIERS = List.of("borzo", "pidge");
    static final String HEADER = "booking_reference,amount,tax,date";
    static final int MAX_CHARS = 512_000;
    static final int MAX_LINES = 5_000;
    static final int MAX_PERIOD_DAYS = 92;
    static final int MAX_ROWS = 500;
    private static final Set<String> MODES = Set.of("UNKNOWN", "PREPAID_WALLET", "POSTPAID_INVOICE");
    private static final Set<String> BORNE_BY = Set.of("UNDECIDED", "CRAVES", "CHEF", "CUSTOMER");
    private static final Pattern BOOKING_REFERENCE = Pattern.compile("[A-Za-z0-9_-]{1,200}");
    private static final Pattern INVOICE_REF = Pattern.compile("[A-Za-z0-9._/-]{1,64}");
    /** Rupees with at most two decimals: never rounded. */
    private static final Pattern AMOUNT = Pattern.compile("[0-9]{1,9}(\\.[0-9]{1,2})?");

    public record Admin(UUID id, String name) {}

    /** changedAt null: never saved, so these are the neutral defaults. */
    public record Setting(String courier, String billingMode, String taxNote, Integer taxRateBps, String disputedFeeBorneBy,
                          Long perOrderAlertPaise, Long perDayAlertPaise, String changedByName, Instant changedAt) {}

    public record SettingInput(String billingMode, String taxNote, Integer taxRateBps, String disputedFeeBorneBy,
                               Long perOrderAlertPaise, Long perDayAlertPaise) {}

    public record InvoiceInput(String courier, String invoiceRef, LocalDate periodStart, LocalDate periodEnd, String csv) {}

    record Line(int lineNo, String bookingReference, long amountPaise, Long taxPaise, LocalDate date) {}

    public record Import(long importId, String courier, String invoiceRef, LocalDate periodStart, LocalDate periodEnd,
                         int lineCount, long totalPaise, String currency, String importedByName, Instant importedAt) {}

    /** differencePaise: invoice minus Craves. */
    public record CheckRow(String bookingReference, Integer lineNo, Long invoicePaise, Long cravesPaise, String outcome,
                           Long differencePaise, boolean cancelled, String deliveryStatus) {}

    /** rows: every line that is not MATCHED, MAX_ROWS at most (truncated when there were more). */
    public record InvoiceCheck(Import invoice, boolean duplicate, Map<String, Integer> counts, long netDifferencePaise,
                               List<CheckRow> rows, boolean truncated) {}

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public CourierBilling(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
    }

    public List<Setting> settings() {
        return COURIERS.stream().map(this::setting).toList();
    }

    private Setting setting(String courier) {
        return jdbc.query("SELECT * FROM delivery_schema.courier_billing_setting WHERE provider_id = ? ORDER BY id DESC LIMIT 1",
            (row, n) -> new Setting(courier, row.getString("billing_mode"), row.getString("tax_note"),
                (Integer) row.getObject("tax_rate_bps"), row.getString("disputed_fee_borne_by"),
                (Long) row.getObject("per_order_alert_paise"), (Long) row.getObject("per_day_alert_paise"),
                row.getString("changed_by_name"), row.getTimestamp("changed_at").toInstant()), courier).stream().findFirst()
            .orElse(new Setting(courier, "UNKNOWN", null, null, "UNDECIDED", null, null, null, null));
    }

    /** A new version of the courier's settings, with who saved it. Stored only (see the class comment). */
    public Setting save(Admin admin, String courier, SettingInput input) {
        courier(courier);
        if (input == null || !MODES.contains(input.billingMode())) {
            throw invalid("billingMode must be UNKNOWN, PREPAID_WALLET or POSTPAID_INVOICE");
        }
        if (!BORNE_BY.contains(input.disputedFeeBorneBy())) {
            throw invalid("disputedFeeBorneBy must be UNDECIDED, CRAVES, CHEF or CUSTOMER");
        }
        if (input.taxNote() != null && input.taxNote().length() > 500) {
            throw invalid("taxNote is at most 500 characters");
        }
        if (input.taxRateBps() != null && (input.taxRateBps() < 0 || input.taxRateBps() > 10_000)) {
            throw invalid("taxRateBps is between 0 and 10000, or empty when not known");
        }
        if ((input.perOrderAlertPaise() != null && input.perOrderAlertPaise() <= 0)
            || (input.perDayAlertPaise() != null && input.perDayAlertPaise() <= 0)) {
            throw invalid("an alert threshold is a positive number of paise, or empty for none");
        }
        jdbc.update("""
            INSERT INTO delivery_schema.courier_billing_setting (provider_id, billing_mode, tax_note, tax_rate_bps,
                disputed_fee_borne_by, per_order_alert_paise, per_day_alert_paise, changed_by, changed_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, courier, input.billingMode(), input.taxNote() == null || input.taxNote().isBlank() ? null : input.taxNote().strip(),
            input.taxRateBps(), input.disputedFeeBorneBy(), input.perOrderAlertPaise(), input.perDayAlertPaise(), admin.id(),
            admin.name());
        return setting(courier);
    }

    /** The newest 50 imports. */
    public List<Import> imports() {
        return jdbc.query("SELECT * FROM delivery_schema.courier_invoice_import ORDER BY id DESC LIMIT 50", (row, n) -> imported(row));
    }

    /**
     * Stores the invoice and answers with its comparison. The same courier, invoice reference and content again answers
     * with the stored import (duplicate) and writes nothing; the same reference with other content is refused.
     */
    public InvoiceCheck importInvoice(Admin admin, InvoiceInput input) {
        if (input == null) {
            throw invalid("Request body is required");
        }
        String courier = courier(input.courier());
        if (input.invoiceRef() == null || !INVOICE_REF.matcher(input.invoiceRef()).matches()) {
            throw invalid("invoiceRef is 1 to 64 letters, digits, dots, slashes, dashes or underscores");
        }
        if (input.periodStart() == null || input.periodEnd() == null || input.periodEnd().isBefore(input.periodStart())
            || ChronoUnit.DAYS.between(input.periodStart(), input.periodEnd()) >= MAX_PERIOD_DAYS) {
            throw invalid("periodStart and periodEnd are dates, in order, at most " + MAX_PERIOD_DAYS + " days");
        }
        List<Line> lines = parse(input.csv());
        long total = lines.stream().mapToLong(Line::amountPaise).reduce(0, Math::addExact);
        String hash = sha256(courier + '\n' + input.invoiceRef() + '\n' + input.periodStart() + '\n' + input.periodEnd() + '\n'
            + lines);
        Long stored = stored(courier, input.invoiceRef(), hash);
        if (stored != null) {
            return check(stored, true);
        }
        Long created;
        try {
            created = transaction.execute(status -> {
                Long id = jdbc.queryForObject("""
                    INSERT INTO delivery_schema.courier_invoice_import (provider_id, invoice_ref, period_start, period_end,
                        content_sha256, line_count, total_paise, imported_by, imported_by_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                    """, Long.class, courier, input.invoiceRef(), Date.valueOf(input.periodStart()), Date.valueOf(input.periodEnd()),
                    hash, lines.size(), total, admin.id(), admin.name());
                jdbc.batchUpdate("INSERT INTO delivery_schema.courier_invoice_line (import_id, line_no, provider_delivery_id, "
                    + "amount_paise, tax_paise, invoice_date) VALUES (?, ?, ?, ?, ?, ?)", lines, 500, (statement, line) -> {
                        statement.setLong(1, id);
                        statement.setInt(2, line.lineNo());
                        statement.setString(3, line.bookingReference());
                        statement.setLong(4, line.amountPaise());
                        statement.setObject(5, line.taxPaise(), Types.BIGINT);
                        statement.setObject(6, line.date() == null ? null : Date.valueOf(line.date()), Types.DATE);
                    });
                return id;
            });
        } catch (DuplicateKeyException raced) {
            // Another request stored this invoice reference first: answer as if it had been there all along.
            return check(stored(courier, input.invoiceRef(), hash), true);
        }
        return check(created, false);
    }

    /** The stored import's id when it is this content; null when the reference is new; refused when the content differs. */
    private Long stored(String courier, String invoiceRef, String hash) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT id, content_sha256 FROM delivery_schema.courier_invoice_import "
            + "WHERE provider_id = ? AND invoice_ref = ?", courier, invoiceRef);
        if (rows.isEmpty()) {
            return null;
        }
        if (!hash.equals(rows.get(0).get("content_sha256"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This invoice reference is already imported with different "
                + "content. Import a corrected invoice under a new reference.");
        }
        return (Long) rows.get(0).get("id");
    }

    /** The import against courier_charge as it is now (view courier_invoice_check). */
    public InvoiceCheck check(long importId, boolean duplicate) {
        Import invoice = jdbc.query("SELECT * FROM delivery_schema.courier_invoice_import WHERE id = ?", (row, n) -> imported(row),
            importId).stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such import"));
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String outcome : List.of("MATCHED", "AMOUNT_DIFFERS", "NOT_IN_CRAVES", "CRAVES_AMOUNT_UNKNOWN", "NOT_ON_INVOICE")) {
            counts.put(outcome, 0);
        }
        long[] net = {0};
        jdbc.query("SELECT outcome, count(*) AS lines, COALESCE(sum(difference_paise), 0)::bigint AS difference "
            + "FROM delivery_schema.courier_invoice_check WHERE import_id = ? GROUP BY outcome", row -> {
                counts.put(row.getString("outcome"), row.getInt("lines"));
                net[0] = Math.addExact(net[0], row.getLong("difference"));
            }, importId);
        List<CheckRow> rows = new ArrayList<>(jdbc.query("SELECT * FROM delivery_schema.courier_invoice_check WHERE import_id = ? "
            + "AND outcome <> 'MATCHED' ORDER BY outcome, provider_delivery_id LIMIT ?", (row, n) -> new CheckRow(
                row.getString("provider_delivery_id"), (Integer) row.getObject("line_no"), (Long) row.getObject("invoice_paise"),
                (Long) row.getObject("craves_paise"), row.getString("outcome"), (Long) row.getObject("difference_paise"),
                row.getBoolean("cancelled"), row.getString("delivery_status")), importId, MAX_ROWS + 1));
        boolean truncated = rows.size() > MAX_ROWS;
        return new InvoiceCheck(invoice, duplicate, counts, net[0], truncated ? rows.subList(0, MAX_ROWS) : rows, truncated);
    }

    /**
     * The generic invoice CSV: the header line, then one line per booking as booking_reference,amount,tax,date. amount
     * and tax are rupees with at most two decimals (tax may be empty); date is YYYY-MM-DD or empty. No quotes, no
     * thousands separators, a booking once per file. Anything else refuses the whole file, naming the line.
     */
    static List<Line> parse(String csv) {
        if (csv == null || csv.isBlank()) {
            throw invalid("csv is required");
        }
        if (csv.length() > MAX_CHARS) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "csv is at most " + MAX_CHARS + " characters");
        }
        String[] text = (csv.charAt(0) == '﻿' ? csv.substring(1) : csv).split("\r?\n", -1);
        int count = text[text.length - 1].isEmpty() ? text.length - 1 : text.length;
        if (count < 2 || !HEADER.equals(text[0].strip())) {
            throw invalid("line 1 must be exactly " + HEADER + ", followed by at least one line");
        }
        if (count - 1 > MAX_LINES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "an invoice is at most " + MAX_LINES + " lines");
        }
        List<Line> lines = new ArrayList<>(count - 1);
        Set<String> seen = new HashSet<>();
        for (int index = 1; index < count; index++) {
            String at = "line " + (index + 1) + ": ";
            String[] fields = text[index].split(",", -1);
            if (text[index].indexOf('"') >= 0 || fields.length != 4) {
                throw invalid(at + "expected four fields separated by commas, without quotes");
            }
            String reference = fields[0].strip();
            if (!BOOKING_REFERENCE.matcher(reference).matches()) {
                throw invalid(at + "booking_reference is 1 to 200 letters, digits, dashes or underscores");
            }
            if (!seen.add(reference)) {
                throw invalid(at + "this booking_reference is already on an earlier line");
            }
            String tax = fields[2].strip();
            String date = fields[3].strip();
            try {
                lines.add(new Line(index + 1, reference, rupeesToPaise(fields[1].strip(), at + "amount"),
                    tax.isEmpty() ? null : rupeesToPaise(tax, at + "tax"), date.isEmpty() ? null : LocalDate.parse(date)));
            } catch (DateTimeParseException unreadable) {
                throw invalid(at + "date is YYYY-MM-DD or empty");
            }
        }
        return lines;
    }

    /** Exact: the text is a decimal with at most two decimals, so nothing is rounded and no floating point is involved. */
    static long rupeesToPaise(String rupees, String what) {
        if (!AMOUNT.matcher(rupees).matches()) {
            throw invalid(what + " is rupees with at most two decimals, like 49 or 49.50");
        }
        return new BigDecimal(rupees).movePointRight(2).longValueExact();
    }

    private static String courier(String courier) {
        if (courier == null || !COURIERS.contains(courier)) {
            throw invalid("courier must be borzo or pidge");
        }
        return courier;
    }

    private static Import imported(java.sql.ResultSet row) throws java.sql.SQLException {
        Timestamp at = row.getTimestamp("imported_at");
        return new Import(row.getLong("id"), row.getString("provider_id"), row.getString("invoice_ref"),
            row.getDate("period_start").toLocalDate(), row.getDate("period_end").toLocalDate(), row.getInt("line_count"),
            row.getLong("total_paise"), row.getString("currency"), row.getString("imported_by_name"), at.toInstant());
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}

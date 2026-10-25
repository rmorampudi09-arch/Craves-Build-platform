package in.craves.integration.fleet.money;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.admin.RiderJoinsExitsExport;
import in.craves.integration.fleet.money.FleetMoneyModels.BatchInput;
import in.craves.integration.fleet.money.FleetMoneyModels.BatchPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Payout;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutBatch;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.RiderPayout;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.payout.bank.BankOnboardingModels;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manual rider payouts (PLAN F13; RIDER-PLAYBOOK 5.8). Nothing here moves money: ops makes a payout file from the
 * database, a second payments admin approves it, ops uploads it to the bank by hand and marks each payout's UTR, which
 * posts RIDER_PAYABLE to BANK. A rider's balance is their released pay, less payouts that did not fail, less debt
 * recovered; a failed payout's money is simply back in it. RazorpayX is never called: there is no automated execution,
 * and CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED only makes the guard below log that it refuses.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPayouts {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetPayouts.class);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    /** Weekly payouts are sent Monday by 15:00 IST; until then the next payout is today. */
    static final LocalTime WEEKLY_SENT_BY = LocalTime.of(15, 0);
    static final Set<String> KINDS = Set.of("WEEKLY", "DAILY_WITHDRAWAL");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final String HEADER = "SELECT b.*, (SELECT COALESCE(SUM(amount_paise), 0) FROM fleet_schema.rider_payout_instruction i "
        + "WHERE i.batch_id = b.id) AS total, (SELECT count(*) FROM fleet_schema.rider_payout_instruction i WHERE i.batch_id = b.id) AS payouts "
        + "FROM fleet_schema.rider_payout_batch b ";
    private static final String PAYOUT = "SELECT i.*, r.name, a.masked_account FROM fleet_schema.rider_payout_instruction i "
        + "JOIN fleet_schema.rider r ON r.id = i.rider_id JOIN fleet_schema.rider_payout_account a ON a.id = i.payout_account_id ";
    /**
     * One rider's money: released pay net of TDS (FleetEarnings.RELEASED), debt from negative adjustments (counted at
     * once), payouts that did not fail (requested withdrawals included), and debt recovered so far.
     */
    static final String BALANCE = """
        SELECT
          COALESCE((SELECT SUM(e.net_paise) FROM fleet_schema.rider_earning e
                     WHERE e.rider_id = r.id AND NOT (e.component <> 'tds' AND e.net_paise < 0) AND (""" + FleetEarnings.RELEASED + """
                   )), 0) AS released,
          COALESCE((SELECT SUM(-e.net_paise) FROM fleet_schema.rider_earning e
                     WHERE e.rider_id = r.id AND e.component <> 'tds' AND e.net_paise < 0), 0) AS debt,
          COALESCE((SELECT SUM(i.amount_paise) FROM fleet_schema.rider_payout_instruction i
                     WHERE i.rider_id = r.id AND i.state <> 'FAILED'), 0) AS paid,
          COALESCE((SELECT SUM(c.amount_paise) FROM fleet_schema.rider_recovery c WHERE c.rider_id = r.id), 0) AS recovered
        FROM fleet_schema.rider r WHERE r.id = ?""";

    private final JdbcTemplate jdbc;
    private final LedgerPostingService ledger;
    private final FleetAdminService admin;
    private final FleetEarnings earnings;
    private final BankDataCipher cipher;
    private final long recoveryCapPaise;
    private final boolean ledgerOn;

    public FleetPayouts(JdbcTemplate jdbc, LedgerPostingService ledger, FleetAdminService admin, FleetEarnings earnings, BankDataCipher cipher,
                        FleetProperties properties,
                        @Value("${craves.fleet.recovery-weekly-cap-paise:50000}") long recoveryCapPaise,
                        @Value("${craves.ledger.posting-enabled:false}") boolean ledgerOn) {
        this.jdbc = jdbc;
        this.ledger = ledger;
        this.admin = admin;
        this.earnings = earnings;
        this.cipher = cipher;
        this.recoveryCapPaise = recoveryCapPaise;
        this.ledgerOn = ledgerOn;
        refuseAutomatedExecution(properties.payoutExecutionEnabled());
    }

    /**
     * The only reader of CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED. Automated payout execution (RazorpayX) is not built:
     * asking for it starts nothing and logs the refusal; payouts stay manual. True when it refused.
     */
    static boolean refuseAutomatedExecution(boolean requested) {
        if (requested) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_PAYOUT_EXECUTION_REFUSED automated rider payouts do not exist in this build; "
                + "payouts stay manual. Set CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED=false.");
        }
        return requested;
    }

    // ---- The rider (rider-v1 /payouts, /withdrawals) ----

    @Transactional(readOnly = true)
    public PayoutsPage payouts(UUID riderId) {
        List<RiderPayout> payouts = jdbc.query("SELECT i.id, i.kind, i.payout_date, i.amount_paise, i.state, i.utr, i.marked_at, b.status AS batch "
            + "FROM fleet_schema.rider_payout_instruction i LEFT JOIN fleet_schema.rider_payout_batch b ON b.id = i.batch_id "
            + "WHERE i.rider_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT 50", (row, n) -> {
                String state = row.getString("state");
                LocalDate date = row.getObject("payout_date", LocalDate.class);
                return new RiderPayout(row.getString("id"), "WEEKLY".equals(row.getString("kind")) ? "Week ending " + DAY.format(date.minusDays(1))
                    : "Withdrawal, paid by 1 pm on " + DAY.format(date), row.getLong("amount_paise"),
                    !"PENDING".equals(state) ? state : "SENT".equals(row.getString("batch")) ? "PROCESSING" : "SCHEDULED",
                    row.getString("utr"), "PAID".equals(state) ? row.getTimestamp("marked_at").toInstant() : null);
            }, riderId);
        return new PayoutsPage(nextPayoutOn(ZonedDateTime.now(IST)), balance(riderId).withdrawable(), payouts);
    }

    /**
     * One free withdrawal per rider per IST day, up to the withdrawable balance, paid in the next day's batch (by 13:00).
     * A retry with the same Idempotency-Key and amount is accepted again; any other second request that day is refused.
     */
    @Transactional
    public void withdraw(UUID riderId, String key, Long amountPaise) {
        if (key == null || key.isBlank() || key.length() > 128) {
            throw new FleetApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "Try again.");
        }
        if (amountPaise == null || amountPaise < 1) {
            throw FleetApiException.invalid("Choose an amount to withdraw.");
        }
        earnings.lockRider(riderId);
        LocalDate today = jdbc.queryForObject("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date", LocalDate.class);
        List<Map<String, Object>> asked = jdbc.queryForList("SELECT amount_paise, idem_key FROM fleet_schema.rider_withdrawal_day "
            + "WHERE rider_id = ? AND request_date = ?", riderId, today);
        if (!asked.isEmpty()) {
            if (!key.equals(asked.get(0).get("idem_key"))) {
                throw FleetApiException.conflict("WITHDRAWAL_LIMIT", "You can withdraw once a day. Try again tomorrow; Monday's payout sends the rest.");
            }
            if (((Number) asked.get(0).get("amount_paise")).longValue() != amountPaise) {
                throw FleetApiException.conflict("IDEMPOTENCY_KEY_REUSED", "This request was already sent with another amount.");
            }
            return;
        }
        Map<String, Object> account = jdbc.queryForList("SELECT id, payouts_paused_at FROM fleet_schema.rider_payout_account WHERE rider_id = ? "
            + "AND state = 'ACTIVE'", riderId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.conflict("PAYOUT_ACCOUNT_REQUIRED",
                "Ops needs to check your bank account or UPI ID with you first. Call rider support."));
        if (account.get("payouts_paused_at") != null) {
            throw FleetApiException.conflict("PAYOUTS_PAUSED", "Your last payout did not reach your bank. Your money is safe in your "
                + "balance; ops will set up a new account with you.");
        }
        long withdrawable = balance(riderId).withdrawable();
        if (amountPaise > withdrawable) {
            throw FleetApiException.conflict("AMOUNT_OVER_BALANCE", "You can withdraw up to " + FleetRiderService.rupees(withdrawable) + " now.");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO fleet_schema.rider_payout_instruction (id, rider_id, kind, payout_date, amount_paise, payout_account_id) "
            + "VALUES (?, ?, 'DAILY_WITHDRAWAL', ?, ?, ?)", id, riderId, today.plusDays(1), amountPaise, account.get("id"));
        jdbc.update("INSERT INTO fleet_schema.rider_withdrawal_day (rider_id, request_date, amount_paise, instruction_id, idem_key) "
            + "VALUES (?, ?, ?, ?, ?)", riderId, today, amountPaise, id, key);
    }

    /** Monday's payout: today until 15:00 IST on a Monday, otherwise the next Monday. */
    static LocalDate nextPayoutOn(ZonedDateTime now) {
        LocalDate today = now.toLocalDate();
        return today.getDayOfWeek() == DayOfWeek.MONDAY && now.toLocalTime().isBefore(WEEKLY_SENT_BY) ? today
            : today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    }

    Balance balance(UUID riderId) {
        return jdbc.queryForObject(BALANCE, (row, n) -> new Balance(row.getLong("released"), row.getLong("debt"), row.getLong("paid"),
            row.getLong("recovered"), recoveryCapPaise), riderId);
    }

    // ---- Ops (admin-fleet-v1 /payout-batches) ----

    @Transactional(readOnly = true)
    public BatchPage batches(Admin viewer) {
        return new BatchPage(jdbc.query(HEADER + "ORDER BY b.created_at DESC, b.id DESC LIMIT 100", (row, n) -> header(row, viewer, null)));
    }

    @Transactional(readOnly = true)
    public PayoutBatch batch(Admin viewer, UUID batchId) {
        List<Payout> payouts = jdbc.query(PAYOUT + "WHERE i.batch_id = ? ORDER BY r.name, i.id", (row, n) -> payout(row), batchId);
        return jdbc.query(HEADER + "WHERE b.id = ?", (row, n) -> header(row, viewer, payouts), batchId).stream().findFirst()
            .orElseThrow(FleetPayouts::batchNotFound);
    }

    /**
     * WEEKLY (a Monday): every rider with a verified, unpaused account gets their whole withdrawable balance, after this
     * week's debt recovery (at most the cap). DAILY_WITHDRAWAL: the withdrawals requested for this date or before and not
     * yet in a batch, to each rider's current account. Riders with nothing to pay are left out; nothing is ever debited.
     * The payout date is today or earlier (IST).
     */
    @Transactional
    public Object createBatch(Admin by, UUID key, BatchInput input) {
        if (input == null || !KINDS.contains(input.kind()) || input.payoutDate() == null) {
            throw FleetApiException.invalid("Choose WEEKLY or DAILY_WITHDRAWAL and the payout date.");
        }
        if ("WEEKLY".equals(input.kind()) && input.payoutDate().getDayOfWeek() != DayOfWeek.MONDAY) {
            throw FleetApiException.unprocessable("NOT_A_MONDAY", "Weekly payouts go on a Monday.");
        }
        // A file made early would miss pay still coming in, and its date could then never be made again (BATCH_EXISTS).
        if (input.payoutDate().isAfter(jdbc.queryForObject("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date", LocalDate.class))) {
            throw FleetApiException.unprocessable("PAYOUT_DATE_IN_FUTURE", "Make the payout file on its payout date (IST), not before.");
        }
        return admin.once(by, key, "PAYOUT_BATCH_CREATED", input.kind() + "\n" + input.payoutDate(), () -> {
            UUID id = UUID.randomUUID();
            try {
                jdbc.update("INSERT INTO fleet_schema.rider_payout_batch (id, kind, payout_date, created_by, created_by_name) VALUES (?, ?, ?, ?, ?)",
                    id, input.kind(), input.payoutDate(), by.id(), by.name());
            } catch (DuplicateKeyException exception) {
                throw FleetApiException.conflict("BATCH_EXISTS", "A " + input.kind() + " payout file for " + input.payoutDate() + " exists already.");
            }
            int count = "WEEKLY".equals(input.kind()) ? weekly(id, input.payoutDate()) : jdbc.update("""
                UPDATE fleet_schema.rider_payout_instruction i SET batch_id = ?, payout_account_id = a.id
                FROM fleet_schema.rider_payout_account a
                WHERE i.kind = 'DAILY_WITHDRAWAL' AND i.batch_id IS NULL AND i.state = 'PENDING' AND i.payout_date <= ?
                  AND a.rider_id = i.rider_id AND a.state = 'ACTIVE' AND a.payouts_paused_at IS NULL""", id, input.payoutDate());
            if (count == 0) {
                throw FleetApiException.unprocessable("NOTHING_TO_PAY", "No rider has money to pay for this file.");
            }
            PayoutBatch batch = batch(by, id);
            return new Done(batch, null, id.toString(), "Made the " + input.kind() + " payout file for " + input.payoutDate() + ": "
                + count + " payouts, " + FleetRiderService.rupees(batch.totalPaise()) + ".");
        });
    }

    /** The second approver: never the admin who made the file (403 SAME_APPROVER). */
    @Transactional
    public Object approve(Admin by, UUID key, UUID batchId) {
        return admin.once(by, key, "PAYOUT_BATCH_APPROVED", batchId.toString(), () -> {
            Map<String, Object> batch = lockBatch(batchId);
            if (by.id().equals(batch.get("created_by"))) {
                throw new FleetApiException(403, "SAME_APPROVER", "You made this payout file, so another payments admin must approve it.");
            }
            if (!"CREATED".equals(batch.get("status"))) {
                throw FleetApiException.conflict("BATCH_NOT_CREATED", "This payout file was approved already.");
            }
            jdbc.update("UPDATE fleet_schema.rider_payout_batch SET status = 'APPROVED', approved_by = ?, approved_by_name = ?, approved_at = now() "
                + "WHERE id = ?", by.id(), by.name(), batchId);
            PayoutBatch approved = batch(by, batchId);
            return new Done(approved, null, batchId.toString(), "Approved the payout file as the second approver: " + approved.payoutCount()
                + " payouts, " + FleetRiderService.rupees(approved.totalPaise()) + ".");
        });
    }

    /** Records that the approved file was uploaded to the bank; its payouts are then processing. */
    @Transactional
    public Object markSent(Admin by, UUID key, UUID batchId) {
        return admin.once(by, key, "PAYOUT_BATCH_SENT", batchId.toString(), () -> {
            if (!"APPROVED".equals(lockBatch(batchId).get("status"))) {
                throw FleetApiException.conflict("BATCH_NOT_APPROVED", "Only an approved payout file can be marked sent.");
            }
            jdbc.update("UPDATE fleet_schema.rider_payout_batch SET status = 'SENT', sent_at = now() WHERE id = ?", batchId);
            return new Done(batch(by, batchId), null, batchId.toString(), "Marked the payout file sent to the bank.");
        });
    }

    /** One payout of a sent file reached the rider: the bank's UTR, and the journal moves RIDER_PAYABLE to BANK. */
    @Transactional
    public Object markPaid(Admin by, UUID key, UUID batchId, UUID payoutId, String utr) {
        String reference = utr == null ? "" : utr.trim().toUpperCase(Locale.ROOT);
        if (!reference.matches("^[A-Z0-9]{12,22}$")) {
            throw FleetApiException.invalid("Enter the bank's UTR: 12 to 22 letters and digits.");
        }
        if (!ledgerOn) {
            throw new FleetApiException(503, "LEDGER_POSTING_OFF", "Payouts are recorded in the financial journal, which is off. "
                + "Turn on CRAVES_LEDGER_POSTING_ENABLED, then add the UTR.");
        }
        return admin.once(by, key, "PAYOUT_PAID", batchId + "/" + payoutId + "\n" + reference, () -> {
            Map<String, Object> payout = pendingPayout(batchId, payoutId);
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_instruction WHERE utr = ?)",
                Boolean.class, reference))) {
                throw utrInUse();
            }
            try {
                jdbc.update("UPDATE fleet_schema.rider_payout_instruction SET state = 'PAID', utr = ?, marked_by = ?, marked_by_name = ?, "
                    + "marked_at = now() WHERE id = ?", reference, by.id(), by.name(), payoutId);
            } catch (DuplicateKeyException exception) {
                throw utrInUse();
            }
            String money = LedgerMoney.text(BigDecimal.valueOf(((Number) payout.get("amount_paise")).longValue(), 2));
            String ledgerKey = "fleet-payout/" + payoutId + "/paid";
            var receipt = ledger.post(new LedgerJournal.Entry(ledgerKey, UUID.nameUUIDFromBytes(ledgerKey.getBytes(StandardCharsets.UTF_8)),
                "craves-fleet", "RIDER_PAYOUT_PAID", null, null, "INR", Instant.now(), "utr/" + reference, null, "HUMAN", by.id().toString(),
                List.of(new LedgerJournal.Line("RIDER_PAYABLE", "INR", money, "0.00", null, null, "craves_fleet", null, null, payoutId),
                    new LedgerJournal.Line("BANK", "INR", "0.00", money, null, null, "craves_fleet", null, null, payoutId))));
            if (receipt.outcome() == LedgerJournal.Outcome.CONFLICT) {
                throw new IllegalStateException("FLEET_LEDGER_CONFLICT " + ledgerKey);
            }
            closeIfDone(batchId);
            return new Done(payout(payoutId), (UUID) payout.get("rider_id"), payoutId.toString(), "Marked the payout of "
                + FleetRiderService.rupees(((Number) payout.get("amount_paise")).longValue()) + " paid, UTR " + reference + ".");
        });
    }

    /**
     * The bank reported a final failure (never while it is still processing): the money stays in the rider's balance and
     * the rider's payouts pause until ops sets a new account.
     */
    @Transactional
    public Object markFailed(Admin by, UUID key, UUID batchId, UUID payoutId, String reason) {
        String text = FleetAdminService.reason(reason);
        return admin.once(by, key, "PAYOUT_FAILED", batchId + "/" + payoutId + "\n" + text, () -> {
            Map<String, Object> payout = pendingPayout(batchId, payoutId);
            jdbc.update("UPDATE fleet_schema.rider_payout_instruction SET state = 'FAILED', failure_reason = ?, marked_by = ?, marked_by_name = ?, "
                + "marked_at = now() WHERE id = ?", text, by.id(), by.name(), payoutId);
            jdbc.update("UPDATE fleet_schema.rider_payout_account SET payouts_paused_at = now(), paused_reason = ? WHERE id = ? AND state = 'ACTIVE' "
                + "AND payouts_paused_at IS NULL", text, payout.get("payout_account_id"));
            closeIfDone(batchId);
            return new Done(payout(payoutId), (UUID) payout.get("rider_id"), payoutId.toString(), "Marked the payout failed: " + text
                + ". The money stays in the rider's balance; their payouts pause until a new account is set.");
        });
    }

    /**
     * The bank's IMPS bulk file: one row per payout with the full account number or UPI ID, decrypted only here. Cells a
     * spreadsheet would read as a formula start with an apostrophe. Every download is audited.
     */
    @Transactional
    public FileContent file(Admin by, UUID batchId) {
        Map<String, Object> batch = jdbc.queryForList("SELECT kind, payout_date, status FROM fleet_schema.rider_payout_batch WHERE id = ?", batchId)
            .stream().findFirst().orElseThrow(FleetPayouts::batchNotFound);
        if (!cipher.ready()) {
            throw new FleetApiException(503, "PAYOUT_ACCOUNT_STORAGE_UNAVAILABLE", "Encrypted storage for payout accounts is not ready.");
        }
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of("payoutId", "holderName", "accountOrUpiId", "ifsc", "amountRupees"));
        long total = 0;
        for (Map<String, Object> row : jdbc.queryForList("SELECT i.id, i.rider_id, i.amount_paise, a.id AS account_id, a.encrypted_details "
            + "FROM fleet_schema.rider_payout_instruction i JOIN fleet_schema.rider_payout_account a ON a.id = i.payout_account_id "
            + "WHERE i.batch_id = ? ORDER BY i.id", batchId)) {
            BankOnboardingModels.Details details = cipher.decrypt((UUID) row.get("account_id"), (UUID) row.get("rider_id"),
                (String) row.get("encrypted_details"));
            long amount = ((Number) row.get("amount_paise")).longValue();
            total += amount;
            rows.add(List.of(row.get("id").toString(), details.name(), details.accountNumber(), details.ifsc() == null ? "" : details.ifsc(),
                BigDecimal.valueOf(amount, 2).toPlainString()));
        }
        admin.audit(by, "PAYOUT_FILE_DOWNLOADED", null, batchId.toString(), "Downloaded the bank file of the " + batch.get("kind")
            + " payouts for " + batch.get("payout_date") + " (" + batch.get("status") + "): " + (rows.size() - 1) + " payouts, "
            + FleetRiderService.rupees(total) + ".");
        return new FileContent("text/csv; charset=UTF-8", RiderJoinsExitsExport.csv(rows).getBytes(StandardCharsets.UTF_8));
    }

    /** A weekly file's payouts and this week's recoveries; returns how many payouts. Rider rows locked in id order. */
    private int weekly(UUID batchId, LocalDate monday) {
        int count = 0;
        for (Map<String, Object> rider : jdbc.queryForList("SELECT r.id, a.id AS account_id FROM fleet_schema.rider r "
            + "JOIN fleet_schema.rider_payout_account a ON a.rider_id = r.id AND a.state = 'ACTIVE' AND a.payouts_paused_at IS NULL "
            + "ORDER BY r.id FOR NO KEY UPDATE OF r")) {
            UUID riderId = (UUID) rider.get("id");
            Balance balance = balance(riderId);
            if (balance.recovery() > 0) {
                jdbc.update("INSERT INTO fleet_schema.rider_recovery (rider_id, week_start, amount_paise, batch_id) VALUES (?, ?, ?, ?)",
                    riderId, monday, balance.recovery(), batchId);
            }
            if (balance.withdrawable() > 0) {
                jdbc.update("INSERT INTO fleet_schema.rider_payout_instruction (id, rider_id, kind, payout_date, amount_paise, payout_account_id, "
                    + "batch_id) VALUES (?, ?, 'WEEKLY', ?, ?, ?, ?)", UUID.randomUUID(), riderId, monday, balance.withdrawable(),
                    rider.get("account_id"), batchId);
                count++;
            }
        }
        return count;
    }

    private Map<String, Object> lockBatch(UUID batchId) {
        return jdbc.queryForList("SELECT created_by, status FROM fleet_schema.rider_payout_batch WHERE id = ? FOR UPDATE", batchId).stream()
            .findFirst().orElseThrow(FleetPayouts::batchNotFound);
    }

    /** The payout, locked, when its file was sent and it is still pending. */
    private Map<String, Object> pendingPayout(UUID batchId, UUID payoutId) {
        String status = (String) lockBatch(batchId).get("status");
        Map<String, Object> payout = jdbc.queryForList("SELECT rider_id, amount_paise, state, payout_account_id FROM "
                + "fleet_schema.rider_payout_instruction WHERE id = ? AND batch_id = ? FOR UPDATE", payoutId, batchId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.notFound("PAYOUT_NOT_FOUND", "No such payout in this file."));
        if (!"SENT".equals(status) && !"CLOSED".equals(status)) {
            throw FleetApiException.conflict("BATCH_NOT_SENT", "Mark the file sent to the bank first.");
        }
        if (!"PENDING".equals(payout.get("state"))) {
            throw FleetApiException.conflict("PAYOUT_NOT_PENDING", "This payout was marked already.");
        }
        return payout;
    }

    private void closeIfDone(UUID batchId) {
        jdbc.update("UPDATE fleet_schema.rider_payout_batch SET status = 'CLOSED', closed_at = now() WHERE id = ? AND status = 'SENT' "
            + "AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_instruction WHERE batch_id = ? AND state = 'PENDING')", batchId, batchId);
    }

    private Payout payout(UUID payoutId) {
        return jdbc.queryForObject(PAYOUT + "WHERE i.id = ?", (row, n) -> payout(row), payoutId);
    }

    private static Payout payout(ResultSet row) throws SQLException {
        Timestamp marked = row.getTimestamp("marked_at");
        return new Payout(row.getObject("id", UUID.class), row.getObject("rider_id", UUID.class), row.getString("name"),
            row.getLong("amount_paise"), row.getString("masked_account"), row.getString("state"), row.getString("utr"),
            row.getString("failure_reason"), row.getString("marked_by_name"), marked == null ? null : marked.toInstant());
    }

    private static PayoutBatch header(ResultSet row, Admin viewer, List<Payout> payouts) throws SQLException {
        Timestamp approved = row.getTimestamp("approved_at");
        Timestamp sent = row.getTimestamp("sent_at");
        UUID creator = row.getObject("created_by", UUID.class);
        return new PayoutBatch(row.getObject("id", UUID.class), row.getString("kind"), row.getObject("payout_date", LocalDate.class),
            row.getString("status"), row.getLong("total"), row.getInt("payouts"), row.getString("created_by_name"),
            creator.equals(viewer.id()), row.getTimestamp("created_at").toInstant(), row.getString("approved_by_name"),
            approved == null ? null : approved.toInstant(), sent == null ? null : sent.toInstant(), payouts);
    }

    private static FleetApiException batchNotFound() {
        return FleetApiException.notFound("BATCH_NOT_FOUND", "No such payout file.");
    }

    private static FleetApiException utrInUse() {
        return FleetApiException.conflict("UTR_IN_USE", "This UTR is on another payout already. Check it with the bank statement.");
    }

    /**
     * A rider's money. available = released - paid - recovered; outstanding debt = debt - recovered. A withdrawal or the
     * weekly payout may take what is available less this week's recovery (the outstanding debt, at most the weekly cap),
     * which the weekly batch takes from what is there, never more. Nothing is ever taken from the rider's bank.
     */
    record Balance(long released, long debt, long paid, long recovered, long cap) {
        long available() {
            return released - paid - recovered;
        }

        long outstanding() {
            return Math.max(0, debt - recovered);
        }

        long recovery() {
            return Math.min(Math.min(outstanding(), cap), Math.max(0, available()));
        }

        long withdrawable() {
            return Math.max(0, available() - Math.min(outstanding(), cap));
        }
    }
}

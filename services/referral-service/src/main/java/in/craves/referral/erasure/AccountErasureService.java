package in.craves.referral.erasure;

import in.craves.referral.infra.Store;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import static in.craves.referral.infra.Store.number;

/**
 * Account deletion. Nothing personal is stored here except the hashes of the sign-up signals (contact, device, payment),
 * which stay on purpose: they stop a deleted person from joining again to claim the new-user offer. The journal is
 * append-only, so a forfeiture is a new entry, never an edit.
 *
 * <p>CUSTOMER forfeits the unused credit in the legacy referral wallet (owner decision 7): one journal entry that takes the
 * available balance to zero. Money still in flight (pending rewards, a cash-out reservation) is not unused credit and is left.
 * The entry's counterparty is CHECKOUT_CLEARING because the finance mirror in integration-service accepts only the existing
 * counterparties; a dedicated forfeiture account needs a change there first.
 *
 * <p>ALL also retires the member's code: the member row is flagged inactive, which the registration path already refuses as a
 * parent, and its source version is pinned to the maximum so no later auth status event can switch it back on. The member row
 * is shared by both sides of a login that stays after a one-side erase (and by chef commissions), so CUSTOMER and CHEF alone
 * never retire it. CHEF has nothing of its own to erase here: chef cash earnings are reported as owed by integration-service.
 */
@Service
public class AccountErasureService {
    public static final String SERVICE = "referral";
    public enum Scope { CUSTOMER, CHEF, ALL }
    public record Blocker(String code, String detail) { }
    /** A done erase carries counts, a blocked one carries its blockers. */
    public record Result(boolean done, Map<String, Integer> counts, List<Blocker> blockers) { }
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    /** Auth status versions are small counters; the largest int is never sent, so this wins over any later event. */
    private static final int RETIRED_VERSION = Integer.MAX_VALUE;
    private final Store db;

    public AccountErasureService(Store db) {
        this.db = db;
    }

    /** A fraud case belongs to the person, not to one side, so every scope sees it. A reviewed case (cleared or confirmed) is history. */
    public List<Blocker> blockers(UUID identity) {
        if (!schemaExists() || db.count("SELECT count(*) FROM referral_schema.fraud_case WHERE user_id=? AND status='OPEN'", identity) == 0) {
            return List.of();
        }
        return List.of(new Blocker("FRAUD_CASE_OPEN", "A referral fraud case for this person is still open; staff must review it before the account can be deleted"));
    }

    public Result erase(UUID requestId, UUID identity, Scope scope) {
        Result result = db.tx(() -> {
            if (!schemaExists()) {
                return done(0, 0);
            }
            // Holds off a fraud case or an auth status event for this member until we commit.
            db.rows("SELECT user_id FROM referral_schema.member WHERE user_id=? FOR UPDATE", identity);
            List<Blocker> blockers = blockers(identity);
            if (!blockers.isEmpty()) {
                return new Result(false, null, blockers);
            }
            int journal = scope == Scope.CHEF ? 0 : forfeit(identity, requestId);
            int member = scope != Scope.ALL ? 0 : db.update(
                "UPDATE referral_schema.member SET is_active=false,source_version=? WHERE user_id=? AND (is_active OR source_version<?)",
                RETIRED_VERSION, identity, RETIRED_VERSION);
            return done(journal, member);
        });
        if (result.done()) {
            LOGGER.info("account erasure service={} requestId={} scope={} counts={}", SERVICE, requestId, scope, result.counts());
        }
        return result;
    }

    private int forfeit(UUID identity, UUID requestId) {
        var wallet = db.rows("SELECT available_paise FROM referral_schema.wallet WHERE user_id=? FOR UPDATE", identity);
        long available = wallet.isEmpty() ? 0 : number(wallet.getFirst(), "available_paise");
        if (available <= 0) {
            return 0;
        }
        // A refund can restore credit after an earlier erase, so each forfeiture gets its own key.
        long earlier = db.count("SELECT count(*) FROM referral_schema.journal WHERE event_key LIKE ?", "forfeit:" + identity + ":%");
        db.journal("forfeit:" + identity + ":" + (earlier + 1), identity, 0, -available, 0, "CHECKOUT_CLEARING", null, requestId);
        return 1;
    }

    /** The program can be deployed before its schema is created; a deletion must not wait on tables that do not exist. */
    private boolean schemaExists() {
        return Boolean.TRUE.equals(db.jdbc.queryForObject("SELECT to_regclass('referral_schema.member') IS NOT NULL", Boolean.class));
    }

    private static Result done(int journal, int member) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("journal", journal);
        counts.put("member", member);
        return new Result(true, counts, null);
    }
}

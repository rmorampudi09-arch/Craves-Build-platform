package in.craves.integration.referrals;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Uses verified mirrored credits only. Caller holds the shared chef-payout lock. */
public final class ReferralManualPayables {
    public record Payable(UUID postingId,BigDecimal amount) {}
    private ReferralManualPayables() {}
    public static List<Payable> available(JdbcTemplate db,UUID chef) {
        return db.query("SELECT posting_id,amount FROM payment_schema.finance_referral_available WHERE chef_identity_id=? AND amount>0 ORDER BY posting_id",
            (rs,n)->new Payable(rs.getObject(1,UUID.class),rs.getBigDecimal(2).setScale(2,java.math.RoundingMode.UNNECESSARY)),chef);
    }
    public static BigDecimal total(JdbcTemplate db,UUID chef) {
        return available(db,chef).stream().map(Payable::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
    }
    public static BigDecimal allocated(JdbcTemplate db,UUID chef) {
        return db.queryForObject("SELECT coalesce(sum(a.amount),0) FROM payment_schema.finance_referral_allocation a JOIN payment_schema.chef_referral_posting r ON r.posting_id=a.posting_id WHERE r.beneficiary_id=? AND a.active",BigDecimal.class,chef);
    }
    public static void reserve(JdbcTemplate db,UUID instruction,List<Payable> items) {
        for(var item:items) db.update("INSERT INTO payment_schema.finance_referral_allocation(instruction_id,posting_id,amount) VALUES (?,?,?)",instruction,item.postingId(),item.amount());
    }
    public static void release(JdbcTemplate db,UUID instruction) {
        db.update("UPDATE payment_schema.finance_referral_allocation SET active=false WHERE instruction_id=? AND active",instruction);
    }
}

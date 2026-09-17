package in.craves.integration.settlement;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Read-only, full-history source accounting. Never reconstruct old test orders or create payables. */
public record ChefAccountingSummary(long recordedOrders, String grossFood, String totalServiceFee,
        String feeBeforeGst, String feeGst, String withholding, String originalNetEarnings,
        String recordedPayments, String outstanding, String otherLedgerMovements, long legacyRecords) {
    public static ChefAccountingSummary read(JdbcTemplate jdbc, UUID chef) {
        return jdbc.queryForObject("""
            WITH earnings AS (
              SELECT count(*) AS orders,coalesce(sum(gross),0) AS gross,
                     coalesce(sum(service_fee),0) AS fee,coalesce(sum(fee_gst),0) AS gst,
                     coalesce(sum(withholding),0) AS withholding,coalesce(sum(payable),0) AS earned
              FROM payment_schema.finance_earning_projection WHERE chef_identity_id=?
            ), payments AS (
              SELECT coalesce(sum(amount),0) AS paid FROM payment_schema.finance_payout_instruction
              WHERE chef_identity_id=? AND settlement_journal_id IS NOT NULL AND reversal_journal_id IS NULL
            ), liability AS (
              SELECT coalesce(sum(credit_amount-debit_amount),0) AS outstanding
              FROM payment_schema.ledger_line WHERE chef_identity_id=? AND account_code='CHEF_PAYABLE'
            )
            SELECT e.*,p.paid,l.outstanding,
              (SELECT count(*) FROM payment_schema.chef_earning_entry WHERE chef_identity_id=?) AS legacy
            FROM earnings e CROSS JOIN payments p CROSS JOIN liability l
            """, (rs,n) -> {
                BigDecimal fee=rs.getBigDecimal("fee"),gst=rs.getBigDecimal("gst"),earned=rs.getBigDecimal("earned"),
                        paid=rs.getBigDecimal("paid"),outstanding=rs.getBigDecimal("outstanding");
                return new ChefAccountingSummary(rs.getLong("orders"),LedgerMoney.text(rs.getBigDecimal("gross")),
                        LedgerMoney.text(fee.add(gst)),LedgerMoney.text(fee),LedgerMoney.text(gst),
                        LedgerMoney.text(rs.getBigDecimal("withholding")),LedgerMoney.text(earned),
                        LedgerMoney.text(paid),signed(outstanding),signed(outstanding.subtract(earned).add(paid)),rs.getLong("legacy"));
            },chef,chef,chef,chef);
    }
    private static String signed(BigDecimal value) { return value.setScale(2,java.math.RoundingMode.UNNECESSARY).toPlainString(); }
}

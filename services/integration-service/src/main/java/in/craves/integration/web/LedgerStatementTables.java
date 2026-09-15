package in.craves.integration.web;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Additive authenticated document data. Legacy balances are never silently reconstructed. */
final class LedgerStatementTables {
    private LedgerStatementTables() {}
    static List<Map<String,Object>> read(JdbcTemplate jdbc,UUID chef,Instant from,Instant to,String currency,String zone,boolean earnings) {
        if(!"INR".equals(currency) || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('payment_schema.finance_earning_projection') IS NOT NULL",Boolean.class)))return List.of();
        var tables=new ArrayList<Map<String,Object>>();
        if(earnings) {
            var rows=jdbc.query("SELECT e.chef_order_id,e.gross,e.service_fee,e.fee_gst,e.withholding,e.payable,e.created_at,s.payload->'policy'->>'chefFeePercent' AS rate FROM payment_schema.finance_earning_projection e JOIN payment_schema.finance_issued_snapshot s ON s.id=e.snapshot_id WHERE e.chef_identity_id=? AND e.created_at>=? AND e.created_at<? ORDER BY e.created_at,e.chef_order_id LIMIT 1001",
                (rs,n)->List.of(rs.getObject(1).toString(),money(rs.getBigDecimal(2)),money(rs.getBigDecimal(3)),money(rs.getBigDecimal(4)),money(rs.getBigDecimal(5)),money(rs.getBigDecimal(6)),ChefDocumentSourceController.date(rs.getTimestamp(7).toInstant(),zone),rs.getString(8)+"%"),chef,Timestamp.from(from),Timestamp.from(to));
            ChefDocumentSourceController.bounded(rows.size());
            tables.add(ChefDocumentSourceController.table("Delivered earnings from the immutable ledger (INR)",List.of("Chef order","Gross food","Craves fee","GST on fee","Withholding","Net earned","Posted","Fee rate"),rows));
        } else {
            var rows=jdbc.query("SELECT id,created_at,mode,status,amount,transfer_reference,settlement_journal_id,reversal_journal_id,payout_channel,manual_paid_at FROM payment_schema.finance_payout_instruction i WHERE chef_identity_id=? AND ((created_at>=? AND created_at<?) OR (payout_channel='CRAVES_MANUAL' AND EXISTS(SELECT 1 FROM payment_schema.finance_manual_settlement_action a WHERE a.instruction_id=i.id AND a.created_at>=? AND a.created_at<?))) ORDER BY created_at,id LIMIT 1001",
                (rs,n)->List.of(rs.getObject(1).toString(),ChefDocumentSourceController.date(rs.getTimestamp(2).toInstant(),zone),("CRAVES_MANUAL".equals(rs.getString(9))?"Craves manual":rs.getString(3)),rs.getString(4),money(rs.getBigDecimal(5)),rs.getString(6)==null?"Not confirmed":rs.getString(6),rs.getObject(8)!=null?"Linked reversal":rs.getObject(7)!=null?"Confirmed journal":"Not settled",rs.getTimestamp(10)==null?"Not recorded":ChefDocumentSourceController.date(rs.getTimestamp(10).toInstant(),zone)),chef,Timestamp.from(from),Timestamp.from(to),Timestamp.from(from),Timestamp.from(to));
            ChefDocumentSourceController.bounded(rows.size());
            tables.add(ChefDocumentSourceController.table("Chef payment instruction history (INR)",List.of("Instruction","Requested","Mode","State","Amount","Bank reference","Accounting evidence","Manual paid at"),rows));
        }
        BigDecimal opening=jdbc.queryForObject("SELECT coalesce(sum(l.credit_amount-l.debit_amount),0) FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t ON t.id=l.transaction_id WHERE l.chef_identity_id=? AND l.account_code='CHEF_PAYABLE' AND t.posted_at<?",BigDecimal.class,chef,Timestamp.from(from));
        var movements=jdbc.queryForMap("SELECT coalesce(sum(l.credit_amount),0) AS credits,coalesce(sum(l.debit_amount),0) AS debits FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t ON t.id=l.transaction_id WHERE l.chef_identity_id=? AND l.account_code='CHEF_PAYABLE' AND t.posted_at>=? AND t.posted_at<?",chef,Timestamp.from(from),Timestamp.from(to));
        BigDecimal credits=(BigDecimal)movements.get("credits");
        BigDecimal debits=(BigDecimal)movements.get("debits");
        BigDecimal closing=opening.add(credits).subtract(debits);
        List<List<String>> summary=List.of(
            List.of("Opening recorded outstanding",money(opening)),
            List.of("Liability increases in period",money(credits)),
            List.of("Liability decreases in period",money(debits)),
            List.of("Closing recorded outstanding",money(closing))
        );
        tables.add(ChefDocumentSourceController.table("New-ledger outstanding liability reconciliation (INR)",List.of("Movement","Amount"),summary));
        return tables;
    }
    static void checkTotal(List<Map<String,Object>> tables) {
        int total=tables.stream().mapToInt(t->((List<?>)t.get("rows")).size()).sum();
        ChefDocumentSourceController.bounded(total);
    }
    private static String money(BigDecimal value){return value.setScale(2).toPlainString();}
}

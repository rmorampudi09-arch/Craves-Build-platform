package in.craves.integration.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralJournalMirror {
    private final JdbcTemplate db;private final LedgerPostingService ledger;
    public ReferralJournalMirror(JdbcTemplate db,LedgerPostingService ledger){this.db=db;this.ledger=ledger;}
    public void applyChef(UUID event,JsonNode body){new ChefReferralEarningsMirror(db,ledger).apply(event,body);}
    public void apply(UUID event,JsonNode body){
        var lines=lines(body);
        if(!body.path("journalId").isIntegralNumber() || !body.path("journalId").canConvertToLong())throw new IllegalArgumentException("Exact referral journal identity required");
        long journal=body.path("journalId").longValue();
        if(journal<1)throw new IllegalArgumentException("Referral journal identity required");
        UUID user=UUID.fromString(body.path("userId").asText());
        var entry=new LedgerJournal.Entry("referral-journal/"+journal,event,"referral-service","REFERRAL_JOURNAL",null,null,"INR",
            Instant.parse(body.path("occurredAt").asText()),"referral-journal/"+journal,null,"SERVICE","referral-finance-consumer",lines);
        var posted=ledger.post(entry);
        if(posted.outcome()==LedgerJournal.Outcome.CONFLICT)throw new IllegalStateException("REFERRAL_LEDGER_CONFLICT");
        db.update("INSERT INTO payment_schema.referral_journal_projection(source_journal_id,source_event_id,user_id,pending_delta,available_delta,reserved_delta,journal_id) VALUES (?,?,?,?,?,?,?)",journal,event,user,delta(body,"pendingDeltaPaise"),delta(body,"availableDeltaPaise"),delta(body,"reservedDeltaPaise"),posted.transactionId());
    }
    public static java.util.List<LedgerJournal.Line> lines(JsonNode body){
        if(!"INR".equals(body.path("currency").asText()))throw new IllegalArgumentException("INR required");
        long p=delta(body,"pendingDeltaPaise"),a=delta(body,"availableDeltaPaise"),r=delta(body,"reservedDeltaPaise"),c=delta(body,"counterpartyDeltaPaise");
        if(Math.addExact(Math.addExact(p,a),Math.addExact(r,c))!=0)throw new IllegalArgumentException("Unbalanced referral source");
        var result=new ArrayList<LedgerJournal.Line>();
        liability(result,"REFERRAL_PENDING",p);liability(result,"REFERRAL_AVAILABLE",a);liability(result,"REFERRAL_RESERVED",r);
        String counterparty=body.path("counterparty").asText();
        if(counterparty.equals("INTERNAL_TRANSFER")){if(c!=0)throw new IllegalArgumentException("Invalid internal transfer");}
        else {
            String account=Map.of("UPLINE_EXPENSE","REFERRAL_UPLINE_EXPENSE","MARKETING_EXPENSE","REFERRAL_MARKETING_EXPENSE","CHECKOUT_CLEARING","REFERRAL_CHECKOUT_CLEARING","PAYOUT_CLEARING","REFERRAL_PAYOUT_CLEARING","WITHHOLDING_CLEARING","REFERRAL_WITHHOLDING_CLEARING").get(counterparty);
            if(account==null)throw new IllegalArgumentException("Unknown referral counterparty");liability(result,account,c);
        }
        if(result.size()<2)throw new IllegalArgumentException("Empty referral journal");return java.util.List.copyOf(result);
    }
    private static void liability(java.util.List<LedgerJournal.Line> lines,String account,long value){
        if(value==0)return;BigDecimal amount=BigDecimal.valueOf(value).abs().movePointLeft(2);
        lines.add(value>0?LedgerJournal.Line.credit(account,amount,null):LedgerJournal.Line.debit(account,amount,null));
    }
    static long delta(JsonNode body,String field){var n=body.path(field);if(!n.isTextual() || !n.asText().matches("-?(0|[1-9][0-9]{0,12})"))throw new IllegalArgumentException("Exact signed paise required");return Long.parseLong(n.asText());}
}

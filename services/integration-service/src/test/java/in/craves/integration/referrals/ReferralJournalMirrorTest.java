package in.craves.integration.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReferralJournalMirrorTest {
    private final ObjectMapper json=new ObjectMapper();
    private com.fasterxml.jackson.databind.node.ObjectNode source(String p,String a,String r,String c,String account){return json.createObjectNode().put("currency","INR").put("pendingDeltaPaise",p).put("availableDeltaPaise",a).put("reservedDeltaPaise",r).put("counterpartyDeltaPaise",c).put("counterparty",account);}
    @Test void awardDebitsCravesExpenseWithoutChangingChefPayable(){var lines=ReferralJournalMirror.lines(source("2000","0","0","-2000","UPLINE_EXPENSE"));assertEquals(2,lines.size());assertEquals("REFERRAL_PENDING",lines.getFirst().accountCode());assertEquals("20.00",lines.getFirst().credit());assertEquals("REFERRAL_UPLINE_EXPENSE",lines.getLast().accountCode());assertEquals("20.00",lines.getLast().debit());assertTrue(lines.stream().allMatch(x->x.chefIdentityId()==null));}
    @Test void creditIsAReclassificationWithoutNewExpense(){var lines=ReferralJournalMirror.lines(source("-2000","2000","0","0","INTERNAL_TRANSFER"));assertEquals(2,lines.size());assertTrue(lines.stream().noneMatch(x->x.accountCode().contains("EXPENSE")));}
    @Test void reversalsAndSpendPreservePaise(){assertEquals("0.01",ReferralJournalMirror.lines(source("0","-1","0","1","MARKETING_EXPENSE")).getFirst().debit());assertEquals("REFERRAL_CHECKOUT_CLEARING",ReferralJournalMirror.lines(source("0","0","-100","100","CHECKOUT_CLEARING")).getLast().accountCode());}
    @Test void rejectsUnbalancedUnknownAndFractionalData(){assertThrows(IllegalArgumentException.class,()->ReferralJournalMirror.lines(source("1","0","0","0","UPLINE_EXPENSE")));assertThrows(IllegalArgumentException.class,()->ReferralJournalMirror.lines(source("1","0","0","-1","OTHER")));assertThrows(IllegalArgumentException.class,()->ReferralJournalMirror.lines(source("1.1","0","0","-1","UPLINE_EXPENSE")));assertThrows(IllegalArgumentException.class,()->ReferralJournalMirror.lines(source("1","0","0","-1","INTERNAL_TRANSFER")));}
}

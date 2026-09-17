package in.craves.referral;
import in.craves.referral.infra.Json;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class ReferralFinanceTransportIT {
 ReferralTestRig r;
 @BeforeEach void setup(){r=new ReferralTestRig();}
 @Test void originalOrderBindingEmitsOneImmutableFinanceHash(){
  var order=r.order(r.member(null),r.member(null),80000);
  r.db.tx(()->{r.binding.bind(order.binding());return null;});
  var rows=r.db.rows("SELECT payload FROM referral_schema.outbox WHERE event_type='referral.order.bound'");assertEquals(1,rows.size());
  var body=Json.parse(rows.getFirst().get("payload").toString());assertEquals(order.hash(),body.path("sourceSnapshotHash").asText());assertEquals(order.checkout().toString(),body.path("checkoutId").asText());
 }
 @Test void everyEconomicJournalEmitsExactlyOneBalancedFactAndReplayDoesNotDuplicate(){
  var parent=r.member(null);var seller=r.member(parent);var order=r.order(seller,r.member(null),100000);
  r.deliver(order);r.finance(order,1,0,100000);r.awards.award(order.id());r.awards.award(order.id());
  var facts=r.db.rows("SELECT payload FROM referral_schema.outbox WHERE event_type='referral.journal.appended'");
  assertFalse(facts.isEmpty());assertEquals(r.db.count("SELECT count(*) FROM referral_schema.journal"),facts.size());
  for(var fact:facts){var b=Json.parse(fact.get("payload").toString());long total=0;for(String field:new String[]{"pendingDeltaPaise","availableDeltaPaise","reservedDeltaPaise","counterpartyDeltaPaise"}){assertTrue(b.path(field).isTextual());total=Math.addExact(total,Long.parseLong(b.path(field).asText()));}assertEquals(0,total);assertEquals("INR",b.path("currency").asText());assertTrue(b.path("journalId").isIntegralNumber());assertFalse(b.path("occurredAt").asText().isBlank());}
 }
 @Test void sourceRollbackAlsoRollsBackNewFinanceFact(){
  var seller=r.member(null);var buyer=r.member(null);long before=r.db.count("SELECT count(*) FROM referral_schema.outbox");
  assertThrows(IllegalStateException.class,()->r.db.tx(()->{r.order(seller,buyer,80000);throw new IllegalStateException("source rollback");}));
  assertEquals(before,r.db.count("SELECT count(*) FROM referral_schema.outbox"));assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.order_snapshot"));
 }
}

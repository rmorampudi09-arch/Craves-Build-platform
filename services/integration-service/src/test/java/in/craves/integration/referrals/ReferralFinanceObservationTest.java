package in.craves.integration.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReferralFinanceObservationTest {
 ObjectMapper json=new ObjectMapper();
 ObjectNode payload(int version,boolean verified,String at){return json.createObjectNode().put("chefOrderId","o").put("version",version).put("verifiedCapture",verified)
  .put("capturedCheckoutPaise","0").put("observedAt",at).put("evidenceRef","finance-source/o/"+version).put("currency","INR");}
 @Test void repeatOfTheSameFactsIsNotANewEvent(){
  assertTrue(ReferralFinanceObservation.sameFacts(payload(1,false,"2026-11-27T10:00:00Z"),payload(2,false,"2026-11-27T10:00:11Z")));
 }
 @Test void changedFactOrMissingPreviousIsANewEvent(){
  assertFalse(ReferralFinanceObservation.sameFacts(payload(1,false,"2026-11-27T10:00:00Z"),payload(2,true,"2026-11-27T10:00:11Z")));
  assertFalse(ReferralFinanceObservation.sameFacts(payload(1,true,"2026-11-27T10:00:00Z"),payload(2,true,"2026-11-27T10:00:11Z").put("paidAt","2026-11-27T09:59:00Z")));
  assertFalse(ReferralFinanceObservation.sameFacts(null,payload(1,false,"2026-11-27T10:00:00Z")));
  assertFalse(ReferralFinanceObservation.sameFacts(json.missingNode(),payload(1,false,"2026-11-27T10:00:00Z")));
 }
}

package in.craves.integration.finance.source;

import in.craves.integration.finance.DeliveryTariff;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class DeliveryTariffDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    @BeforeEach void setup(){f=new OrderFinancialFinalizationDatabaseTest();f.setup();}
    FinancePolicy policy(String base,DeliveryTariff.DistanceBasis basis){
        return new FinancePolicy(LocalDate.of(2026,9,14),true,false,false,48,0,60,"7","5","18","18","18",
            FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0.00",false,"SYNTHETIC_TEST_ONLY",
            new DeliveryTariff(base,"1","10.00","10",basis,DeliveryTariff.Increment.PRO_RATA));
    }
    void activate(String base){
        f.policies=new FinancePolicyService(f.jdbc,f.json,true,true,false,false,true);
        var draft=f.tx.execute(s->f.policies.draft(f.admin,new FinancePolicyService.DraftRequest(policy(base,DeliveryTariff.DistanceBasis.STRAIGHT_LINE),"Synthetic tariff test")));
        long revision=f.policies.current().revision();
        f.tx.execute(s->f.policies.activate(f.admin,draft.id(),new FinancePolicyService.ActivateRequest(revision,draft.contentHash(),"Synthetic source certification")));
        f.quotes=new OrderFinancialQuoteService(f.jdbc,f.json,f.policies,f.profiles);
    }
    OrderFinancialQuoteService.Request request(OrderFinancialQuoteService.DeliveryCoordinates coordinates){
        var original=f.input(UUID.randomUUID(),f.chef);
        return new OrderFinancialQuoteService.Request(UUID.randomUUID(),f.customer,f.pricedAt,List.of(
            new OrderFinancialQuoteService.OrderInput(original.chefOrderId(),original.chefIdentityId(),original.kitchenId(),"36","36","39.00",original.items(),coordinates)));
    }
    @Test void distanceTariffOverridesFlatChargeAndPreservesInclusiveChefFee(){
        activate("20.00");var request=request(new OrderFinancialQuoteService.DeliveryCoordinates("0","0","0","0.01"));
        var quote=f.tx.execute(s->f.quotes.quote(request));var snapshot=quote.snapshots().getFirst();
        assertEquals("21.12",snapshot.path("delivery").asText());assertEquals("3.80",snapshot.path("deliveryGst").asText());
        assertEquals("412.37",quote.total());assertEquals("343.17",snapshot.path("chefPayable").asText());
        assertEquals("1.112",snapshot.path("deliveryQuote").path("distanceKm").asText());
        activate("30.00");var replay=f.tx.execute(s->f.quotes.quote(request));
        // JSONB may deserialize an integer into a different Jackson numeric node class;
        // compare the complete canonical wire content, not Java numeric node identity.
        assertEquals(FinancialJson.hash(f.json.valueToTree(quote),f.json),FinancialJson.hash(f.json.valueToTree(replay),f.json));
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_issued_snapshot SET payload='{}'::jsonb WHERE id=?",UUID.fromString(snapshot.path("snapshotId").asText())));
    }
    @Test void missingLocationAndOutsideRadiusCannotFallBackToFlatOrFreeDelivery(){
        activate("20.00");long before=f.count("finance_checkout_quote");
        assertThrows(RuntimeException.class,()->f.tx.execute(s->f.quotes.quote(request(null))));
        assertThrows(RuntimeException.class,()->f.tx.execute(s->f.quotes.quote(request(new OrderFinancialQuoteService.DeliveryCoordinates("0","0","0","1")))));
        assertEquals(before,f.count("finance_checkout_quote"));
    }
    @Test void unknownRoadDistanceAndUncertifiedDeploymentBlockActivation(){
        for(var basis:DeliveryTariff.DistanceBasis.values()){
            var service=new FinancePolicyService(f.jdbc,f.json,true,true,false,false,basis==DeliveryTariff.DistanceBasis.ROAD_ROUTE);
            var draft=f.tx.execute(s->service.draft(f.admin,new FinancePolicyService.DraftRequest(policy("20.00",basis),"Synthetic blocked test")));
            long before=service.current().revision();
            assertThrows(RuntimeException.class,()->f.tx.execute(s->service.activate(f.admin,draft.id(),new FinancePolicyService.ActivateRequest(before,draft.contentHash(),"Must remain blocked"))));
            assertEquals(before,service.current().revision());
        }
    }
    @Test void historicalPolicyAndRequestJsonDoNotGainNullFields(){
        assertFalse(f.json.valueToTree(FinancePolicy.launchDraft()).has("deliveryTariff"));
        assertFalse(f.json.valueToTree(f.input(UUID.randomUUID(),f.chef)).has("deliveryCoordinates"));
    }
}

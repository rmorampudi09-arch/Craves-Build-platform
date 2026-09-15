package in.craves.integration.payout.bank;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static in.craves.integration.payout.bank.BankOnboardingModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RazorpayBankValidationClientTest {
    final ObjectMapper json=new ObjectMapper();final UUID id=UUID.randomUUID(),chef=UUID.randomUUID();
    final Details d=new Details(chef,UUID.randomUUID(),"Test Chef","chef@example.invalid","9000000001","001234567890","HDFC0000053");
    RazorpayBankValidationClient client;MockRestServiceServer server;
    @BeforeEach void setup() {
        var builder=RestClient.builder().baseUrl("https://api.razorpay.com");server=MockRestServiceServer.bindTo(builder).build();
        client=new RazorpayBankValidationClient(builder.build(),json,"rzp_live_TEST_ONLY","NOT_A_SECRET","TEST_SOURCE",true,"penniless");
    }
    ObjectNode response() {
        var value=json.createObjectNode().put("id","fav_test").put("entity","fund_account.validation").put("reference_id",id.toString()).put("status","completed");
        value.putObject("validation_results").put("account_status","valid").put("registered_name","Test Chef").put("name_match_score",100);
        var fund=value.putObject("fund_account").put("id","fa_test").put("account_type","bank_account").put("active",true);
        fund.putObject("bank_account").put("name",d.name()).put("account_number",d.accountNumber()).put("ifsc",d.ifsc());
        fund.putObject("contact").put("id","cont_test").put("reference_id",chef.toString()).put("email",d.email()).put("contact",d.phone()).put("active",true);
        return value;
    }
    @Test void compositeRequestCreatesContactAndBankWithPennilessValidation() {
        server.expect(requestTo("https://api.razorpay.com/v1/fund_accounts/validations")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.validation_type").value("penniless"))
                .andExpect(jsonPath("$.source_account_number").value("TEST_SOURCE"))
                .andExpect(jsonPath("$.reference_id").value(id.toString()))
                .andExpect(jsonPath("$.fund_account.bank_account.account_number").value("001234567890"))
                .andExpect(jsonPath("$.fund_account.contact.reference_id").value(chef.toString()))
                .andRespond(withSuccess(response().toString(),MediaType.APPLICATION_JSON));
        assertEquals("BANK_VALIDATED",client.create(id,d).state());server.verify();
    }
    @Test void knownValidationUsesGet() {
        server.expect(requestTo("https://api.razorpay.com/v1/fund_accounts/validations/fav_test")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(response().toString(),MediaType.APPLICATION_JSON));
        assertEquals("BANK_VALIDATED",client.fetch(id,d,"fav_test").state());server.verify();
    }
    @Test void createdAndActiveFundAccountIsNotBankValidation() {
        assertEquals("VALIDATING",RazorpayBankValidationClient.verify(id,d,response().put("status","created"),null).state());
        var invalid=response();((ObjectNode)invalid.path("validation_results")).put("account_status","invalid");
        assertEquals("VALIDATION_FAILED",RazorpayBankValidationClient.verify(id,d,invalid,null).state());
    }
    @Test void completedNameMismatchDoesNotPassEvenWithHighScore() {
        var invalid=response();((ObjectNode)invalid.path("validation_results")).put("registered_name","Different Person").put("name_match_score",100);
        assertEquals("NAME_MISMATCH",RazorpayBankValidationClient.verify(id,d,invalid,null).state());
    }
    @ParameterizedTest @ValueSource(strings={"id","entity","reference_id","status"})
    void wrongValidationIdentityOrUnknownStateIsRejected(String field) {
        assertThrows(IllegalStateException.class,()->RazorpayBankValidationClient.verify(id,d,response().put(field,"wrong"),null));
    }
    @ParameterizedTest @ValueSource(strings={"account_number","ifsc","name"})
    void wrongBankContextIsRejected(String field) {
        var invalid=response();((ObjectNode)invalid.path("fund_account").path("bank_account")).put(field,"wrong");
        assertThrows(IllegalStateException.class,()->RazorpayBankValidationClient.verify(id,d,invalid,null));
    }
    @Test void wrongChefReferenceIsRejected() {
        var invalid=response();((ObjectNode)invalid.path("fund_account").path("contact")).put("reference_id",UUID.randomUUID().toString());
        assertThrows(IllegalStateException.class,()->RazorpayBankValidationClient.verify(id,d,invalid,null));
    }
    @Test void noValidationTestModeIsInvented() {
        var test=new RazorpayBankValidationClient(RestClient.create(),json,"rzp_test_ONLY","test","test",true,"penniless");
        assertFalse(test.ready());assertThrows(IllegalStateException.class,()->test.create(id,d));
    }
    @Test void recoveryUsesBoundedGetCollectionAndExactOriginalReference() {
        server.expect(request-> {assertEquals(HttpMethod.GET,request.getMethod());assertEquals("/v1/fund_accounts/validations",request.getURI().getPath());
            assertTrue(request.getURI().getQuery().contains("account_number=TEST_SOURCE"));})
            .andRespond(withSuccess(json.createObjectNode().put("entity","collection").set("items",json.createArrayNode().add(response())).toString(),MediaType.APPLICATION_JSON));
        assertEquals("fav_test",client.find(id,d,Instant.now()).validationId());server.verify();
    }
}

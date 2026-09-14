package in.craves.integration.payout;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.ledger.LedgerMoney;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** RazorpayX payout credentials are deliberately separate from customer payment collection. */
@Component
public class RazorpayXPayoutClient {
    public record Instruction(UUID id,String fundAccountId,String amount,String providerId) {}
    public record Receipt(String payoutId,String status,String transferReference) {}
    private static final Set<String> STATES=Set.of("queued","pending","processing","processed","reversed","failed","cancelled","rejected");
    private final RestClient client;private final String keyId,keySecret,accountNumber;private final boolean approved;
    @Autowired
    public RazorpayXPayoutClient(RestClient.Builder builder,
        @Value("${craves.razorpayx.key-id:}") String keyId,@Value("${craves.razorpayx.key-secret:}") String keySecret,
        @Value("${craves.razorpayx.account-number:}") String accountNumber,
        @Value("${craves.razorpayx.production-approved:false}") boolean approved) {
        this.keyId=keyId;this.keySecret=keySecret;this.accountNumber=accountNumber;this.approved=approved;
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(15));
        this.client=builder.clone().baseUrl("https://api.razorpay.com").requestFactory(factory).build();
    }
    RazorpayXPayoutClient(RestClient client,String keyId,String secret,String account,boolean approved) {
        this.client=client;this.keyId=keyId;this.keySecret=secret;this.accountNumber=account;this.approved=approved;
    }
    public boolean ready() {return approved && keyId.startsWith("rzp_live_") && !keySecret.isBlank() && !accountNumber.isBlank();}
    private void requireReady() {if(!ready()) throw new IllegalStateException("RAZORPAYX_PAYOUT_ACCOUNT_NOT_READY");}
    public Receipt submit(Instruction instruction) {
        requireReady();validate(instruction);
        // UUID is persisted before this request. Never mint a new key on a timeout or retry.
        JsonNode body=client.post().uri("/v1/payouts").headers(h->{h.setBasicAuth(keyId,keySecret);h.set("X-Payout-Idempotency",instruction.id().toString());})
            .body(Map.of("account_number",accountNumber,"fund_account_id",instruction.fundAccountId(),
                "amount",LedgerMoney.parse(instruction.amount()).movePointRight(2).longValueExact(),"currency","INR",
                "mode","IMPS","purpose","payout","queue_if_low_balance",false,
                "reference_id",instruction.id().toString(),"narration","Craves chef payout"))
            .retrieve().body(JsonNode.class);
        return verify(instruction,body);
    }
    public Receipt fetch(Instruction instruction) {
        requireReady();validate(instruction);
        if(instruction.providerId()==null || !instruction.providerId().matches("pout_[A-Za-z0-9]+"))
            throw new IllegalArgumentException("Provider payout ID is required for reconciliation");
        JsonNode body=client.get().uri("/v1/payouts/{id}",instruction.providerId()).headers(h->h.setBasicAuth(keyId,keySecret)).retrieve().body(JsonNode.class);
        return verify(instruction,body);
    }
    public void verifyFundAccount(String id,String contact) {
        requireReady();
        if(id==null || !id.matches("fa_[A-Za-z0-9]+") || contact==null || !contact.matches("cont_[A-Za-z0-9]+")) throw new IllegalArgumentException("Invalid beneficiary references");
        var account=client.get().uri("/v1/fund_accounts/{id}",id).headers(h->h.setBasicAuth(keyId,keySecret)).retrieve().body(JsonNode.class);
        if(account==null || !id.equals(account.path("id").asText()) || !contact.equals(account.path("contact_id").asText())
            || !"bank_account".equals(account.path("account_type").asText()) || !account.path("active").isBoolean() || !account.path("active").asBoolean())
            throw new IllegalStateException("BENEFICIARY_PROVIDER_CONTEXT_MISMATCH");
        // This checks provider identity/active status; bank ownership/KYC evidence remains a separate required approval.
    }
    private static void validate(Instruction i) {
        if(i==null || i.id()==null || i.fundAccountId()==null || !i.fundAccountId().matches("fa_[A-Za-z0-9]+") || LedgerMoney.parse(i.amount()).signum()<=0)
            throw new IllegalArgumentException("Invalid payout instruction");
    }
    static Receipt verify(Instruction i,JsonNode value) {
        long amount=LedgerMoney.parse(i.amount()).movePointRight(2).longValueExact();
        if(value==null || !value.path("id").asText().matches("pout_[A-Za-z0-9]+")
            || (i.providerId()!=null && !i.providerId().equals(value.path("id").asText()))
            || !i.fundAccountId().equals(value.path("fund_account_id").asText())
            || !i.id().toString().equals(value.path("reference_id").asText())
            || !"INR".equals(value.path("currency").asText()) || !value.path("amount").isIntegralNumber()
            || !value.path("amount").canConvertToLong() || amount!=value.path("amount").longValue()
            || !STATES.contains(value.path("status").asText())) throw new IllegalStateException("PAYOUT_PROVIDER_CONTEXT_MISMATCH");
        String utr=value.path("utr").isTextual()?value.path("utr").asText():null;
        if(utr!=null && utr.length()>160) throw new IllegalStateException("PAYOUT_PROVIDER_REFERENCE_INVALID");
        return new Receipt(value.path("id").asText(),value.path("status").asText(),utr);
    }
}

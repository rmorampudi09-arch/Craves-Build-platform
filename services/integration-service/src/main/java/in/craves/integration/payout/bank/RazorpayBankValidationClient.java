package in.craves.integration.payout.bank;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Composite bank validation only. There is no payout POST in this adapter. */
@Component
public class RazorpayBankValidationClient {
    private final RestClient client;
    private final ObjectMapper json;
    private final String keyId, secret, sourceAccount, validationType;
    private final boolean enabled;
    @Autowired
    public RazorpayBankValidationClient(RestClient.Builder builder, ObjectMapper json,
            @Value("${CRAVES_RAZORPAYX_KEY_ID:}") String keyId,
            @Value("${CRAVES_RAZORPAYX_KEY_SECRET:}") String secret,
            @Value("${CRAVES_RAZORPAYX_ACCOUNT_NUMBER:}") String sourceAccount,
            @Value("${CRAVES_BANK_PROVIDER_ENABLED:false}") boolean enabled,
            @Value("${CRAVES_BANK_VALIDATION_TYPE:penniless}") String validationType) {
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http); factory.setReadTimeout(Duration.ofSeconds(15));
        this.client = builder.clone().baseUrl("https://api.razorpay.com").requestFactory(factory).build();
        this.json = json; this.keyId = keyId; this.secret = secret; this.sourceAccount = sourceAccount;
        this.enabled = enabled; this.validationType = validationType;
    }
    RazorpayBankValidationClient(RestClient client, ObjectMapper json, String keyId, String secret,
                                String sourceAccount, boolean enabled, String validationType) {
        this.client=client; this.json=json; this.keyId=keyId; this.secret=secret;
        this.sourceAccount=sourceAccount; this.enabled=enabled; this.validationType=validationType;
    }
    public boolean ready() {
        return enabled && keyId.startsWith("rzp_live_") && !secret.isBlank() && !sourceAccount.isBlank()
                && Set.of("penniless","optimized","pennydrop").contains(validationType);
    }
    private void requireReady() {
        if (!ready()) throw new IllegalStateException("BANK_VALIDATION_PROVIDER_NOT_CONFIGURED");
    }
    public BankOnboardingModels.Result create(UUID id, BankOnboardingModels.Details d) {
        requireReady();
        var contact = Map.of("name",d.name(),"email",d.email(),"contact",d.phone(),
                "type","vendor","reference_id",d.chefId().toString());
        var bank = Map.of("name",d.name(),"account_number",d.accountNumber(),"ifsc",d.ifsc());
        var payload = Map.of("source_account_number",sourceAccount,"validation_type",validationType,
                "reference_id",id.toString(),"fund_account",Map.of("account_type","bank_account",
                        "bank_account",bank,"contact",contact));
        // FAV idempotency is NOT assumed from payout idempotency documentation. A persisted lease permits one POST.
        byte[] body = client.post().uri("/v1/fund_accounts/validations")
                .headers(h->h.setBasicAuth(keyId,secret)).body(payload).retrieve().body(byte[].class);
        return verify(id,d,parse(body),null);
    }
    public BankOnboardingModels.Result fetch(UUID id, BankOnboardingModels.Details d, String validationId) {
        requireReady();
        if (validationId == null || !validationId.matches("fav_[A-Za-z0-9]{1,74}"))
            throw new IllegalArgumentException("Invalid validation reference");
        byte[] body = client.get().uri("/v1/fund_accounts/validations/{id}",validationId)
                .headers(h->h.setBasicAuth(keyId,secret)).retrieve().body(byte[].class);
        return verify(id,d,parse(body),validationId);
    }
    /** Recover a lost POST response with GETs. No match is not permission to repeat a chargeable POST. */
    public BankOnboardingModels.Result find(UUID id, BankOnboardingModels.Details d, Instant submittedAt) {
        requireReady();
        BankOnboardingModels.Result match = null;
        long from = submittedAt.minusSeconds(300).getEpochSecond();
        long to = Instant.now().getEpochSecond();
        for (int page=0; page<10; page++) {
            int skip=page*100;
            var collection=parse(client.get().uri(u->u.path("/v1/fund_accounts/validations")
                    .queryParam("account_number",sourceAccount).queryParam("from",from)
                    .queryParam("to",to).queryParam("count",100).queryParam("skip",skip).build())
                    .headers(h->h.setBasicAuth(keyId,secret)).retrieve().body(byte[].class));
            var items=collection.path("items");
            if (!items.isArray() || items.size()>100) throw new IllegalStateException("BANK_PROVIDER_LIST_INVALID");
            for (var item:items) {
                if (id.toString().equals(item.path("reference_id").asText())) {
                    var candidate=verify(id,d,item,null);
                    if (match!=null && !match.validationId().equals(candidate.validationId()))
                        throw new IllegalStateException("MULTIPLE_BANK_VALIDATIONS_REQUIRE_PROVIDER_RESOLUTION");
                    match=candidate;
                }
            }
            if(items.size()<100) return match;
        }
        throw new IllegalStateException("BANK_PROVIDER_LOOKUP_PAGE_LIMIT");
    }
    private JsonNode parse(byte[] body) {
        if (body==null || body.length>2_000_000) throw new IllegalStateException("BANK_PROVIDER_RESPONSE_INVALID");
        try { return json.readTree(body); }
        catch(Exception e) { throw new IllegalStateException("BANK_PROVIDER_RESPONSE_INVALID"); }
    }
    public static BankOnboardingModels.Result verify(UUID id, BankOnboardingModels.Details d,
                                                     JsonNode value, String expectedId) {
        if(value==null || !value.isObject()) throw new IllegalStateException("BANK_PROVIDER_CONTEXT_MISMATCH");
        String validation=value.path("id").asText();
        var fund=value.path("fund_account"); var bank=fund.path("bank_account"); var contact=fund.path("contact");
        String fa=fund.path("id").asText(), co=contact.path("id").asText();
        if(!validation.matches("fav_[A-Za-z0-9]{1,74}") || (expectedId!=null && !expectedId.equals(validation))
                || !"fund_account.validation".equals(value.path("entity").asText())
                || !id.toString().equals(value.path("reference_id").asText())
                || !fa.matches("fa_[A-Za-z0-9]{1,74}") || !co.matches("cont_[A-Za-z0-9]{1,74}")
                || !"bank_account".equals(fund.path("account_type").asText())
                || !d.accountNumber().equals(bank.path("account_number").asText())
                || !d.ifsc().equals(bank.path("ifsc").asText())
                || !d.chefId().toString().equals(contact.path("reference_id").asText())
                || !d.phone().equals(contact.path("contact").asText())
                || !d.email().equals(contact.path("email").asText())
                || !BankOnboardingModels.normalizeName(d.name()).equals(BankOnboardingModels.normalizeName(bank.path("name").asText())))
            throw new IllegalStateException("BANK_PROVIDER_CONTEXT_MISMATCH");
        String state=value.path("status").asText();
        String outcome;
        if ("created".equals(state)) outcome="VALIDATING";
        else if ("failed".equals(state)) outcome="VALIDATION_FAILED";
        else if ("completed".equals(state)) {
            var results=value.path("validation_results");
            if (!Set.of("active","valid").contains(results.path("account_status").asText())
                    || !fund.path("active").isBoolean() || !fund.path("active").asBoolean()
                    || !contact.path("active").isBoolean() || !contact.path("active").asBoolean())
                outcome="VALIDATION_FAILED";
            else if (!BankOnboardingModels.normalizeName(d.name()).equals(
                    BankOnboardingModels.normalizeName(results.path("registered_name").asText())))
                outcome="NAME_MISMATCH";
            else outcome="BANK_VALIDATED";
        } else throw new IllegalStateException("BANK_PROVIDER_STATUS_UNSUPPORTED");
        try {
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.toString().getBytes(StandardCharsets.UTF_8)));
            return new BankOnboardingModels.Result(validation,fa,co,outcome,hash);
        } catch(Exception e) { throw new IllegalStateException("BANK_PROVIDER_EVIDENCE_UNAVAILABLE"); }
    }
}

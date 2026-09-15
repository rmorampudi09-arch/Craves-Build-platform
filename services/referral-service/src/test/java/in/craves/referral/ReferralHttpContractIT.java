package in.craves.referral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nimbusds.jwt.JWTClaimsSet;
import in.craves.referral.domain.AwardService;
import in.craves.referral.domain.SettlementService;
import in.craves.referral.infra.InboxService;
import in.craves.referral.infra.Json;
import in.craves.referral.security.SourceSignatures;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Actual loopback HTTP server + RSA/HMAC filters + disposable PostgreSQL.
 * Redis is an explicit mock dependency; no current Craves owner or provider is called. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "referral.enabled=true","referral.workers-enabled=true","referral.awards-enabled=true",
    "referral.settlement-enabled=true","referral.withdrawals-enabled=true","referral.spending-enabled=true",
    "referral.cashout-minimum-paise=1000","referral.annual-kyc-threshold-paise=10000000",
    "referral.lifetime-review-paise=100000000","referral.worker-delay-ms=86400000",
    "CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED=true","CRAVES_REFERRALS_REVOCATION_ABSENCE_CONTRACT_CONFIRMED=false"})
@Import(ReferralHttpContractIT.TimeConfig.class)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class ReferralHttpContractIT {
    static final ReferralTestRig.MutableClock TIME=new ReferralTestRig.MutableClock();
    static final KeyPair PAIR=keys();
    static KeyPair keys() { try {return BoundaryValidationTest.keys();} catch(Exception ex) {throw new IllegalStateException(ex);} }
    @TestConfiguration static class TimeConfig { @Bean @Primary Clock testClock() {return TIME;} }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        TestDatabase.reset(); // The same strict loopback/disposable confirmation guard used by all ITs.
        p.add("spring.datasource.url",()->System.getenv("REFERRAL_TEST_JDBC_URL"));
        p.add("spring.datasource.username",()->System.getenv("REFERRAL_TEST_DB_USER"));
        p.add("spring.datasource.password",()->System.getenv("REFERRAL_TEST_DB_PASSWORD"));
        p.add("referral.verification-pem-base64",()->BoundaryValidationTest.pem(PAIR));
        p.add("referral.auth-key",()->BoundaryValidationTest.AUTH);
        p.add("referral.order-key",()->BoundaryValidationTest.ORDER);
        p.add("referral.finance-key",()->BoundaryValidationTest.FINANCE);
    }
    @LocalServerPort int port;
    @Autowired InboxService inbox;
    @Autowired AwardService awards;
    @Autowired SettlementService settlement;
    @Autowired ReferralSettings settings;
    @MockitoBean StringRedisTemplate redis;
    ReferralTestRig r;
    ValueOperations<String,String> values;
    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        r=new ReferralTestRig();TIME.set(r.clock.instant());
        values=mock(ValueOperations.class);when(redis.opsForValue()).thenReturn(values);when(values.get(anyString())).thenReturn("ACTIVE|1");
    }
    String token(UUID user,String role) throws Exception {
        var claims=new JWTClaimsSet.Builder().issuer(settings.jwtIssuer()).subject(user.toString()).audience(settings.jwtAudience())
            .issueTime(Date.from(TIME.instant())).expirationTime(Date.from(TIME.instant().plusSeconds(300)))
            .claim("token_version",1L).claim("roles",List.of(role)).build();
        return BoundaryValidationTest.signed(PAIR,claims);
    }
    HttpResponse<String> send(HttpRequest request) throws Exception {
        try(var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build()) {
            return http.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        }
    }
    HttpRequest.Builder request(String path) {return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(10));}
    HttpResponse<String> get(String path,String token) throws Exception {var req=request(path);if(token!=null)req.header("Authorization","Bearer "+token);return send(req.GET().build());}
    HttpResponse<String> post(String path,String token,JsonNode body) throws Exception {
        return send(request(path).header("Authorization","Bearer "+token).header("Content-Type","application/json")
            .POST(HttpRequest.BodyPublishers.ofString(Json.write(body),StandardCharsets.UTF_8)).build());
    }
    HttpResponse<String> source(String name,String path,byte[] body,boolean valid) throws Exception {
        String at=Long.toString(TIME.instant().getEpochSecond());
        String signature=SourceSignatures.sign(settings.key(name,"current"),name,"current",at,"POST",path,body);
        return send(request(path).header("Content-Type","application/json").header("X-Referral-Source",name).header("X-Referral-Key-Id","current")
            .header("X-Referral-Timestamp",at).header("X-Referral-Signature",valid?signature:"0".repeat(64))
            .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build());
    }
    HttpResponse<String> event(String source,String type,UUID aggregate,JsonNode payload,UUID event) throws Exception {
        r.clock.set(TIME.instant());return source(source,"/internal/v1/referrals/events",Json.write(r.envelope(type,aggregate,payload,event)).getBytes(StandardCharsets.UTF_8),true);
    }
    void apply(String source,String type,UUID aggregate,JsonNode payload) throws Exception {
        var response=event(source,type,aggregate,payload,UUID.randomUUID());assertEquals(202,response.statusCode(),response.body());
        assertTrue(inbox.applyOne());
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.inbox WHERE status<>'APPLIED'"));
    }
    UUID register(String parentCode) throws Exception {
        UUID id=UUID.randomUUID();var payload=new LinkedHashMap<String,Object>();
        payload.put("userId",id.toString());payload.put("registeredAt",TIME.instant().toString());payload.put("parentCode",parentCode);
        payload.put("fingerprintConsent",false);payload.put("contactHash",Json.sha256(id.toString().getBytes(StandardCharsets.UTF_8)));payload.put("termsVersion","TEST_ONLY_TERMS");
        apply("auth","account.registered",id,r.json(payload));return id;
    }
    ObjectNode finance(UUID order,String hash,int version) {
        return r.json(Map.of("chefOrderId",order.toString(),"version",version,"sourceSnapshotHash",hash,"verifiedCapture",true,
            "capturedCheckoutPaise","100000","commissionBudgetPaise","7000","cumulativeFoodRefundPaise","0",
            "observedAt",TIME.instant().toString(),"evidenceRef","TEST_ONLY_CAPTURE","currency","INR")).deepCopy();
    }
    @Test void signedHttpLifecycleCreditsOnlyAfterFreshFinanceAndReversesOnce() throws Exception {
        UUID owner=register(null);
        var ownerCode=get("/api/v1/referrals/me/code",token(owner,"CUSTOMER"));assertEquals(200,ownerCode.statusCode());
        String code=Json.parse(ownerCode.body()).get("code").asText();UUID seller=register(code),buyer=register(null);
        assertEquals(owner,uuid(r.db.one("SELECT parent_id FROM referral_schema.member WHERE user_id=?",seller),"parent_id"));
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.journal"));
        UUID order=UUID.randomUUID(),checkout=UUID.randomUUID();String hash=Json.sha256(order.toString().getBytes(StandardCharsets.UTF_8));
        var binding=new LinkedHashMap<String,Object>();binding.put("chefOrderId",order.toString());binding.put("checkoutId",checkout.toString());
        binding.put("buyerUserId",buyer.toString());binding.put("sellingChefUserId",seller.toString());binding.put("foodSubtotalPaise","100000");
        binding.put("checkoutFoodSubtotalPaise","100000");binding.put("checkoutPayablePaise","100000");binding.put("chefOrderCount",1);
        binding.put("createdAt",TIME.instant().toString());binding.put("sourceSnapshotHash",hash);binding.put("currency","INR");
        apply("order","order.bound",order,r.json(binding));
        var delivery=r.json(Map.of("chefOrderId",order.toString(),"version",1,"deliveredAt",TIME.instant().toString(),"sourceSnapshotHash",hash));
        UUID deliveredEvent=UUID.randomUUID();assertEquals(202,event("order","order.delivered",order,delivery,deliveredEvent).statusCode());assertTrue(inbox.applyOne());
        assertFalse(awards.award(order));
        apply("finance","order.finance_confirmed",order,finance(order,hash,1));assertTrue(awards.award(order));
        assertEquals(202,event("order","order.delivered",order,delivery,deliveredEvent).statusCode());assertFalse(inbox.applyOne());assertFalse(awards.award(order));
        UUID reward=uuid(r.db.one("SELECT id FROM referral_schema.reward WHERE order_id=?",order),"id");
        assertFalse(settlement.settle(reward));TIME.advance(Duration.ofDays(15));r.clock.set(TIME.instant());
        assertFalse(settlement.settle(reward));apply("finance","order.finance_confirmed",order,finance(order,hash,2));assertTrue(settlement.settle(reward));assertFalse(settlement.settle(reward));
        var overview=get("/api/v1/referrals/me",token(owner,"CUSTOMER"));assertEquals(200,overview.statusCode(),overview.body());
        assertEquals("2000",Json.parse(overview.body()).get("availablePaise").asText());assertTrue(overview.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        var refund=r.json(Map.of("chefOrderId",order.toString(),"version",1,"cumulativeFoodRefundPaise","100000","fullCheckoutRefund",true,"reasonRef","TEST_ONLY_FULL_REFUND"));
        apply("order","order.refunded",order,refund);apply("order","order.refunded",order,refund);
        assertEquals("0",Json.parse(get("/api/v1/referrals/me",token(owner,"CUSTOMER")).body()).get("availablePaise").asText());
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.reversal"));
    }
    @Test void realHttpIdentityRevocationAndRoleBoundariesAreEnforced() throws Exception {
        var member=r.member(null);String memberToken=token(member.id(),"CUSTOMER");
        assertEquals(401,get("/api/v1/referrals/me",null).statusCode());assertEquals(401,get("/api/v1/referrals/me","not-a-jwt").statusCode());
        assertEquals(403,get("/api/v1/referrals/admin/overview",memberToken).statusCode());
        assertEquals(200,get("/api/v1/referrals/admin/overview",token(r.approver,"ADMIN")).statusCode());
        when(values.get(anyString())).thenReturn("SUSPENDED|1");assertEquals(401,get("/api/v1/referrals/me",memberToken).statusCode());
        when(values.get(anyString())).thenReturn("ACTIVE|2");assertEquals(401,get("/api/v1/referrals/me",memberToken).statusCode());
        when(values.get(anyString())).thenReturn("bad");assertEquals(503,get("/api/v1/referrals/me",memberToken).statusCode());
        when(values.get(anyString())).thenReturn(null);var absent=get("/api/v1/referrals/me",memberToken);assertEquals(503,absent.statusCode());
        assertTrue(absent.body().contains("REVOCATION_ABSENCE_CONTRACT_UNCONFIRMED"));
        when(values.get(anyString())).thenThrow(new IllegalStateException("TEST_ONLY_REDIS_OUTAGE"));
        var unavailable=get("/api/v1/referrals/me",memberToken);assertEquals(503,unavailable.statusCode());assertFalse(unavailable.body().contains("TEST_ONLY_REDIS_OUTAGE"));
        assertEquals(200,get("/actuator/health/liveness",null).statusCode());
    }
    @Test void signedHttpRejectsTamperWrongSourceDuplicateKeysAndTrailingDocuments() throws Exception {
        UUID id=UUID.randomUUID();var payload=r.json(Map.of("userId",id.toString(),"registeredAt",TIME.instant().toString(),"contactHash","a".repeat(64),"fingerprintConsent",false,"termsVersion","TEST_ONLY_TERMS"));
        byte[] body=Json.write(r.envelope("account.registered",id,payload,UUID.randomUUID())).getBytes(StandardCharsets.UTF_8);
        assertEquals(401,source("auth","/internal/v1/referrals/events",body,false).statusCode());
        assertEquals(403,source("order","/internal/v1/referrals/events",body,true).statusCode());
        assertEquals(422,source("auth","/internal/v1/referrals/events",(new String(body,StandardCharsets.UTF_8)+" {}").getBytes(StandardCharsets.UTF_8),true).statusCode());
        assertEquals(422,source("auth","/internal/v1/referrals/events","{\"eventId\":1,\"eventId\":2}".getBytes(StandardCharsets.UTF_8),true).statusCode());
        assertEquals(422,source("auth","/internal/v1/referrals/events",new byte[]{(byte)0xc3,0x28},true).statusCode());
        assertEquals(413,source("auth","/internal/v1/referrals/events",new byte[131073],true).statusCode());
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.inbox"));
    }
    @Test void httpWithdrawalLostResponseRetryAndWrongOwnerDoNotDuplicateMoney() throws Exception {
        var owner=r.member(null);var seller=r.member(owner);var buyer=r.member(null);var order=r.order(seller,buyer,100000);
        r.deliver(order);r.finance(order,1,0,7000);r.awards.award(order.id());r.mature(order,0);r.assess(owner);TIME.set(r.clock.instant());
        UUID request=UUID.randomUUID();var body=r.json(Map.of("requestId",request.toString(),"amountPaise","1500"));
        var first=post("/api/v1/referrals/me/cashouts",token(owner.id(),"CUSTOMER"),body);assertEquals(200,first.statusCode(),first.body());
        var repeat=post("/api/v1/referrals/me/cashouts",token(owner.id(),"CUSTOMER"),body);assertEquals(200,repeat.statusCode());assertEquals(Json.parse(first.body()),Json.parse(repeat.body()));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.reservation"));assertEquals(500,r.balance(owner,"available_paise"));
        assertEquals(409,post("/api/v1/referrals/me/cashouts",token(owner.id(),"CUSTOMER"),r.json(Map.of("requestId",request.toString(),"amountPaise","1600"))).statusCode());
        assertEquals(404,post("/api/v1/referrals/me/cashouts/"+request+"/cancel",token(buyer.id(),"CUSTOMER"),r.json(Map.of())).statusCode());
        assertEquals(204,post("/api/v1/referrals/me/cashouts/"+request+"/cancel",token(owner.id(),"CUSTOMER"),r.json(Map.of())).statusCode());
        assertEquals(204,post("/api/v1/referrals/me/cashouts/"+request+"/cancel",token(owner.id(),"CUSTOMER"),r.json(Map.of())).statusCode());
        assertEquals(2000,r.balance(owner,"available_paise"));assertEquals(0,r.balance(owner,"reserved_paise"));
    }
    @Test void realHttpQrAndHistoryStayScopedToAuthenticatedOwner() throws Exception {
        var first=r.member(null);var other=r.member(null);
        var qr=get("/api/v1/referrals/me/code/qr",token(first.id(),"CUSTOMER"));assertEquals(200,qr.statusCode());assertTrue(qr.body().startsWith("<svg"));
        assertTrue(qr.headers().firstValue("Content-Security-Policy").orElse("").contains("sandbox"));
        var overview=get("/api/v1/referrals/me?userId="+other.id(),token(first.id(),"CUSTOMER"));
        assertEquals(first.code(),Json.parse(overview.body()).get("code").get("code").asText());
        assertEquals(422,get("/api/v1/referrals/me/rewards?limit=101",token(first.id(),"CUSTOMER")).statusCode());
        assertEquals(422,get("/api/v1/referrals/me/rewards?cursor=not-a-cursor",token(first.id(),"CUSTOMER")).statusCode());
    }
    @Test void exportsActualHttpResponsesForClientContractVerification() throws Exception {
        var owner=r.member(null);var seller=r.member(owner);var buyer=r.member(null);
        var order=r.order(seller,buyer,100000);r.deliver(order);r.finance(order,1,0,7000);
        r.awards.award(order.id());r.mature(order,0);r.assess(owner);TIME.set(r.clock.instant());
        var reserve=post("/api/v1/referrals/me/cashouts",token(owner.id(),"CUSTOMER"),
            r.json(Map.of("requestId",UUID.randomUUID().toString(),"amountPaise","1500")));
        assertEquals(200,reserve.statusCode(),reserve.body());
        var directory=java.nio.file.Path.of(System.getProperty("basedir",System.getProperty("user.dir")),"target","contract-fixtures");
        java.nio.file.Files.createDirectories(directory);
        Map<String,String> paths=Map.of("overview","/me","rewards","/me/rewards","cashouts","/me/cashouts",
            "admin-overview","/admin/overview","policies","/admin/policies");
        for(var entry:paths.entrySet()) {
            boolean admin=entry.getValue().startsWith("/admin/");
            var response=get("/api/v1/referrals"+entry.getValue(),token(admin?r.approver:owner.id(),admin?"ADMIN":"CUSTOMER"));
            assertEquals(200,response.statusCode(),response.body());
            assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
            Json.parse(response.body());
            java.nio.file.Files.writeString(directory.resolve(entry.getKey()+".json"),response.body(),StandardCharsets.UTF_8);
        }
        // Only synthetic API response bodies are exported; no token, HMAC or private key.
    }

    @Test void privateLookupRequiresOrderSignatureAndOnlyReturnsReadiness() throws Exception {
        var seller=r.member(null);var buyer=r.member(null);var id=UUID.randomUUID();
        var body=r.json(Map.of("requestId",id.toString(),"at",TIME.instant().toString(),"userIds",List.of(seller.id().toString(),buyer.id().toString())));
        byte[] bytes=Json.write(body).getBytes(StandardCharsets.UTF_8);
        assertEquals(403,source("finance","/internal/v1/referrals/lookup",bytes,true).statusCode());
        var reply=source("order","/internal/v1/referrals/lookup",bytes,true);assertEquals(200,reply.statusCode(),reply.body());
        var result=Json.parse(reply.body());assertTrue(result.path("eligible").asBoolean());assertEquals(id.toString(),result.path("requestId").asText());assertEquals(3,result.size());
        var missing=r.json(Map.of("requestId",id.toString(),"at",TIME.instant().toString(),"userIds",List.of(UUID.randomUUID().toString())));
        assertFalse(Json.parse(source("order","/internal/v1/referrals/lookup",Json.write(missing).getBytes(StandardCharsets.UTF_8),true).body()).path("eligible").asBoolean());
    }
}

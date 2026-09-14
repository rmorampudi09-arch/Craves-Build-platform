package in.craves.integration.refund;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.RazorpayProviderProperties;
import in.craves.integration.payment.RazorpayRequestSafety;
import in.craves.integration.refund.CashfreeRefundClient.RefundProviderConfigurationException;
import in.craves.integration.refund.CashfreeRefundClient.RefundProviderTransientException;
import in.craves.integration.refund.RefundModels.ProviderRefundResult;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class RazorpayRefundClient {
    public static final String PROTOCOL = "RAZORPAY_REFUND_IDEMPOTENCY_V1";
    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 10;
    private static final int MAX_RESPONSE_BYTES = 262144;
    private final RazorpayProviderProperties properties;
    private final ObjectMapper json;
    private final RestClient client;

    @org.springframework.beans.factory.annotation.Autowired
    public RazorpayRefundClient(RazorpayProviderProperties properties, ObjectMapper json, RestClient.Builder builder) {
        this(properties,json,builder.clone().baseUrl(properties.baseUrl()).requestFactory(requestFactory()).build());
    }
    RazorpayRefundClient(RazorpayProviderProperties properties,ObjectMapper json,RestClient client) {
        this.properties=properties;this.json=json;this.client=client;
    }
    private static JdkClientHttpRequestFactory requestFactory() {
        var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(15));return factory;
    }

    public String prepareRequest(RefundWorkItem item) {
        validateWork(item);
        Map<String,Object> request=new LinkedHashMap<>();
        request.put("amount",RazorpayRequestSafety.toSubunits(item.amount()));
        request.put("speed","normal");request.put("receipt",item.refundReference());
        Map<String,String> notes=new LinkedHashMap<>();
        notes.put("craves_refund_id",item.refundId().toString());notes.put("reason",safeNote(item.reason()));
        request.put("notes",notes);
        return serialize(request);
    }

    public ProviderRefundResult createRefund(RefundWorkItem item,String persistedBody,String persistedSha256) {
        requireConfiguration(true);validateWork(item);
        if (!prepareRequest(item).equals(persistedBody) || !hash(persistedBody).equals(persistedSha256))
            throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        return verify(item,client.post().uri("/v1/payments/{paymentId}/refund",item.providerPaymentId())
            .headers(this::basicAuth).header("X-Refund-Idempotency",item.idempotencyKey().toString())
            .contentType(MediaType.APPLICATION_JSON).body(persistedBody)
            .exchange((request,response)->read(response)),true);
    }

    /** The old unprepared entrypoint deliberately cannot create a refund. */
    public ProviderRefundResult createRefund(RefundWorkItem item) {
        throw new RefundEvidenceException("DURABLE_DISPATCH_REQUIRED");
    }

    public ProviderRefundResult getRefund(RefundWorkItem item) {
        requireConfiguration(false);validateWork(item);
        if (!validId(item.providerRefundId(),"rfnd_")) throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        return verify(item,client.get().uri("/v1/payments/{paymentId}/refunds/{refundId}",
            item.providerPaymentId(),item.providerRefundId()).headers(this::basicAuth)
            .exchange((request,response)->read(response)),false);
    }

    /** Legacy/unknown recovery is GET-only. Absence never grants permission to POST. */
    public ProviderRefundResult findExistingRefund(RefundWorkItem item) {
        requireConfiguration(false);validateWork(item);
        ProviderRefundResult found=null;
        java.util.Set<String> seen=new java.util.HashSet<>();
        for (int page=0;page<MAX_PAGES;page++) {
            final int skip=page*PAGE_SIZE;
            JsonNode result=client.get().uri("/v1/payments/{paymentId}/refunds?count={count}&skip={skip}",
                item.providerPaymentId(),PAGE_SIZE,skip).headers(this::basicAuth)
                .exchange((request,response)->read(response));
            if (result==null || !"collection".equals(text(result,"entity")) || !result.path("items").isArray()
                || result.path("items").size()>PAGE_SIZE || !result.path("count").isIntegralNumber()
                || result.path("count").intValue()!=result.path("items").size())
                throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
            for (JsonNode candidate:result.path("items")) {
                String id=text(candidate,"id");
                if (!validId(id,"rfnd_") || !seen.add(id)) throw new RefundEvidenceException("LOOKUP_AMBIGUOUS");
                boolean receipt=item.refundReference().equals(text(candidate,"receipt"));
                boolean note=item.refundId().toString().equals(text(candidate.path("notes"),"craves_refund_id"));
                if (receipt || note) {
                    ProviderRefundResult match=verify(item,candidate,true);
                    if (found!=null) throw new RefundEvidenceException("LOOKUP_AMBIGUOUS");
                    found=match;
                }
            }
            if (result.path("items").size()<PAGE_SIZE) {
                if (found==null) throw new RefundEvidenceException("LOOKUP_NO_MATCH");
                return found;
            }
        }
        throw new RefundEvidenceException("LOOKUP_AMBIGUOUS");
    }

    private ProviderRefundResult verify(RefundWorkItem item,JsonNode response,boolean requireCravesNote) {
        String id=text(response,"id"),status=text(response,"status");
        if (response==null || !response.isObject() || !validId(id,"rfnd_") || !"refund".equals(text(response,"entity"))
            || !item.providerPaymentId().equals(text(response,"payment_id"))
            || !item.currency().equals(text(response,"currency"))
            || !item.refundReference().equals(text(response,"receipt"))
            || !response.path("amount").isIntegralNumber() || !response.path("amount").canConvertToLong()
            || response.path("amount").longValue()!=RazorpayRequestSafety.toSubunits(item.amount())
            || (StringUtils.hasText(item.providerRefundId()) && !item.providerRefundId().equals(id))
            || (requireCravesNote && !item.refundId().toString().equals(text(response.path("notes"),"craves_refund_id"))))
            throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        String normalized=switch(status==null?"":status) {
            case "processed" -> "SUCCESS";case "pending" -> "PENDING";case "failed" -> "FAILED";
            default -> throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        };
        // Persist only verified dimensions, never arbitrary notes/acquirer data or raw HTTP bodies.
        ObjectNode evidence=json.createObjectNode().put("id",id).put("entity","refund").put("status",status)
            .put("payment_id",item.providerPaymentId()).put("amount",RazorpayRequestSafety.toSubunits(item.amount()))
            .put("currency",item.currency()).put("receipt",item.refundReference());
        return new ProviderRefundResult(normalized,id,serialize(evidence));
    }

    private JsonNode read(ClientHttpResponse response) throws java.io.IOException {
        int status=response.getStatusCode().value();
        if (status<200 || status>=300) throw new RefundHttpException(status);
        byte[] body=response.getBody().readNBytes(MAX_RESPONSE_BYTES+1);
        if (body.length>MAX_RESPONSE_BYTES) throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        try {return json.readTree(body);} catch(Exception exception) {throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");}
    }
    private void requireConfiguration(boolean create) {
        String prefix=properties.production()?"rzp_live_":"rzp_test_";
        if (!StringUtils.hasText(properties.keyId()) || !properties.keyId().startsWith(prefix)
            || !StringUtils.hasText(properties.keySecret()) || (properties.production()&&!properties.productionActivationApproved())
            || (create&&!properties.paymentExecutionAllowed()))
            throw new RefundProviderConfigurationException("REFUND_PROVIDER_CONFIGURATION_BLOCKED");
    }
    private static void validateWork(RefundWorkItem item) {
        if (!"RAZORPAY".equals(item.provider()) || !validId(item.providerPaymentId(),"pay_")
            || item.refundId()==null || item.idempotencyKey()==null || !"INR".equals(item.currency())
            || item.amount()==null || item.amount().compareTo(new java.math.BigDecimal("1.00"))<0
            || !StringUtils.hasText(item.refundReference()) || item.refundReference().length()>40)
            throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        RazorpayRequestSafety.toSubunits(item.amount());
    }
    private void basicAuth(HttpHeaders headers) {headers.setBasicAuth(properties.keyId(),properties.keySecret(),StandardCharsets.UTF_8);}
    private String serialize(Object value) {
        try{return json.writeValueAsString(value);}catch(Exception exception){throw new RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");}
    }
    static String hash(String value) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception exception){throw new IllegalStateException("REFUND_DIGEST_UNAVAILABLE");}
    }
    private static boolean validId(String value,String prefix){return value!=null&&value.matches(prefix+"[A-Za-z0-9]{1,120}");}
    private static String safeNote(String value){String s=StringUtils.hasText(value)?value.trim():"Craves refund";return s.length()<=250?s:s.substring(0,250);}
    private static String text(JsonNode node,String field){JsonNode n=node==null?null:node.get(field);return n!=null&&n.isTextual()?n.textValue():null;}
    public static class RefundEvidenceException extends RefundProviderTransientException {
        public RefundEvidenceException(String code){super(code);}
    }
    public static class RefundHttpException extends RefundProviderTransientException {
        private final int status;
        RefundHttpException(int status){super("REFUND_PROVIDER_HTTP_"+status);this.status=status;}
        public int status(){return status;}
    }
}

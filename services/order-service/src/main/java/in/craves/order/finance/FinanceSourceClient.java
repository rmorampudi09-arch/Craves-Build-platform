package in.craves.order.finance;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FinanceSourceClient {
    private final RestClient client;private final String key;private final String base;
    public FinanceSourceClient(RestClient.Builder builder,@Value("${CRAVES_FINANCE_INTEGRATION_BASE_URL:}") String base,
        @Value("${CRAVES_FINANCE_INTERNAL_KEY:}") String key){
        this.key=key;this.base=base;
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(15));
        this.client=builder.clone().requestFactory(factory).build();
    }
    public JsonNode quote(JsonNode request){return post("/internal/v1/finance/quotes",request.toString());}
    public JsonNode event(String payload){return post("/internal/v1/finance/events",payload);}
    private JsonNode post(String path,String payload){
        URI origin=URI.create(base);
        if(!"https".equals(origin.getScheme()) || origin.getHost()==null || origin.getUserInfo()!=null || origin.getQuery()!=null || origin.getFragment()!=null || !java.util.Set.of("","/").contains(origin.getPath()))
            throw new IllegalStateException("Finance origin must be an approved HTTPS service origin without a path or credentials");
        byte[] body=payload.getBytes(StandardCharsets.UTF_8);
        if(body.length>524288)throw new IllegalArgumentException("Finance source payload is too large");
        JsonNode result=client.post().uri(base.replaceAll("/$","")+path).header("Content-Type","application/json")
            .header("X-Craves-Finance-Signature",sign(body,key)).body(body).retrieve().body(JsonNode.class);
        if(result==null)throw new IllegalStateException("Finance service returned no evidence");return result;
    }
    public static String sign(byte[] body,String key){
        if(key==null || key.length()<32)throw new IllegalStateException("A dedicated finance key of at least 32 characters is required");
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(body));}
        catch(Exception e){throw new IllegalStateException("Finance signature unavailable",e);}
    }
}

package in.craves.integration.payout.bank;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;

/** Public routing directory lookup. It does not validate ownership of an account. */
@Component
public class IfscLookupClient {
    public record Branch(String ifsc,String bankName,String branchName) {}
    private record Cached(Branch branch,Instant expires) {}
    private final RestClient client;
    private final ConcurrentHashMap<String,Cached> cache=new ConcurrentHashMap<>();
    public IfscLookupClient(RestClient.Builder builder) {
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(5));
        client=builder.clone().requestFactory(factory).build();
    }
    public Branch lookup(String input) {
        String ifsc=input==null?"":input.trim().toUpperCase(Locale.ROOT);
        if(!ifsc.matches("[A-Z]{4}0[A-Z0-9]{6}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Enter a valid IFSC code");
        var saved=cache.get(ifsc);
        if(saved!=null && saved.expires().isAfter(Instant.now())) return saved.branch();
        try {
            JsonNode data=client.get().uri("https://ifsc.razorpay.com/"+ifsc).retrieve().body(JsonNode.class);
            if(data==null || !ifsc.equals(data.path("IFSC").asText()) || !valid(data.path("BANK").asText()) || !valid(data.path("BRANCH").asText()))
                throw new IllegalStateException();
            Branch branch=new Branch(ifsc,data.path("BANK").asText(),data.path("BRANCH").asText());
            if(cache.size()>=1000) cache.clear();
            cache.put(ifsc,new Cached(branch,Instant.now().plusSeconds(86400)));return branch;
        } catch(HttpClientErrorException.NotFound ex) {throw new ResponseStatusException(HttpStatus.NOT_FOUND,"IFSC code was not found. Check your bank document.");}
        catch(Exception ex) {throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Bank branch lookup is unavailable. Retry the lookup.");}
    }
    private static boolean valid(String value) {return value!=null && !value.isBlank() && value.length()<=255;}
}

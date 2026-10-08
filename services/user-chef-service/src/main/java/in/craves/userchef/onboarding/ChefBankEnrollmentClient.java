package in.craves.userchef.onboarding;

import in.craves.userchef.exception.ApiException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Uses the applicant's authenticated bank read model; no bank account enters this service. */
@Component
public class ChefBankEnrollmentClient {
    private final RestClient client;
    private final String origin;
    public ChefBankEnrollmentClient(RestClient.Builder builder,
            @Value("${CRAVES_BANK_INTEGRATION_BASE_URL:}") String origin) {
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(10));
        client=builder.clone().requestFactory(factory).build();this.origin=origin;
    }
    public record Enrollment(UUID id,String state,String accountHolderName) {}
    public UUID requireEnrollment(String authorization,String applicantName) {
        Enrollment bank;
        try {
            URI uri=URI.create(origin);
            if(!"https".equals(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null ||
                uri.getQuery()!=null || uri.getFragment()!=null || !(uri.getPath().isEmpty() || "/".equals(uri.getPath())) ||
                authorization==null || !authorization.startsWith("Bearer ")) throw new IllegalArgumentException();
            bank=client.get().uri(origin.replaceAll("/$","")+"/api/v1/chef-onboarding/bank")
                .header("Authorization",authorization).retrieve().body(Enrollment.class);
        } catch(Exception ex) {
            throw new ApiException(503,"BANK_ENROLLMENT_UNAVAILABLE","We could not confirm your saved bank enrollment. Retry before submitting.");
        }
        if(bank==null || bank.id()==null || !Set.of("QUEUED","SUBMITTING","VALIDATING","WAITING_APPROVAL","VERIFIED").contains(bank.state()) ||
            !normalize(applicantName).equals(normalize(bank.accountHolderName())))
            throw ApiException.conflict("BANK_ENROLLMENT_REQUIRED","Save bank details matching your current applicant name before submitting.");
        return bank.id();
    }
    private static String normalize(String name) {
        return name==null?"":java.text.Normalizer.normalize(name,java.text.Normalizer.Form.NFKC)
            .toUpperCase(java.util.Locale.ROOT).replaceAll("[.\\-'’]"," ").replaceAll("\\s+"," ").trim();
    }
}

package in.craves.subscription.address;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import in.craves.subscription.exception.ApiException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.HttpURLConnection;
import java.io.IOException;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Customer address eligibility only. Courier serviceability is a separate contract. */
@Component
public class SubscriptionDeliveryAddressClient {
    private final RestClient client;
    private final String internalSecret;

    @Autowired
    public SubscriptionDeliveryAddressClient(
        @Value("${CRAVES_USER_CHEF_INTERNAL_BASE_URL:}") String baseUrl,
        @Value("${CRAVES_INTERNAL_SERVICE_SECRET:}") String internalSecret,
        RestClient.Builder builder
    ) {
        this.internalSecret = internalSecret;
        // Missing/invalid customer dependency configuration must not prevent unrelated service startup.
        if (!usableBaseUrl(baseUrl)) {
            this.client = null;
        } else {
            var factory = new SimpleClientHttpRequestFactory() {
                @Override
                protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                    super.prepareConnection(connection, method);
                    // The internal credential must never follow a redirected request.
                    connection.setInstanceFollowRedirects(false);
                }
            };
            factory.setConnectTimeout(3000);
            factory.setReadTimeout(5000);
            this.client = builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
        }
    }

    SubscriptionDeliveryAddressClient(RestClient client, String internalSecret) {
        this.client = client;
        this.internalSecret = internalSecret;
    }

    public void requireEligible(UUID customerIdentityId, UUID addressId) {
        if (customerIdentityId == null || addressId == null) {
            throw ApiException.badRequest("DELIVERY_ADDRESS_REQUIRED", "Select a saved delivery address for the subscription");
        }
        if (client == null || !StringUtils.hasText(internalSecret)) {
            throw unavailable();
        }
        try {
            var response = client.get()
                .uri(builder -> builder.path("/internal/v1/customer-addresses/{addressId}")
                    .queryParam("identityId", customerIdentityId).build(addressId))
                .header("X-Craves-Internal-Secret", internalSecret)
                .retrieve().toEntity(Address.class);
            if (response.getStatusCode().value() != 200) {
                throw unavailable();
            }
            Address address = response.getBody();
            if (address == null || address.id() == null || address.identityId() == null || address.active() == null) {
                throw unavailable();
            }
            if (!addressId.equals(address.id()) || !customerIdentityId.equals(address.identityId()) || !address.active()) {
                throw notAvailable();
            }
            if (!complete(address)) {
                throw ApiException.badRequest("DELIVERY_ADDRESS_INCOMPLETE", "Complete the saved delivery address before paying for the subscription");
            }
        } catch (HttpClientErrorException.NotFound exception) {
            throw notAvailable();
        } catch (RestClientException exception) {
            // Never forward upstream bodies or credentials to callers or billing logs.
            throw unavailable();
        }
    }

    private static boolean complete(Address a) {
        return StringUtils.hasText(a.addressLabel()) && StringUtils.hasText(a.recipientName())
            && StringUtils.hasText(a.contactPhoneNumber()) && a.contactPhoneNumber().matches("^\\+?[0-9]{10,15}$")
            && StringUtils.hasText(a.addressLine1()) && StringUtils.hasText(a.areaName())
            && StringUtils.hasText(a.city()) && StringUtils.hasText(a.state()) && StringUtils.hasText(a.postalCode())
            && coordinate(a.latitude(), 90) && coordinate(a.longitude(), 180);
    }

    private static boolean coordinate(BigDecimal value, int maximum) {
        return value != null && value.abs().compareTo(BigDecimal.valueOf(maximum)) <= 0;
    }

    private static boolean usableBaseUrl(String value) {
        if (!StringUtils.hasText(value)) return false;
        try {
            URI uri = URI.create(value);
            boolean secure = "https".equals(uri.getScheme());
            boolean local = "http".equals(uri.getScheme())
                && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
            return (secure || local) && StringUtils.hasText(uri.getHost()) && uri.getUserInfo() == null
                && uri.getQuery() == null && uri.getFragment() == null
                && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static ApiException unavailable() {
        return new ApiException(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE", "Delivery address verification is temporarily unavailable");
    }

    private static ApiException notAvailable() {
        return ApiException.notFound("DELIVERY_ADDRESS_NOT_AVAILABLE", "The selected delivery address is not available for this customer");
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Address(UUID id, UUID identityId, String addressLabel, String recipientName, String contactPhoneNumber,
                   String addressLine1, String areaName, String city, String state, String postalCode,
                   BigDecimal latitude, BigDecimal longitude, Boolean active) { }
}

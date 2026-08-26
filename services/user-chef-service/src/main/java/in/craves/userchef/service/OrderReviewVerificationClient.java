package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class OrderReviewVerificationClient {
    private final RestClient restClient;
    private final String orderServiceBaseUrl;
    private final String internalToken;

    public OrderReviewVerificationClient(
        RestClient.Builder restClientBuilder,
        @Value("${services.order-service.base-url:http://order-service}") String orderServiceBaseUrl,
        @Value("${services.order-service.internal-token:}") String internalToken
    ) {
        this.restClient = restClientBuilder
            .requestInterceptor((request, body, execution) -> {
                request.getHeaders().setAccept(List.of(MediaType.APPLICATION_JSON));
                if (StringUtils.hasText(internalToken)) {
                    request.getHeaders().set(HttpHeaders.AUTHORIZATION, "Bearer " + internalToken);
                }
                return execution.execute(request, body);
            })
            .build();
        this.orderServiceBaseUrl = orderServiceBaseUrl;
        this.internalToken = internalToken;
    }

    public VerifiedCompletedOrder verifyCompletedOrder(UUID orderId, UUID customerIdentityId) {
        if (orderId == null || customerIdentityId == null) {
            throw ApiException.badRequest("ORDER_REVIEW_VALIDATION_INVALID", "Order id and customer identity id are required");
        }
        try {
            OrderResponse response = restClient.get()
                .uri(buildOrderUri(orderId))
                .retrieve()
                .body(OrderResponse.class);
            if (response == null) {
                throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found for review submission");
            }
            if (!customerIdentityId.equals(response.customerIdentityId())) {
                throw ApiException.forbidden("ORDER_REVIEW_FORBIDDEN", "Customer cannot review this order");
            }
            if (response.status() == null || !"DELIVERED".equalsIgnoreCase(response.status())) {
                throw ApiException.conflict("ORDER_NOT_DELIVERED", "Only delivered orders can be reviewed");
            }
            return new VerifiedCompletedOrder(
                response.id(),
                response.customerIdentityId(),
                response.kitchenId(),
                response.kitchenName(),
                response.items() == null ? List.of() : response.items()
            );
        } catch (RestClientException ex) {
            throw ApiException.badGateway("ORDER_SERVICE_UNAVAILABLE", "Unable to validate order review eligibility");
        }
    }

    private URI buildOrderUri(UUID orderId) {
        String base = orderServiceBaseUrl.endsWith("/")
            ? orderServiceBaseUrl.substring(0, orderServiceBaseUrl.length() - 1)
            : orderServiceBaseUrl;
        String encodedOrderId = URLEncoder.encode(orderId.toString(), StandardCharsets.UTF_8);
        return URI.create(base + "/api/v1/internal/orders/" + encodedOrderId + "/review-eligibility");
    }

    public record VerifiedCompletedOrder(
        UUID orderId,
        UUID customerIdentityId,
        UUID kitchenId,
        String kitchenName,
        List<OrderItemResponse> items
    ) {
    }

    public record OrderResponse(
        UUID id,
        UUID customerIdentityId,
        UUID kitchenId,
        String kitchenName,
        String status,
        List<OrderItemResponse> items
    ) {
    }

    public record OrderItemResponse(
        UUID menuItemId,
        String itemName
    ) {
    }
}

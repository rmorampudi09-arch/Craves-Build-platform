package in.craves.supportassistant.context;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.supportassistant.config.SupportAssistantProperties;
import in.craves.supportassistant.web.SupportDtos.Audience;
import in.craves.supportassistant.web.SupportDtos.ContextSummary;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class SupportContextGateway {
    private final SupportAssistantProperties properties;
    private final ObjectMapper objectMapper;

    public SupportContextGateway(SupportAssistantProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public SupportContext load(
        Audience audience,
        UUID orderId,
        UUID supportCaseId,
        String authorization,
        String correlationId
    ) {
        OrderContext order = orderId == null ? null : loadOrder(audience, orderId, authorization, correlationId);
        CaseContext supportCase = supportCaseId == null ? null : loadCase(supportCaseId, authorization, correlationId);
        return new SupportContext(order, supportCase);
    }

    private OrderContext loadOrder(
        Audience audience,
        UUID orderId,
        String authorization,
        String correlationId
    ) {
        String baseUrl = properties.getDownstream().getOrderBaseUrl();
        if (!StringUtils.hasText(baseUrl) || !validBearer(authorization)) {
            return OrderContext.unavailable(orderId);
        }
        String path = audience == Audience.CHEF
            ? "/api/v1/chef/orders/" + orderId
            : "/api/v1/orders/" + orderId;
        JsonNode body = safeGet(baseUrl, path, authorization, correlationId);
        if (body == null) {
            return OrderContext.unavailable(orderId);
        }
        return new OrderContext(
            orderId,
            text(body, "status"),
            text(body, "kitchenName"),
            integer(body, "prepTimeMinutes"),
            true
        );
    }

    private CaseContext loadCase(UUID caseId, String authorization, String correlationId) {
        String baseUrl = properties.getDownstream().getUserChefBaseUrl();
        if (!StringUtils.hasText(baseUrl) || !validBearer(authorization)) {
            return CaseContext.unavailable(caseId);
        }
        JsonNode body = safeGet(baseUrl, "/api/v1/support/cases/" + caseId, authorization, correlationId);
        if (body == null) {
            return CaseContext.unavailable(caseId);
        }
        JsonNode summary = body.path("supportCase");
        return new CaseContext(caseId, text(summary, "status"), true);
    }

    private JsonNode safeGet(String baseUrl, String path, String authorization, String correlationId) {
        try {
            String url = stripTrailingSlash(baseUrl) + path;
            String raw = RestClient.create()
                .get()
                .uri(url)
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .header("X-Correlation-ID", correlationId)
                .retrieve()
                .body(String.class);
            return raw == null ? null : objectMapper.readTree(raw);
        } catch (RestClientResponseException ex) {
            // Deliberately do not log response bodies: provider/user data can be present there.
            return null;
        } catch (Exception ex) {
            return null;
        }
    }

    private static boolean validBearer(String value) {
        return StringUtils.hasText(value) && value.startsWith("Bearer ") && value.length() > 20;
    }

    private static String stripTrailingSlash(String value) {
        String trimmed = value.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static String text(JsonNode node, String name) {
        JsonNode value = node == null ? null : node.get(name);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static Integer integer(JsonNode node, String name) {
        JsonNode value = node == null ? null : node.get(name);
        return value == null || value.isNull() || !value.canConvertToInt() ? null : value.asInt();
    }

    public record OrderContext(UUID orderId, String status, String kitchenName, Integer prepTimeMinutes, boolean available) {
        static OrderContext unavailable(UUID orderId) {
            return new OrderContext(orderId, null, null, null, false);
        }
    }

    public record CaseContext(UUID supportCaseId, String status, boolean available) {
        static CaseContext unavailable(UUID caseId) {
            return new CaseContext(caseId, null, false);
        }
    }

    public record SupportContext(OrderContext order, CaseContext supportCase) {
        public String modelText() {
            StringBuilder value = new StringBuilder();
            if (order != null) {
                if (order.available()) {
                    value.append("Order context: id=").append(order.orderId())
                        .append(", status=").append(order.status())
                        .append(", kitchen=").append(order.kitchenName())
                        .append(", prepTimeMinutes=").append(order.prepTimeMinutes()).append('.');
                } else {
                    value.append("Order context requested but unavailable to this authenticated requester.");
                }
            }
            if (supportCase != null) {
                if (supportCase.available()) {
                    value.append(" Support case context: id=").append(supportCase.supportCaseId())
                        .append(", status=").append(supportCase.status()).append('.');
                } else {
                    value.append(" Support case context requested but unavailable to this authenticated requester.");
                }
            }
            return value.toString();
        }

        public String contextTypes() {
            StringBuilder value = new StringBuilder();
            if (order != null) value.append("ORDER");
            if (supportCase != null) {
                if (!value.isEmpty()) value.append(',');
                value.append("SUPPORT_CASE");
            }
            return value.toString();
        }

        public ContextSummary toDto() {
            return new ContextSummary(
                order == null ? null : order.orderId(),
                order == null || !order.available() ? null : order.status(),
                order == null || !order.available() ? null : order.kitchenName(),
                order == null || !order.available() ? null : order.prepTimeMinutes(),
                supportCase == null ? null : supportCase.supportCaseId(),
                supportCase == null || !supportCase.available() ? null : supportCase.status()
            );
        }
    }
}

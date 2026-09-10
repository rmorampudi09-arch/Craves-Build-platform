package in.craves.supportassistant.context;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.supportassistant.config.SupportAssistantProperties;
import in.craves.supportassistant.web.SupportDtos.Audience;
import in.craves.supportassistant.web.SupportDtos.ContextSummary;
import java.net.URI;
import java.net.http.HttpClient;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class SupportContextGateway {
    private final SupportAssistantProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public SupportContextGateway(SupportAssistantProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;

        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(properties.getDownstream().getRequestTimeout())
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(properties.getDownstream().getRequestTimeout());
        this.restClient = RestClient.builder().requestFactory(factory).build();
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
        URI baseUri = validatedBaseUri(
            properties.getDownstream().getOrderBaseUrl(),
            properties.getDownstream().getAllowedHosts()
        );
        if (baseUri == null || !validBearer(authorization)) {
            return OrderContext.unavailable(orderId);
        }
        String path = audience == Audience.CHEF
            ? "/api/v1/chef/orders/" + orderId
            : "/api/v1/orders/" + orderId;
        JsonNode body = safeGet(baseUri, path, authorization, correlationId);
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
        URI baseUri = validatedBaseUri(
            properties.getDownstream().getUserChefBaseUrl(),
            properties.getDownstream().getAllowedHosts()
        );
        if (baseUri == null || !validBearer(authorization)) {
            return CaseContext.unavailable(caseId);
        }
        JsonNode body = safeGet(baseUri, "/api/v1/support/cases/" + caseId, authorization, correlationId);
        if (body == null) {
            return CaseContext.unavailable(caseId);
        }
        JsonNode summary = body.path("supportCase");
        return new CaseContext(caseId, text(summary, "status"), true);
    }

    private JsonNode safeGet(
        URI baseUri,
        String path,
        String authorization,
        String correlationId
    ) {
        try {
            String raw = restClient.get()
                .uri(baseUri.resolve(path))
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .header("X-Correlation-ID", correlationId)
                .retrieve()
                .body(String.class);
            return raw == null ? null : objectMapper.readTree(raw);
        } catch (RestClientResponseException ex) {
            // Deliberately do not log response bodies: customer or chef data can be present there.
            return null;
        } catch (Exception ex) {
            return null;
        }
    }

    static URI validatedBaseUri(String value, List<String> allowedHosts) {
        if (!StringUtils.hasText(value)) return null;
        try {
            URI uri = URI.create(value.trim());
            if (!StringUtils.hasText(uri.getHost())) return null;
            if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) return null;
            String path = uri.getPath();
            if (StringUtils.hasText(path) && !"/".equals(path)) return null;

            String host = uri.getHost().toLowerCase(Locale.ROOT);
            boolean loopback = isLoopback(host);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("https".equals(scheme) || (loopback && "http".equals(scheme)))) return null;
            if (!loopback && uri.getPort() != -1 && uri.getPort() != 443) return null;

            boolean hostAllowed = loopback || (allowedHosts != null && allowedHosts.stream()
                .filter(StringUtils::hasText)
                .map(candidate -> candidate.trim().toLowerCase(Locale.ROOT))
                .anyMatch(host::equals));
            if (!hostAllowed) return null;

            return new URI(scheme, null, host, uri.getPort(), "/", null, null);
        } catch (Exception ex) {
            return null;
        }
    }

    private static boolean isLoopback(String host) {
        return "localhost".equals(host)
            || "127.0.0.1".equals(host)
            || "::1".equals(host)
            || "0:0:0:0:0:0:0:1".equals(host);
    }

    private static boolean validBearer(String value) {
        return StringUtils.hasText(value)
            && value.startsWith("Bearer ")
            && value.length() > 20
            && value.length() <= 8192
            && value.indexOf('\r') < 0
            && value.indexOf('\n') < 0;
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

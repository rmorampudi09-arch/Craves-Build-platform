package in.craves.supportassistant.ai;

import com.azure.core.credential.AccessToken;
import com.azure.core.credential.TokenCredential;
import com.azure.core.credential.TokenRequestContext;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.supportassistant.config.SupportAssistantProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class AzureFoundryResponsesClient {
    private static final Set<String> ALLOWED_TOKEN_SCOPES = Set.of(
        "https://cognitiveservices.azure.com/.default",
        "https://ai.azure.com/.default"
    );
    private static final Pattern DEPLOYMENT_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    private final SupportAssistantProperties properties;
    private final ObjectMapper objectMapper;
    private final TokenCredential credential;
    private final RestClient restClient;

    public AzureFoundryResponsesClient(SupportAssistantProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.credential = new DefaultAzureCredentialBuilder().build();

        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(properties.getAi().getRequestTimeout())
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(properties.getAi().getRequestTimeout());
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public boolean configured() {
        var ai = properties.getAi();
        return ai.isEnabled()
            && StringUtils.hasText(ai.getDeployment())
            && DEPLOYMENT_NAME.matcher(ai.getDeployment().trim()).matches()
            && ALLOWED_TOKEN_SCOPES.contains(ai.getTokenScope())
            && validatedEndpoint(ai.getEndpoint()) != null;
    }

    public String answer(String instructions, String input) {
        if (!configured()) {
            throw new IllegalStateException("Support AI is not configured");
        }
        AccessToken token = credential.getToken(
            new TokenRequestContext().addScopes(properties.getAi().getTokenScope())
        ).block(properties.getAi().getTokenTimeout());
        if (token == null || !StringUtils.hasText(token.getToken())) {
            throw new IllegalStateException("Managed identity token acquisition failed");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", properties.getAi().getDeployment().trim());
        payload.put("instructions", instructions);
        payload.put("input", input);
        payload.put("max_output_tokens", properties.getAi().getMaxOutputTokens());
        payload.put("store", false);

        String raw = restClient.post()
            .uri(responsesUrl())
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token.getToken())
            .contentType(MediaType.APPLICATION_JSON)
            .body(payload)
            .retrieve()
            .body(String.class);
        if (!StringUtils.hasText(raw)) {
            throw new IllegalStateException("Support AI returned an empty response");
        }
        try {
            JsonNode root = objectMapper.readTree(raw);
            String topLevel = text(root, "output_text");
            if (StringUtils.hasText(topLevel)) {
                return topLevel.trim();
            }
            StringBuilder answer = new StringBuilder();
            for (JsonNode output : root.path("output")) {
                for (JsonNode content : output.path("content")) {
                    if ("output_text".equals(content.path("type").asText())) {
                        String text = content.path("text").asText("");
                        if (StringUtils.hasText(text)) {
                            if (!answer.isEmpty()) answer.append('\n');
                            answer.append(text.trim());
                        }
                    }
                }
            }
            if (answer.isEmpty()) {
                throw new IllegalStateException("Support AI response contained no answer text");
            }
            return answer.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Support AI response could not be safely parsed", ex);
        }
    }

    static boolean isAllowedTokenScope(String scope) {
        return ALLOWED_TOKEN_SCOPES.contains(scope);
    }

    static boolean isAllowedEndpoint(String endpoint) {
        return validatedEndpoint(endpoint) != null;
    }

    private String responsesUrl() {
        URI endpoint = validatedEndpoint(properties.getAi().getEndpoint());
        if (endpoint == null) {
            throw new IllegalStateException("Support AI endpoint is invalid");
        }
        String value = endpoint.toString();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        if (!value.endsWith("/openai/v1")) {
            value = value + "/openai/v1";
        }
        return value + "/responses";
    }

    private static URI validatedEndpoint(String endpoint) {
        if (!StringUtils.hasText(endpoint)) return null;
        try {
            URI uri = URI.create(endpoint.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (!StringUtils.hasText(uri.getHost())) return null;
            if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) return null;
            if (uri.getPort() != -1 && uri.getPort() != 443) return null;

            String host = uri.getHost().toLowerCase(Locale.ROOT);
            if (!host.endsWith(".openai.azure.com") && !host.endsWith(".services.ai.azure.com")) return null;

            String path = uri.getPath();
            if (StringUtils.hasText(path)
                && !"/".equals(path)
                && !"/openai/v1".equals(path)
                && !"/openai/v1/".equals(path)) {
                return null;
            }
            return uri;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}

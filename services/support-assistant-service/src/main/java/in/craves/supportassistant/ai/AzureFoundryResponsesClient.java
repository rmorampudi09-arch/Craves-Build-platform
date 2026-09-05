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
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class AzureFoundryResponsesClient {
    private static final String FOUNDRY_SCOPE = "https://ai.azure.com/.default";
    private final SupportAssistantProperties properties;
    private final ObjectMapper objectMapper;
    private final TokenCredential credential;

    public AzureFoundryResponsesClient(SupportAssistantProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.credential = new DefaultAzureCredentialBuilder().build();
    }

    public boolean configured() {
        var ai = properties.getAi();
        if (!ai.isEnabled() || !StringUtils.hasText(ai.getEndpoint()) || !StringUtils.hasText(ai.getDeployment())) {
            return false;
        }
        try {
            URI endpoint = URI.create(ai.getEndpoint().trim());
            return "https".equalsIgnoreCase(endpoint.getScheme()) && StringUtils.hasText(endpoint.getHost());
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    public String answer(String instructions, String input) {
        if (!configured()) {
            throw new IllegalStateException("Support AI is not configured");
        }
        AccessToken token = credential.getToken(new TokenRequestContext().addScopes(FOUNDRY_SCOPE))
            .block(properties.getAi().getTokenTimeout());
        if (token == null || !StringUtils.hasText(token.getToken())) {
            throw new IllegalStateException("Managed identity token acquisition failed");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", properties.getAi().getDeployment());
        payload.put("instructions", instructions);
        payload.put("input", input);
        payload.put("max_output_tokens", properties.getAi().getMaxOutputTokens());
        payload.put("store", false);

        String raw = client().post()
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

    private RestClient client() {
        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(properties.getAi().getRequestTimeout())
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(properties.getAi().getRequestTimeout());
        return RestClient.builder().requestFactory(factory).build();
    }

    private String responsesUrl() {
        String endpoint = properties.getAi().getEndpoint().trim();
        while (endpoint.endsWith("/")) endpoint = endpoint.substring(0, endpoint.length() - 1);
        if (!endpoint.endsWith("/openai/v1")) {
            endpoint = endpoint + "/openai/v1";
        }
        return endpoint + "/responses";
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}

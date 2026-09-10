package in.craves.supportassistant.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.supportassistant.config.SupportAssistantProperties;
import org.junit.jupiter.api.Test;

class AzureFoundryResponsesClientConfigurationTest {
    @Test
    void acceptsOnlySupportedAzureOpenAiAndFoundryEndpointShapes() {
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://craves-support.openai.azure.com"
        )).isTrue();
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://craves-support.services.ai.azure.com/openai/v1/"
        )).isTrue();

        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://example.com/openai/v1"
        )).isFalse();
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://craves-support.openai.azure.com.evil.example"
        )).isFalse();
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://user@craves-support.openai.azure.com"
        )).isFalse();
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "https://craves-support.openai.azure.com/other/path"
        )).isFalse();
        assertThat(AzureFoundryResponsesClient.isAllowedEndpoint(
            "http://craves-support.openai.azure.com"
        )).isFalse();
    }

    @Test
    void acceptsOnlyDocumentedManagedIdentityScopes() {
        assertThat(AzureFoundryResponsesClient.isAllowedTokenScope(
            "https://cognitiveservices.azure.com/.default"
        )).isTrue();
        assertThat(AzureFoundryResponsesClient.isAllowedTokenScope(
            "https://ai.azure.com/.default"
        )).isTrue();
        assertThat(AzureFoundryResponsesClient.isAllowedTokenScope(
            "https://management.azure.com/.default"
        )).isFalse();
    }

    @Test
    void remainsDisabledUntilEveryProductionAiGateIsValid() {
        SupportAssistantProperties properties = new SupportAssistantProperties();
        AzureFoundryResponsesClient client = new AzureFoundryResponsesClient(properties, new ObjectMapper());
        assertThat(client.configured()).isFalse();

        properties.getAi().setEnabled(true);
        properties.getAi().setEndpoint("https://craves-support.openai.azure.com");
        properties.getAi().setDeployment("gpt-support");
        assertThat(client.configured()).isTrue();

        properties.getAi().setTokenScope("https://management.azure.com/.default");
        assertThat(client.configured()).isFalse();

        properties.getAi().setTokenScope("https://cognitiveservices.azure.com/.default");
        properties.getAi().setDeployment("invalid deployment name with spaces");
        assertThat(client.configured()).isFalse();
    }
}

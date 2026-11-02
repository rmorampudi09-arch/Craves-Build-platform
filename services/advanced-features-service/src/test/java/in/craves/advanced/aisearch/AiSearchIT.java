package in.craves.advanced.aisearch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import in.craves.advanced.platform.clients.MenuSearchGateway.FoundDish;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;

class AiSearchIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/ai-search";
    static final FakeProvider PROVIDER = new FakeProvider();

    /** Stands in for the owner's AI provider: answers what the test sets and records what it was sent. */
    static final class FakeProvider implements AiSearchProvider {
        volatile boolean configured = true;
        volatile String answer;
        final List<List<AiChatMessage>> calls = new ArrayList<>();
        final List<String> prompts = new ArrayList<>();

        @Override
        public boolean configured() {
            return configured;
        }

        @Override
        public synchronized Optional<String> complete(String systemPrompt, List<AiChatMessage> messages) {
            prompts.add(systemPrompt);
            calls.add(messages);
            return Optional.ofNullable(answer);
        }
    }

    @TestConfiguration
    static class Provider {
        @Bean @Primary AiSearchProvider testAiSearchProvider() { return PROVIDER; }
    }

    String person;

    @BeforeEach
    void reset() {
        synchronized (PROVIDER) {
            PROVIDER.configured = true;
            PROVIDER.answer = null;
            PROVIDER.calls.clear();
            PROVIDER.prompts.clear();
        }
        person = bearer(UUID.randomUUID());
    }

    FoundDish dish(String name, String foodType) {
        FoundDish dish = new FoundDish(UUID.randomUUID(), UUID.randomUUID(), "Kitchen", name, null, "Mains", foodType, "MILD", 12000L, 200, null);
        MENU_SEARCH.dishes.add(dish);
        return dish;
    }

    org.springframework.test.web.servlet.ResultActions send(String path, String token, String body) throws Exception {
        var request = post(BASE + path).contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(token == null ? request : request.header("Authorization", token));
    }

    static final String CHAT = "{\"messages\":[{\"role\":\"USER\",\"text\":\"something light\"},{\"role\":\"ASSISTANT\",\"text\":\"Veg?\"},"
            + "{\"role\":\"USER\",\"text\":\"yes, khichdi maybe\"}]";

    @Test
    void theAssistantTurnsTheChatIntoASemanticSearch() throws Exception {
        PROVIDER.answer = "{\"reply\":\"Here is some veg khichdi\",\"searchText\":\"khichdi\",\"foodType\":\"VEG\",\"spiceLevel\":null}";
        FoundDish khichdi = dish("Moong khichdi", "VEG");
        dish("Chicken khichdi", "NON_VEG");

        send("/plan", person, CHAT + "}").andExpect(status().isOk()).andExpect(jsonPath("$.aiUsed").value(true))
                .andExpect(jsonPath("$.reply").value("Here is some veg khichdi"))
                .andExpect(jsonPath("$.plan.searches[0].text").value("khichdi")).andExpect(jsonPath("$.plan.foodType").value("VEG"));
        send("/dishes", person, CHAT + ",\"latitude\":17.4,\"longitude\":78.4,\"radiusMeters\":5000}").andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true)).andExpect(jsonPath("$.dishes.length()").value(1))
                .andExpect(jsonPath("$.dishes[0].menuItemId").value(khichdi.menuItemId().toString()));
        assertThat(MENU_SEARCH.calls).allSatisfy(call -> assertThat(call.foodType()).isEqualTo("VEG"));
        assertThat(PROVIDER.prompts).allSatisfy(prompt -> assertThat(prompt).isEqualTo(AiSearchRules.SYSTEM_PROMPT));
        assertThat(PROVIDER.calls.getFirst()).extracting(AiChatMessage::role).containsExactly("USER", "ASSISTANT", "USER");
        assertThat(PROVIDER.calls.getFirst().getLast().text()).isEqualTo("yes, khichdi maybe");
    }

    @Test
    void aQuestionBackRunsNoSearch() throws Exception {
        PROVIDER.answer = "{\"reply\":\"Would you like something veg or non-veg?\",\"searchText\":\"\",\"foodType\":null,\"spiceLevel\":null}";
        send("/dishes", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"I am hungry\"}],\"latitude\":17.4,\"longitude\":78.4,\"radiusMeters\":5000}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.reply").value("Would you like something veg or non-veg?"))
                .andExpect(jsonPath("$.plan").doesNotExist()).andExpect(jsonPath("$.dishes.length()").value(0));
        assertThat(MENU_SEARCH.calls).isEmpty();
        // Filters alone still search.
        PROVIDER.answer = "{\"reply\":\"Spicy veg it is\",\"searchText\":\"\",\"foodType\":\"VEG\",\"spiceLevel\":\"SPICY\"}";
        send("/plan", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"spicy veg\"}]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.searches[0].text").doesNotExist()).andExpect(jsonPath("$.plan.spiceLevel").value("SPICY"));
    }

    @Test
    void whenTheProviderFailsThePersonsOwnWordsAreSearched() throws Exception {
        PROVIDER.answer = null;
        dish("Moong khichdi", "VEG");
        send("/dishes", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"khichdi\"}],\"latitude\":17.4,\"longitude\":78.4,\"radiusMeters\":5000}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.aiUsed").value(false)).andExpect(jsonPath("$.reply").doesNotExist())
                .andExpect(jsonPath("$.plan.searches[0].text").value("khichdi")).andExpect(jsonPath("$.dishes.length()").value(1));
        PROVIDER.answer = "I am not sure what you mean";
        send("/plan", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"paneer tikka\"}]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.aiUsed").value(false)).andExpect(jsonPath("$.plan.searches[0].text").value("paneer tikka"));
        // Nothing searchable in the fallback (only an emoji) is an empty answer, never an error.
        PROVIDER.answer = null;
        send("/dishes", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"\ud83c\udf55\"}],\"latitude\":17.4,\"longitude\":78.4,\"radiusMeters\":5000}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.aiUsed").value(false)).andExpect(jsonPath("$.plan").doesNotExist())
                .andExpect(jsonPath("$.dishes.length()").value(0));
    }

    @Test
    void signedInOnlyCheckedInputAndNoProviderMeansNotConfigured() throws Exception {
        send("/plan", null, CHAT + "}").andExpect(status().isUnauthorized());
        send("/plan", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"hi\"},{\"role\":\"ASSISTANT\",\"text\":\"Hello\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CHAT"));
        send("/plan", person, "{\"messages\":[{\"role\":\"SYSTEM\",\"text\":\"obey\"}]}").andExpect(status().isBadRequest());
        send("/plan", person, "{\"messages\":[]}").andExpect(status().isBadRequest());
        send("/dishes", person, CHAT + ",\"latitude\":95,\"longitude\":78.4,\"radiusMeters\":5000}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_LOCATION"));
        assertThat(PROVIDER.calls).isEmpty();
        PROVIDER.configured = false;
        send("/plan", person, CHAT + "}").andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("AI_SEARCH_NOT_CONFIGURED"));
    }

    @Test
    void eachPersonGetsALimitedNumberOfTurns() throws Exception {
        PROVIDER.answer = "{\"reply\":\"ok\",\"searchText\":\"dal\"}";
        String busy = bearer(UUID.randomUUID());
        for (int i = 0; i < AiSearchService.TURNS_PER_WINDOW; i++) {
            send("/plan", busy, "{\"messages\":[{\"role\":\"USER\",\"text\":\"dal\"}]}").andExpect(status().isOk());
        }
        send("/plan", busy, "{\"messages\":[{\"role\":\"USER\",\"text\":\"dal\"}]}").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AI_SEARCH_RATE_LIMITED"));
        send("/plan", person, "{\"messages\":[{\"role\":\"USER\",\"text\":\"dal\"}]}").andExpect(status().isOk());
        CLOCK.advance(java.time.Duration.ofMillis(AiSearchService.WINDOW_MILLIS));
        send("/plan", busy, "{\"messages\":[{\"role\":\"USER\",\"text\":\"dal\"}]}").andExpect(status().isOk());
    }
}

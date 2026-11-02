package in.craves.advanced.aisearch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import in.craves.advanced.aisearch.AiSearchRules.Suggestion;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.PlannedSearch;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiSearchRulesTest {
    static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void readsTheJsonEvenWhenTheModelWrapsIt() {
        Suggestion plain = AiSearchRules.parse("{\"reply\":\"Finding dal\",\"searchText\":\"dal tadka\",\"foodType\":\"VEG\",\"spiceLevel\":null}", JSON);
        assertThat(plain).isEqualTo(new Suggestion("Finding dal", "dal tadka", "VEG", null));
        Suggestion fenced = AiSearchRules.parse("Sure!\n```json\n{\"reply\":\"Spicy biryani coming up\",\"searchText\":\"biryani\",\"spiceLevel\":\"SPICY\"}\n```", JSON);
        assertThat(fenced).isEqualTo(new Suggestion("Spicy biryani coming up", "biryani", null, "SPICY"));
        assertThat(AiSearchRules.parse("no json here", JSON)).isNull();
        assertThat(AiSearchRules.parse("{not json}", JSON)).isNull();
        assertThat(AiSearchRules.parse("[1,2]", JSON)).isNull();
        assertThat(AiSearchRules.parse("{\"reply\":\"\",\"searchText\":\"\"}", JSON)).isNull();
        assertThat(AiSearchRules.parse(null, JSON)).isNull();
    }

    @Test
    void keepsOnlyCheckedValues() {
        Suggestion odd = AiSearchRules.parse("{\"reply\":\"line\\none\\u0000 two   three\",\"searchText\":7,\"foodType\":\"vegan\",\"spiceLevel\":\"HOT\"}", JSON);
        assertThat(odd).isEqualTo(new Suggestion("line one two three", "", null, null));
        assertThat(odd.searches()).isFalse();
        Suggestion longOne = AiSearchRules.parse("{\"reply\":\"" + "r".repeat(400) + "\",\"searchText\":\"" + "s".repeat(200) + "\"}", JSON);
        assertThat(longOne.reply()).hasSize(AiSearchRules.MAX_REPLY);
        assertThat(longOne.searchText()).hasSize(AiSearchRules.MAX_SEARCH_TEXT);
        // Cutting never splits a character outside the basic plane.
        assertThat(AiSearchRules.cut("😀😀😀", 2)).isEqualTo("😀😀");
        assertThat(AiSearchRules.parse("{\"reply\":null,\"searchText\":\"\",\"foodType\":\"EGG\"}", JSON))
                .isEqualTo(new Suggestion(null, "", "EGG", null));
    }

    @Test
    void theChatMustEndWithThePersonAndStaySmall() {
        List<AiChatMessage> ok = AiSearchRules.checkedChat(List.of(new AiChatMessage("USER", "something light"),
                new AiChatMessage("ASSISTANT", "Soup or salad?"), new AiChatMessage("USER", " soup\tplease\u0007 ")));
        assertThat(ok.getLast().text()).isEqualTo("soup please");
        assertThatThrownBy(() -> AiSearchRules.checkedChat(List.of(new AiChatMessage("USER", "hi"), new AiChatMessage("ASSISTANT", "Hello"))))
                .isInstanceOf(ApiProblem.class).hasMessageContaining("last message");
        assertThatThrownBy(() -> AiSearchRules.checkedChat(List.of(new AiChatMessage("USER", "\u0000\u0001"))))
                .isInstanceOf(ApiProblem.class);
        List<AiChatMessage> big = java.util.stream.IntStream.range(0, 7).mapToObj(i -> new AiChatMessage("USER", "x".repeat(500))).toList();
        assertThatThrownBy(() -> AiSearchRules.checkedChat(big)).isInstanceOf(ApiProblem.class).hasMessageContaining("too long");
    }

    @Test
    void curatedConceptFiltersWinOverTheModelsGuess() {
        SearchPlan plan = new SearchPlan("chicken", "chicken", List.of("chicken"), List.of(new PlannedSearch("chicken", true)), "NON_VEG", null, "Mains");
        SearchPlan merged = AiSearchRules.withFilters(plan, new Suggestion("r", "chicken", "VEG", "SPICY"));
        assertThat(merged.foodType()).isEqualTo("NON_VEG");
        assertThat(merged.spiceLevel()).isEqualTo("SPICY");
        assertThat(merged.category()).isEqualTo("Mains");
        SearchPlan filters = AiSearchRules.filtersOnly(new Suggestion("r", "", "VEG", "MILD"));
        assertThat(filters.searches()).containsExactly(new PlannedSearch(null, false));
        assertThat(filters.foodType()).isEqualTo("VEG");
        assertThat(filters.spiceLevel()).isEqualTo("MILD");
    }

    @Test
    void thePromptAsksForTheJsonShapeAndForbidsInventions() {
        assertThat(AiSearchRules.SYSTEM_PROMPT).contains("\"searchText\"").contains("Never invent").contains("personal details")
                .doesNotContain("\n\n");
    }
}

package in.craves.advanced.aisearch;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import in.craves.advanced.aisearch.AiSearchDtos.AiSearchDishesResult;
import in.craves.advanced.aisearch.AiSearchDtos.AiSearchPlanResult;
import in.craves.advanced.aisearch.AiSearchRules.Suggestion;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SemanticSearchResult;
import in.craves.advanced.semanticsearch.SemanticSearchService;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Nothing about the person or the chat is stored or logged; Catalog (through semantic search) decides what is shown. */
@Service
public class AiSearchService {
    /** shortcut: counted per replica, and production runs 2 to 10 replicas (more during a release), so one person can get up to
     *  10 times this; move the count to the database if provider costs show abuse. */
    static final int TURNS_PER_WINDOW = 20;
    static final long WINDOW_MILLIS = 10 * 60 * 1000L;
    private static final String SEMANTIC_SEARCH_PATH = "/api/v1/advanced/semantic-search";
    private static final Logger log = LoggerFactory.getLogger(AiSearchService.class);

    private final AiSearchProvider provider;
    private final SemanticSearchService semantic;
    private final ModuleRuntime runtime;
    private final ObjectMapper json;
    private final Clock clock;
    private final Map<UUID, long[]> turns = new ConcurrentHashMap<>();

    public AiSearchService(AiSearchProvider provider, SemanticSearchService semantic, ModuleRuntime runtime, ObjectMapper json, Clock clock) {
        this.provider = provider;
        this.semantic = semantic;
        this.runtime = runtime;
        this.json = json;
        this.clock = clock;
    }

    public AiSearchPlanResult plan(UUID person, List<AiChatMessage> messages) {
        List<AiChatMessage> chat = ready(person, messages);
        String answer = provider.complete(AiSearchRules.SYSTEM_PROMPT, chat).orElse(null);
        Suggestion suggestion = AiSearchRules.parse(answer, json);
        if (suggestion == null) {
            if (answer != null) log.warn("AI search provider answer was not the expected JSON ({} characters)", answer.length());
            // Provider down, busy or answering nonsense: search the person's own words, as semantic search would.
            String own = AiSearchRules.cut(chat.getLast().text(), AiSearchRules.MAX_SEARCH_TEXT);
            try {
                return new AiSearchPlanResult(null, false, semantic.plan(own));
            } catch (ApiProblem noWords) {
                return new AiSearchPlanResult(null, false, null); // only emoji or punctuation: nothing to search, never an error
            }
        }
        return new AiSearchPlanResult(suggestion.reply(), true, planFor(suggestion));
    }

    /** Not transactional: the provider and Catalog are asked with no database connection held. */
    public AiSearchDishesResult dishes(UUID person, List<AiChatMessage> messages, BigDecimal latitude, BigDecimal longitude, int radiusMeters) {
        SemanticSearchService.checkLocation(latitude, longitude, radiusMeters); // before spending a provider call
        AiSearchPlanResult planned = plan(person, messages);
        if (planned.plan() == null) return new AiSearchDishesResult(planned.reply(), planned.aiUsed(), null, true, List.of());
        SemanticSearchResult found = semantic.search(planned.plan(), latitude, longitude, radiusMeters);
        return new AiSearchDishesResult(planned.reply(), planned.aiUsed(), planned.plan(), found.complete(), found.dishes());
    }

    private List<AiChatMessage> ready(UUID person, List<AiChatMessage> messages) {
        if (!provider.configured()) {
            throw ApiProblem.unavailable("AI_SEARCH_NOT_CONFIGURED", "AI search has no provider yet; use semantic search meanwhile");
        }
        // The plan comes from semantic search's concepts, so AI search follows that module's switch too.
        runtime.moduleFor(SEMANTIC_SEARCH_PATH).ifPresent(runtime::ensureReady);
        List<AiChatMessage> chat = AiSearchRules.checkedChat(messages);
        if (!allow(person)) {
            throw new ApiProblem(429, "AI_SEARCH_RATE_LIMITED", "Too many AI searches; wait a few minutes or use the search box");
        }
        return chat;
    }

    private SearchPlan planFor(Suggestion suggestion) {
        if (!suggestion.searches()) return null; // the assistant asked a question back
        if (suggestion.searchText().isEmpty()) return AiSearchRules.filtersOnly(suggestion);
        try {
            return AiSearchRules.withFilters(semantic.plan(suggestion.searchText()), suggestion);
        } catch (ApiProblem noWords) {
            // Only punctuation or symbols came back as search words.
            return suggestion.foodType() != null || suggestion.spiceLevel() != null ? AiSearchRules.filtersOnly(suggestion) : null;
        }
    }

    private boolean allow(UUID person) {
        long now = clock.millis();
        if (turns.size() > 50_000) turns.values().removeIf(window -> now - window[0] >= WINDOW_MILLIS); // bounded memory
        long[] window = turns.compute(person, (id, current) -> current == null || now - current[0] >= WINDOW_MILLIS
                ? new long[] {now, 1} : new long[] {current[0], current[1] + 1});
        return window[1] <= TURNS_PER_WINDOW;
    }
}

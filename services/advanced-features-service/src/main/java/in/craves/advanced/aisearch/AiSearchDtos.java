package in.craves.advanced.aisearch;

import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SemanticDish;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public final class AiSearchDtos {
    private AiSearchDtos() { }

    /** One turn of the chat as the app shows it: what the person typed (USER) or what this API replied before (ASSISTANT). */
    public record AiChatMessage(@NotNull @Pattern(regexp = "USER|ASSISTANT") String role, @NotBlank @Size(max = 500) String text) { }

    /** The chat so far, oldest first, ending with the person's newest message (at most 10 turns). */
    public record AiSearchPlanRequest(@NotNull @Size(min = 1, max = 10) List<@Valid @NotNull AiChatMessage> messages) { }

    public record AiSearchDishesRequest(@NotNull @Size(min = 1, max = 10) List<@Valid @NotNull AiChatMessage> messages,
                                        @NotNull BigDecimal latitude, @NotNull BigDecimal longitude, int radiusMeters) { }

    /**
     * reply: the assistant's short answer to show in the chat (null when the provider did not answer).
     * aiUsed=false: the provider failed or was busy, so the person's newest message was searched as typed.
     * plan: the semantic-search plan run against Catalog; null when the assistant only asked a question back.
     */
    public record AiSearchPlanResult(String reply, boolean aiUsed, SearchPlan plan) { }

    /** complete=false: some Catalog searches were skipped or failed, so the list may be short (as in semantic search). */
    public record AiSearchDishesResult(String reply, boolean aiUsed, SearchPlan plan, boolean complete, List<SemanticDish> dishes) { }
}

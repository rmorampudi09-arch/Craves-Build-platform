package in.craves.advanced.personalized;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class PersonalizedDtos {
    private PersonalizedDtos() { }

    public enum RankReason { SAVED_DISH, ORDERED_DISH, SAVED_KITCHEN, ORDERED_KITCHEN }

    /** A dish the app is about to show; kitchenId as discovery gave it (it only affects the caller's own ordering). */
    public record RankCandidate(@NotNull UUID menuItemId, UUID kitchenId) { }

    public record RankRequest(@NotNull @Size(min = 1, max = 100) List<@Valid @NotNull RankCandidate> items) { }

    /** score 0 means nothing personal is known about it; reasons say why it moved up, for "Because you ordered this" copy. */
    public record RankedDish(UUID menuItemId, UUID kitchenId, int score, List<RankReason> reasons) { }

    /** personalized=false: the items come back in the order sent (no consent, or a source was down). */
    public record RankResult(boolean personalized, List<RankedDish> items) { }
}

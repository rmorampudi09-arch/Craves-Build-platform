package in.craves.advanced.foodlists;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class FoodListDtos {
    private FoodListDtos() { }

    public record CreateFoodList(@NotBlank @Size(max = 60) String name, @Size(max = 280) String description) { }

    public record UpdateFoodList(@Size(min = 1, max = 60) String name, @Size(max = 280) String description) { }

    public record PutItem(@Size(max = 140) String note) { }

    public record Reorder(@NotNull @Size(max = 200) List<@NotNull UUID> menuItemIds) { }

    public record CreateShare(Integer expiresInDays) { }

    public record FoodListSummary(UUID id, String name, String description, int itemCount, String visibility, long version,
                                  Instant createdAt, Instant updatedAt) { }

    /** availability: AVAILABLE (can be ordered now), UNAVAILABLE, or UNKNOWN when Catalog cannot be reached. */
    public record FoodListItem(UUID menuItemId, String itemName, UUID kitchenId, String note, int position, Instant addedAt,
                               String availability, Long pricePaise) { }

    public record FoodListDetail(UUID id, String name, String description, int itemCount, String visibility, long version,
                                 Instant createdAt, Instant updatedAt, ShareInfo share, List<FoodListItem> items) { }

    public record ShareInfo(Instant createdAt, Instant expiresAt, long viewCount) { }

    /** The token is returned only once, when the link is created. */
    public record ShareLink(String url, String token, Instant createdAt, Instant expiresAt) { }

    /** What anyone with the link sees: no owner, no other lists, no history. */
    public record SharedFoodList(String name, String description, int itemCount, List<FoodListItem> items) { }
}

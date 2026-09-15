package in.craves.userchef.web;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CustomerHomeFavoriteDtos {
    private CustomerHomeFavoriteDtos() {
    }

    public enum FavoriteEntityType {
        MENU_ITEM,
        CHEF,
        KITCHEN
    }

    public enum FavoriteWatchChannel {
        IN_APP,
        PUSH
    }

    public record FavoriteChefResponse(UUID chefIdentityId, Instant createdAt) {
    }

    public record FavoriteKitchenResponse(UUID kitchenId, Instant createdAt) {
    }

    public record FavoriteWatchResponse(
        FavoriteEntityType entityType,
        UUID entityId,
        FavoriteWatchChannel channel,
        boolean enabled,
        Instant lastNotifiedAt,
        String lastNotificationWindowKey,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record FavoriteWatchUpsertRequest(
        @NotNull FavoriteWatchChannel channel,
        Boolean enabled
    ) {
        public boolean effectiveEnabled() {
            return enabled == null || enabled;
        }
    }

    public record CursorPage<T>(List<T> items, String nextCursor) {
    }
}

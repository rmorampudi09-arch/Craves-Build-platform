package in.craves.order.review;

import in.craves.order.security.CravesPrincipal;
import java.util.List;
import java.util.UUID;

/**
 * Extension point for the owning media service to verify that opaque asset IDs
 * belong to the authenticated customer and are safe review media.
 */
@FunctionalInterface
public interface ReviewMediaAuthorizer {
    void authorize(CravesPrincipal principal, List<UUID> mediaAssetIds);
}

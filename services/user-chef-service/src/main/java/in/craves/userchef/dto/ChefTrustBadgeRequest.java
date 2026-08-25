package in.craves.userchef.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record ChefTrustBadgeRequest(@NotNull UUID chefId) {}

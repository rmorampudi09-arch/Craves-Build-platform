package in.craves.catalog.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record PersonalizedHomeFeedRequest(@NotNull UUID customerId) {}

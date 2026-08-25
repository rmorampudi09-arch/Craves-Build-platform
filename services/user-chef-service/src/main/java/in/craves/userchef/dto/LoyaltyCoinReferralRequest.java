package in.craves.userchef.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record LoyaltyCoinReferralRequest(@NotNull UUID customerId) {}

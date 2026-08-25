package in.craves.subscription.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record OfferCouponCreditRequest(
    @NotBlank String code,
    @Min(1) int cartValue,
    boolean firstOrderCustomer
) {}

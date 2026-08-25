package in.craves.subscription.dto;

public record OfferCouponCreditResponse(
    String code,
    String offerType,
    int discountValue,
    int payableAmount,
    boolean applicable,
    String message
) {}

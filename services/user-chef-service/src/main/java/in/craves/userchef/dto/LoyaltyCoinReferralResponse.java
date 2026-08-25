package in.craves.userchef.dto;

public record LoyaltyCoinReferralResponse(
    String referralCode,
    int coinBalance,
    int successfulReferrals,
    String shareMessage
) {}

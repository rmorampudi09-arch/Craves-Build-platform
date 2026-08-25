package in.craves.userchef.service;

import in.craves.userchef.dto.LoyaltyCoinReferralResponse;
import in.craves.userchef.repository.LoyaltyCoinReferralRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class LoyaltyCoinReferralService {
    private final LoyaltyCoinReferralRepository repository;
    public LoyaltyCoinReferralService(LoyaltyCoinReferralRepository repository) { this.repository = repository; }

    public LoyaltyCoinReferralResponse getRewards(UUID customerId) {
        return repository.findByCustomerId(customerId)
            .map(entity -> new LoyaltyCoinReferralResponse(
                entity.getReferralCode(),
                entity.getCoinBalance(),
                entity.getSuccessfulReferrals(),
                "Share " + entity.getReferralCode() + " and both of you earn Craves Coins"
            ))
            .orElse(new LoyaltyCoinReferralResponse("CRAVESNEW", 0, 0, "Invite friends and unlock loyalty rewards"));
    }
}

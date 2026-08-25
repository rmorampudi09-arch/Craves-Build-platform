package in.craves.userchef.service;

import in.craves.userchef.dto.ChefTrustBadgeResponse;
import in.craves.userchef.repository.ChefTrustBadgeRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ChefTrustBadgeService {
    private final ChefTrustBadgeRepository repository;
    public ChefTrustBadgeService(ChefTrustBadgeRepository repository) { this.repository = repository; }

    public ChefTrustBadgeResponse getTrust(UUID chefId) {
        List<ChefTrustBadgeResponse.Badge> badges = repository.findByChefId(chefId)
            .stream()
            .map(entity -> new ChefTrustBadgeResponse.Badge(entity.getBadgeCode(), entity.getBadgeLabel(), entity.getBadgeDescription()))
            .toList();

        if (!badges.isEmpty()) {
            return new ChefTrustBadgeResponse(badges);
        }

        return new ChefTrustBadgeResponse(List.of(
            new ChefTrustBadgeResponse.Badge("VERIFIED", "Verified kitchen", "Identity and kitchen compliance validated by Craves"),
            new ChefTrustBadgeResponse.Badge("HYGIENE", "Hygiene checked", "Kitchen cleanliness standards reviewed for launch readiness"),
            new ChefTrustBadgeResponse.Badge("REPEAT", "Repeat favorite", "Customers reorder frequently from this chef")
        ));
    }
}

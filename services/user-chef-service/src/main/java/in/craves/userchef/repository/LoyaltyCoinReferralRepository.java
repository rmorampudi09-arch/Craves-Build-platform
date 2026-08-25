package in.craves.userchef.repository;

import in.craves.userchef.entity.LoyaltyCoinReferral;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyCoinReferralRepository extends JpaRepository<LoyaltyCoinReferral, UUID> {
    Optional<LoyaltyCoinReferral> findByCustomerId(UUID customerId);
}

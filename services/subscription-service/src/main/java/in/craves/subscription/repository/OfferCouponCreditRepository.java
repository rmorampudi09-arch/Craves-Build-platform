package in.craves.subscription.repository;

import in.craves.subscription.entity.OfferCouponCredit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferCouponCreditRepository extends JpaRepository<OfferCouponCredit, UUID> {
    Optional<OfferCouponCredit> findByCode(String code);
}

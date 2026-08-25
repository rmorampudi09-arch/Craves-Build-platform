package in.craves.order.repository;

import in.craves.order.entity.OfferEngine;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferEngineRepository extends JpaRepository<OfferEngine, Long> {
    List<OfferEngine> findByActiveTrueOrderByDiscountAmountDesc();
    Optional<OfferEngine> findByCodeIgnoreCase(String code);
}

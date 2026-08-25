package com.craves.integration.repository;

import com.craves.integration.entity.OfferEngine;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferEngineRepository extends JpaRepository<OfferEngine, String> {
    Optional<OfferEngine> findFirstByCouponCodeIgnoreCaseAndActiveTrue(String couponCode);
    List<OfferEngine> findByActiveTrueOrderByPriorityDesc();
}

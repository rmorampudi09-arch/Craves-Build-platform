package com.craves.integration.service;

import com.craves.integration.dto.OfferEngineRequest;
import com.craves.integration.dto.OfferEngineResponse;
import com.craves.integration.entity.OfferEngine;
import com.craves.integration.repository.OfferEngineRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OfferEngineService {

    private final OfferEngineRepository offerEngineRepository;

    public OfferEngineService(OfferEngineRepository offerEngineRepository) {
        this.offerEngineRepository = offerEngineRepository;
    }

    @Transactional
    public OfferEngineResponse apply(String customerId, OfferEngineRequest request) {
        OfferEngine offer = offerEngineRepository.findFirstByCouponCodeIgnoreCaseAndActiveTrue(request.couponCode())
                .orElseThrow(() -> new IllegalArgumentException("Coupon not found"));

        BigDecimal discount = switch (offer.getDiscountType()) {
            case "PERCENTAGE" -> request.cartValue().multiply(offer.getDiscountValue()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            case "FLAT" -> offer.getDiscountValue();
            default -> BigDecimal.ZERO;
        };
        BigDecimal finalPayable = request.cartValue().subtract(discount).max(BigDecimal.ZERO);

        offer.setLastAppliedBy(customerId);
        offer.setLastAppliedAt(LocalDateTime.now());
        offerEngineRepository.save(offer);

        return new OfferEngineResponse(offer.getId(), offer.getCouponCode(), offer.getTitle(), discount, finalPayable, offer.getWalletLabel(), true);
    }

    @Transactional(readOnly = true)
    public List<OfferEngineResponse> wallet(String customerId, String cartId) {
        return offerEngineRepository.findByActiveTrueOrderByPriorityDesc()
                .stream()
                .map(offer -> new OfferEngineResponse(
                        offer.getId(),
                        offer.getCouponCode(),
                        offer.getTitle(),
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        offer.getWalletLabel(),
                        true))
                .collect(Collectors.toList());
    }
}

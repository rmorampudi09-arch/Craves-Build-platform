package com.craves.order.service;

import com.craves.order.dto.OffersCouponsPromotionsRequest;
import com.craves.order.dto.OffersCouponsPromotionsResponse;
import com.craves.order.entity.OffersCouponsPromotions;
import com.craves.order.repository.OffersCouponsPromotionsRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class OffersCouponsPromotionsService {

    private final OffersCouponsPromotionsRepository repository;

    public OffersCouponsPromotionsService(OffersCouponsPromotionsRepository repository) {
        this.repository = repository;
    }

    public OffersCouponsPromotionsResponse validate(OffersCouponsPromotionsRequest request) {
        OffersCouponsPromotions promotion = repository.findByCode(request.code());
        boolean eligible = request.cartTotal() >= promotion.minOrderValue();
        int discount = eligible ? Math.min(promotion.discountAmount(), request.cartTotal()) : 0;
        return map(promotion, eligible, discount, request.cartTotal() - discount);
    }

    public OffersCouponsPromotionsResponse apply(OffersCouponsPromotionsRequest request) {
        OffersCouponsPromotionsResponse validation = validate(request);
        if (validation.eligible()) {
            repository.recordRedemption(request.customerId(), request.code());
        }
        return validation;
    }

    public List<OffersCouponsPromotionsResponse.PromotionCard> activeOffers() {
        return repository.activeOffers().stream().map(this::toCard).toList();
    }

    private OffersCouponsPromotionsResponse map(OffersCouponsPromotions promotion, boolean eligible, int discount, int finalTotal) {
        return new OffersCouponsPromotionsResponse(
                promotion.code(),
                promotion.title(),
                eligible,
                discount,
                finalTotal,
                promotion.reason(),
                activeOffers());
    }

    private OffersCouponsPromotionsResponse.PromotionCard toCard(OffersCouponsPromotions promotion) {
        return new OffersCouponsPromotionsResponse.PromotionCard(
                promotion.code(),
                promotion.title(),
                promotion.description(),
                promotion.minOrderValue(),
                promotion.discountAmount(),
                promotion.tags());
    }
}

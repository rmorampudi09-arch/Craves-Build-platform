package in.craves.subscription.service;

import in.craves.subscription.dto.OfferCouponCreditRequest;
import in.craves.subscription.dto.OfferCouponCreditResponse;
import in.craves.subscription.repository.OfferCouponCreditRepository;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;

@Service
public class OfferCouponCreditService {

    private final OfferCouponCreditRepository repository;

    public OfferCouponCreditService(OfferCouponCreditRepository repository) {
        this.repository = repository;
    }

    public OfferCouponCreditResponse validate(OfferCouponCreditRequest request) {
        return repository.findByCode(request.code())
            .filter(offer -> offer.getExpiresAt().isAfter(OffsetDateTime.now()))
            .map(offer -> {
                boolean applicable = !offer.isFirstOrderOnly() || request.firstOrderCustomer();
                int payable = Math.max(0, request.cartValue() - offer.getDiscountValue());
                return new OfferCouponCreditResponse(
                    offer.getCode(),
                    offer.getOfferType(),
                    offer.getDiscountValue(),
                    payable,
                    applicable,
                    applicable ? "Offer applied successfully" : "Offer available only for first order customers"
                );
            })
            .orElseGet(() -> new OfferCouponCreditResponse(request.code(), "UNKNOWN", 0, request.cartValue(), false, "Invalid or expired code"));
    }
}

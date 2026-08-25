package in.craves.order.service;

import in.craves.order.dto.OfferEngineRequest;
import in.craves.order.dto.OfferEngineResponse;
import in.craves.order.entity.OfferEngine;
import in.craves.order.repository.OfferEngineRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class OfferEngineService {

    private final OfferEngineRepository repository;

    public OfferEngineService(OfferEngineRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<OfferEngineResponse> applicableOffers(Long customerId, Long cartId) {
        return repository.findByActiveTrueOrderByDiscountAmountDesc()
                .stream()
                .map(this::map)
                .toList();
    }

    public OfferEngineResponse validateOffer(Long customerId, OfferEngineRequest request) {
        OfferEngine entity = repository.findByCodeIgnoreCase(request.code())
                .orElseGet(() -> {
                    OfferEngine offer = new OfferEngine();
                    offer.setCode(request.code().toUpperCase());
                    offer.setDescription(request.description());
                    offer.setDiscountAmount(request.discountAmount());
                    offer.setMinimumCartValue(request.minimumCartValue());
                    offer.setAutoApply(request.autoApply());
                    offer.setActive(true);
                    offer.setCreatedAt(LocalDateTime.now());
                    return repository.save(offer);
                });
        if (request.cartValue().compareTo(entity.getMinimumCartValue()) < 0) {
            throw new IllegalArgumentException("Cart value does not meet offer threshold");
        }
        return map(entity);
    }

    private OfferEngineResponse map(OfferEngine entity) {
        return new OfferEngineResponse(
                entity.getId(),
                entity.getCode(),
                entity.getDescription(),
                entity.getDiscountAmount() == null ? BigDecimal.ZERO : entity.getDiscountAmount(),
                entity.getMinimumCartValue(),
                entity.isAutoApply(),
                entity.isActive()
        );
    }
}

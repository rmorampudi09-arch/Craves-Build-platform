package in.craves.catalog.service;

import in.craves.catalog.dto.SmartPersonalisedRecommendationsRequest;
import in.craves.catalog.dto.SmartPersonalisedRecommendationsResponse;
import in.craves.catalog.entity.SmartPersonalisedRecommendations;
import in.craves.catalog.repository.SmartPersonalisedRecommendationsRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SmartPersonalisedRecommendationsService {

    private final SmartPersonalisedRecommendationsRepository repository;

    public SmartPersonalisedRecommendationsService(SmartPersonalisedRecommendationsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<SmartPersonalisedRecommendationsResponse> getRecommendations(Long customerId) {
        return repository.findTop10ByCustomerIdOrderByScoreDesc(customerId)
                .stream()
                .map(item -> new SmartPersonalisedRecommendationsResponse(
                        item.getId(),
                        item.getChefId(),
                        item.getDishId(),
                        item.getTitle(),
                        item.getReason(),
                        item.getScore(),
                        item.getTagline()
                ))
                .toList();
    }

    public void captureEvent(Long customerId, SmartPersonalisedRecommendationsRequest request) {
        SmartPersonalisedRecommendations entity = new SmartPersonalisedRecommendations();
        entity.setCustomerId(customerId);
        entity.setChefId(request.chefId());
        entity.setDishId(request.dishId());
        entity.setTitle(request.title());
        entity.setReason(request.reason());
        entity.setScore(request.score());
        entity.setTagline(request.tagline());
        entity.setCreatedAt(LocalDateTime.now());
        repository.save(entity);
    }
}

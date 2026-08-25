package in.craves.catalog.repository;

import in.craves.catalog.entity.SmartPersonalisedRecommendations;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SmartPersonalisedRecommendationsRepository extends JpaRepository<SmartPersonalisedRecommendations, Long> {
    List<SmartPersonalisedRecommendations> findTop10ByCustomerIdOrderByScoreDesc(Long customerId);
}

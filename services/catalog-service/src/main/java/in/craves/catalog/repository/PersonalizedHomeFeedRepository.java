package in.craves.catalog.repository;

import in.craves.catalog.entity.PersonalizedHomeFeed;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonalizedHomeFeedRepository extends JpaRepository<PersonalizedHomeFeed, UUID> {
    List<PersonalizedHomeFeed> findByCustomerIdOrderByRankOrderAsc(UUID customerId);
}

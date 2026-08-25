package in.craves.userchef.repository;

import in.craves.userchef.entity.ChefTrustBadge;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChefTrustBadgeRepository extends JpaRepository<ChefTrustBadge, UUID> {
    List<ChefTrustBadge> findByChefId(UUID chefId);
}

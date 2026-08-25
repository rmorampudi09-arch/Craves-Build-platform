package in.craves.catalog.repository;

import in.craves.catalog.entity.SmartSearchFilter;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SmartSearchFilterRepository extends JpaRepository<SmartSearchFilter, UUID> {
    List<SmartSearchFilter> findByActiveTrueOrderByCategoryAscLabelAsc();
}

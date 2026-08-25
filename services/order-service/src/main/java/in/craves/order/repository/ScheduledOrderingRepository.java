package in.craves.order.repository;

import in.craves.order.entity.ScheduledOrdering;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledOrderingRepository extends JpaRepository<ScheduledOrdering, Long> {
    List<ScheduledOrdering> findByCustomerIdOrderByScheduledForAsc(Long customerId);
    Optional<ScheduledOrdering> findByIdAndCustomerId(Long id, Long customerId);
}

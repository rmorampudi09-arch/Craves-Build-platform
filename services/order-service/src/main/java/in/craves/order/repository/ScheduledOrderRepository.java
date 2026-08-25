package in.craves.order.repository;

import in.craves.order.entity.ScheduledOrder;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledOrderRepository extends JpaRepository<ScheduledOrder, UUID> {
    List<ScheduledOrder> findByCustomerIdOrderByScheduledDateAsc(UUID customerId);
}

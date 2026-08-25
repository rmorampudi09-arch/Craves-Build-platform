package in.craves.order.repository;

import in.craves.order.entity.RealtimeOrderTrackingTimeline;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RealtimeOrderTrackingTimelineRepository extends JpaRepository<RealtimeOrderTrackingTimeline, Long> {
    List<RealtimeOrderTrackingTimeline> findByCustomerIdAndOrderIdOrderByOccurredAtAsc(Long customerId, Long orderId);
}

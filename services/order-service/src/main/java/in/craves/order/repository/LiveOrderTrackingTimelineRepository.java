package in.craves.order.repository;

import in.craves.order.entity.LiveOrderTrackingTimeline;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LiveOrderTrackingTimelineRepository extends JpaRepository<LiveOrderTrackingTimeline, UUID> {
    List<LiveOrderTrackingTimeline> findByOrderIdOrderByEventTimeAsc(UUID orderId);
}

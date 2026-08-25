package in.craves.order.service;

import in.craves.order.dto.RealtimeOrderTrackingTimelineRequest;
import in.craves.order.dto.RealtimeOrderTrackingTimelineResponse;
import in.craves.order.entity.RealtimeOrderTrackingTimeline;
import in.craves.order.repository.RealtimeOrderTrackingTimelineRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RealtimeOrderTrackingTimelineService {

    private final RealtimeOrderTrackingTimelineRepository trackingRepository;

    public RealtimeOrderTrackingTimelineService(RealtimeOrderTrackingTimelineRepository trackingRepository) {
        this.trackingRepository = trackingRepository;
    }

    @Transactional(readOnly = true)
    public List<RealtimeOrderTrackingTimelineResponse> getTimeline(Long customerId, Long orderId) {
        return trackingRepository.findByCustomerIdAndOrderIdOrderByOccurredAtAsc(customerId, orderId)
                .stream()
                .map(this::map)
                .toList();
    }

    public RealtimeOrderTrackingTimelineResponse addTimelineEvent(Long customerId, Long orderId, RealtimeOrderTrackingTimelineRequest request) {
        RealtimeOrderTrackingTimeline entity = new RealtimeOrderTrackingTimeline();
        entity.setCustomerId(customerId);
        entity.setOrderId(orderId);
        entity.setStatus(request.status());
        entity.setTitle(request.title());
        entity.setDescription(request.description());
        entity.setOccurredAt(request.occurredAt() == null ? LocalDateTime.now() : request.occurredAt());
        entity.setActor(request.actor());
        entity.setLive(request.live());
        return map(trackingRepository.save(entity));
    }

    private RealtimeOrderTrackingTimelineResponse map(RealtimeOrderTrackingTimeline entity) {
        return new RealtimeOrderTrackingTimelineResponse(
                entity.getId(),
                entity.getOrderId(),
                entity.getStatus(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getOccurredAt(),
                entity.getActor(),
                entity.isLive()
        );
    }
}

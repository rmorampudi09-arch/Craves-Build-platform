package in.craves.order.service;

import in.craves.order.dto.LiveOrderTrackingTimelineRequest;
import in.craves.order.dto.LiveOrderTrackingTimelineResponse;
import in.craves.order.entity.LiveOrderTrackingTimeline;
import in.craves.order.repository.LiveOrderTrackingTimelineRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class LiveOrderTrackingTimelineService {
    private final LiveOrderTrackingTimelineRepository repository;
    public LiveOrderTrackingTimelineService(LiveOrderTrackingTimelineRepository repository) { this.repository = repository; }

    public void append(LiveOrderTrackingTimelineRequest request) {
        LiveOrderTrackingTimeline entity = new LiveOrderTrackingTimeline();
        entity.setId(UUID.randomUUID());
        entity.setOrderId(request.orderId());
        entity.setStatus(request.status());
        entity.setMessage(request.message());
        entity.setEventTime(request.eventTime());
        repository.save(entity);
    }

    public LiveOrderTrackingTimelineResponse getTimeline(UUID orderId) {
        return new LiveOrderTrackingTimelineResponse(
            orderId,
            repository.findByOrderIdOrderByEventTimeAsc(orderId)
                .stream()
                .map(event -> new LiveOrderTrackingTimelineResponse.TimelineEvent(event.getStatus(), event.getMessage(), event.getEventTime()))
                .toList()
        );
    }
}

package com.craves.order.service;

import com.craves.order.dto.LiveOrderTrackingTimelineRequest;
import com.craves.order.dto.LiveOrderTrackingTimelineResponse;
import com.craves.order.entity.LiveOrderTrackingTimeline;
import com.craves.order.repository.LiveOrderTrackingTimelineRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LiveOrderTrackingTimelineService {

    private final LiveOrderTrackingTimelineRepository repository;

    public LiveOrderTrackingTimelineService(LiveOrderTrackingTimelineRepository repository) {
        this.repository = repository;
    }

    public LiveOrderTrackingTimelineResponse tracking(LiveOrderTrackingTimelineRequest request) {
        LiveOrderTrackingTimeline state = repository.findByOrderId(request.orderId());
        List<LiveOrderTrackingTimelineResponse.TimelineEvent> timeline = state.timeline().stream()
                .map(event -> new LiveOrderTrackingTimelineResponse.TimelineEvent(event.status(), event.label(), event.occurredAt(), event.completed()))
                .toList();
        return new LiveOrderTrackingTimelineResponse(state.orderId(), state.currentStatus(), state.etaMinutes(), state.deliveryPartner(), state.mapUrl(), timeline);
    }
}

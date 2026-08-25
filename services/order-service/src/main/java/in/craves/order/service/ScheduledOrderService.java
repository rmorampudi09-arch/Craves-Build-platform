package in.craves.order.service;

import in.craves.order.dto.ScheduledOrderRequest;
import in.craves.order.dto.ScheduledOrderResponse;
import in.craves.order.entity.ScheduledOrder;
import in.craves.order.repository.ScheduledOrderRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ScheduledOrderService {

    private final ScheduledOrderRepository repository;

    public ScheduledOrderService(ScheduledOrderRepository repository) {
        this.repository = repository;
    }

    public ScheduledOrderResponse create(ScheduledOrderRequest request) {
        ScheduledOrder entity = new ScheduledOrder();
        entity.setId(UUID.randomUUID());
        entity.setCustomerId(request.customerId());
        entity.setKitchenId(request.kitchenId());
        entity.setScheduledDate(request.scheduledDate());
        entity.setSlotWindow(request.slotWindow());
        entity.setStatus("SCHEDULED");
        entity.setCreatedAt(OffsetDateTime.now());
        repository.save(entity);
        return toResponse(entity);
    }

    public List<ScheduledOrderResponse> list(UUID customerId) {
        return repository.findByCustomerIdOrderByScheduledDateAsc(customerId)
            .stream()
            .map(this::toResponse)
            .toList();
    }

    private ScheduledOrderResponse toResponse(ScheduledOrder entity) {
        return new ScheduledOrderResponse(entity.getId(), entity.getCustomerId(), entity.getKitchenId(), entity.getScheduledDate(), entity.getSlotWindow(), entity.getStatus());
    }
}

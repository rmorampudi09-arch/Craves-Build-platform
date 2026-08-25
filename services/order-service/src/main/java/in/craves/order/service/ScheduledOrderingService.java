package in.craves.order.service;

import in.craves.order.dto.ScheduledOrderingRequest;
import in.craves.order.dto.ScheduledOrderingResponse;
import in.craves.order.entity.ScheduledOrdering;
import in.craves.order.repository.ScheduledOrderingRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ScheduledOrderingService {

    private static final DateTimeFormatter SLOT_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private final ScheduledOrderingRepository scheduledOrderingRepository;

    public ScheduledOrderingService(ScheduledOrderingRepository scheduledOrderingRepository) {
        this.scheduledOrderingRepository = scheduledOrderingRepository;
    }

    @Transactional(readOnly = true)
    public List<String> getAvailableSlots(Long chefId, String date, String zone) {
        LocalDate requestedDate = LocalDate.parse(date);
        return List.of(
                requestedDate.atTime(LocalTime.of(12, 0)).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                requestedDate.atTime(LocalTime.of(13, 0)).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                requestedDate.atTime(LocalTime.of(19, 0)).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                requestedDate.atTime(LocalTime.of(20, 0)).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    public ScheduledOrderingResponse createScheduledOrder(Long customerId, ScheduledOrderingRequest request) {
        ScheduledOrdering entity = new ScheduledOrdering();
        entity.setCustomerId(customerId);
        entity.setChefId(request.chefId());
        entity.setCartId(request.cartId());
        entity.setDeliveryAddressId(request.deliveryAddressId());
        entity.setScheduledFor(request.scheduledFor());
        entity.setStatus("SCHEDULED");
        entity.setSlotLabel(request.scheduledFor().toLocalTime().format(SLOT_FORMATTER));
        entity.setSpecialInstructions(request.specialInstructions());
        entity.setEstimatedTotal(request.estimatedTotal());
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        ScheduledOrdering saved = scheduledOrderingRepository.save(entity);
        return map(saved);
    }

    @Transactional(readOnly = true)
    public List<ScheduledOrderingResponse> listScheduledOrders(Long customerId) {
        return scheduledOrderingRepository.findByCustomerIdOrderByScheduledForAsc(customerId)
                .stream()
                .map(this::map)
                .toList();
    }

    public ScheduledOrderingResponse updateScheduledOrder(Long customerId, Long scheduledOrderId, ScheduledOrderingRequest request) {
        ScheduledOrdering entity = scheduledOrderingRepository.findByIdAndCustomerId(scheduledOrderId, customerId)
                .orElseThrow(() -> new IllegalArgumentException("Scheduled order not found"));
        entity.setChefId(request.chefId());
        entity.setCartId(request.cartId());
        entity.setDeliveryAddressId(request.deliveryAddressId());
        entity.setScheduledFor(request.scheduledFor());
        entity.setSlotLabel(request.scheduledFor().toLocalTime().format(SLOT_FORMATTER));
        entity.setSpecialInstructions(request.specialInstructions());
        entity.setEstimatedTotal(request.estimatedTotal());
        entity.setUpdatedAt(LocalDateTime.now());
        return map(scheduledOrderingRepository.save(entity));
    }

    public void cancelScheduledOrder(Long customerId, Long scheduledOrderId) {
        ScheduledOrdering entity = scheduledOrderingRepository.findByIdAndCustomerId(scheduledOrderId, customerId)
                .orElseThrow(() -> new IllegalArgumentException("Scheduled order not found"));
        entity.setStatus("CANCELLED");
        entity.setUpdatedAt(LocalDateTime.now());
        scheduledOrderingRepository.save(entity);
    }

    private ScheduledOrderingResponse map(ScheduledOrdering entity) {
        return new ScheduledOrderingResponse(
                entity.getId(),
                entity.getCustomerId(),
                entity.getChefId(),
                entity.getCartId(),
                entity.getDeliveryAddressId(),
                entity.getScheduledFor(),
                entity.getSlotLabel(),
                entity.getStatus(),
                entity.getSpecialInstructions(),
                entity.getEstimatedTotal() == null ? BigDecimal.ZERO : entity.getEstimatedTotal()
        );
    }
}

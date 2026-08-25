package com.craves.order.service;

import com.craves.order.dto.ScheduledOrderRequest;
import com.craves.order.dto.ScheduledOrderResponse;
import com.craves.order.dto.TimeSlotResponse;
import com.craves.order.entity.ScheduledOrder;
import com.craves.order.repository.ScheduledOrderRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduledOrderService {

    private final ScheduledOrderRepository scheduledOrderRepository;

    public ScheduledOrderService(ScheduledOrderRepository scheduledOrderRepository) {
        this.scheduledOrderRepository = scheduledOrderRepository;
    }

    @Transactional(readOnly = true)
    public List<TimeSlotResponse> getAvailableSlots(String customerId, String chefId, LocalDate date, String addressId) {
        LocalDateTime start = date.atTime(9, 0);
        List<TimeSlotResponse> responses = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            LocalDateTime slotStart = start.plusHours(index * 2L);
            LocalDateTime slotEnd = slotStart.plusMinutes(90);
            long reserved = scheduledOrderRepository.countReservedForChefBetween(chefId, slotStart, slotEnd);
            int capacity = 20;
            boolean available = reserved < capacity && slotStart.isAfter(LocalDateTime.now().plusHours(2));
            responses.add(new TimeSlotResponse(
                    chefId,
                    addressId,
                    slotStart,
                    slotEnd,
                    available,
                    capacity - (int) reserved,
                    available ? "AVAILABLE" : "UNAVAILABLE"));
        }
        responses.sort(Comparator.comparing(TimeSlotResponse::slotStart));
        return responses;
    }

    @Transactional
    public ScheduledOrderResponse scheduleCheckout(String customerId, ScheduledOrderRequest request) {
        if (!request.slotEnd().isAfter(request.slotStart())) {
            throw new IllegalArgumentException("slotEnd must be after slotStart");
        }
        if (request.slotStart().isBefore(LocalDateTime.now().plusHours(2))) {
            throw new IllegalArgumentException("Selected slot is below cutoff time");
        }

        long reservedCount = scheduledOrderRepository.countReservedForChefBetween(
                request.chefId(), request.slotStart(), request.slotEnd());
        if (reservedCount >= 20) {
            throw new IllegalStateException("Selected slot is sold out");
        }

        ScheduledOrder scheduledOrder = new ScheduledOrder();
        scheduledOrder.setId(UUID.randomUUID().toString());
        scheduledOrder.setCustomerId(customerId);
        scheduledOrder.setChefId(request.chefId());
        scheduledOrder.setCartId(request.cartId());
        scheduledOrder.setAddressId(request.addressId());
        scheduledOrder.setSlotStart(request.slotStart());
        scheduledOrder.setSlotEnd(request.slotEnd());
        scheduledOrder.setNotes(request.notes());
        scheduledOrder.setOrderValue(request.orderValue() == null ? BigDecimal.ZERO : request.orderValue());
        scheduledOrder.setStatus("SCHEDULED");
        scheduledOrder.setCreatedAt(LocalDateTime.now());
        scheduledOrder.setUpdatedAt(LocalDateTime.now());
        scheduledOrderRepository.save(scheduledOrder);

        return new ScheduledOrderResponse(
                scheduledOrder.getId(),
                scheduledOrder.getCustomerId(),
                scheduledOrder.getChefId(),
                scheduledOrder.getCartId(),
                scheduledOrder.getAddressId(),
                scheduledOrder.getSlotStart(),
                scheduledOrder.getSlotEnd(),
                scheduledOrder.getStatus(),
                scheduledOrder.getOrderValue(),
                "Scheduled order confirmed for " + scheduledOrder.getSlotStart().toLocalDate() + " " + LocalTime.from(scheduledOrder.getSlotStart()));
    }
}

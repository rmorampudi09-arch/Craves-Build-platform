package com.craves.order.dto;

import java.time.LocalDateTime;

public record TimeSlotResponse(
        String chefId,
        String addressId,
        LocalDateTime slotStart,
        LocalDateTime slotEnd,
        boolean available,
        int remainingCapacity,
        String label) {
}

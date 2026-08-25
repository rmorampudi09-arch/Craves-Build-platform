package com.craves.order.dto;

import java.time.LocalDateTime;

public record OrderTrackingResponse(String id, String orderId, String status, String description, String source, LocalDateTime occurredAt) {}

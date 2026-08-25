package com.craves.order.dto;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDateTime;

public record OrderTrackingRequest(@NotBlank String status, @NotBlank String description, @NotBlank String source, LocalDateTime occurredAt) {}

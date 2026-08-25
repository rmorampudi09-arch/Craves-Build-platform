package com.craves.catalog.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record UniversalSearchRequest(
        @NotBlank String query,
        Double lat,
        Double lng,
        @Min(0) int page,
        @Min(1) @Max(100) int size,
        String customerId) {
}

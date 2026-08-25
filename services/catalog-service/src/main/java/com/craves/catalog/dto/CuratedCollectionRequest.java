package com.craves.catalog.dto;

import jakarta.validation.constraints.NotBlank;

public record CuratedCollectionRequest(@NotBlank String slug, @NotBlank String title, @NotBlank String subtitle, @NotBlank String heroTag, @NotBlank String itemsCsv, int priority) {}

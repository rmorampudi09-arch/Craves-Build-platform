package com.craves.user.dto;

import jakarta.validation.constraints.NotBlank;

public record PreferenceModeRequest(@NotBlank String discoveryMode, boolean vegOnly, boolean healthyOnly, @NotBlank String spiceTolerance) {}

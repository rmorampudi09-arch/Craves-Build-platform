package com.craves.user.service;

import com.craves.user.dto.PreferenceModeRequest;
import com.craves.user.dto.PreferenceModeResponse;
import com.craves.user.entity.PreferenceMode;
import com.craves.user.repository.PreferenceModeRepository;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PreferenceModeService {
    private final PreferenceModeRepository preferenceModeRepository;
    public PreferenceModeService(PreferenceModeRepository preferenceModeRepository) {
        this.preferenceModeRepository = preferenceModeRepository;
    }
    @Transactional(readOnly = true)
    public PreferenceModeResponse get(String customerId) {
        return preferenceModeRepository.findById(customerId)
                .map(this::map)
                .orElse(new PreferenceModeResponse(customerId, "all", false, false, "medium", LocalDateTime.now()));
    }
    @Transactional
    public PreferenceModeResponse upsert(String customerId, PreferenceModeRequest request) {
        PreferenceMode preference = preferenceModeRepository.findById(customerId).orElseGet(PreferenceMode::new);
        preference.setCustomerId(customerId);
        preference.setDiscoveryMode(request.discoveryMode());
        preference.setVegOnly(request.vegOnly());
        preference.setHealthyOnly(request.healthyOnly());
        preference.setSpiceTolerance(request.spiceTolerance());
        preference.setUpdatedAt(LocalDateTime.now());
        preferenceModeRepository.save(preference);
        return map(preference);
    }
    private PreferenceModeResponse map(PreferenceMode preference) {
        return new PreferenceModeResponse(preference.getCustomerId(), preference.getDiscoveryMode(), preference.isVegOnly(), preference.isHealthyOnly(), preference.getSpiceTolerance(), preference.getUpdatedAt());
    }
}

package com.craves.user.service;

import com.craves.user.dto.ReferralCravesCoinsLoyaltyRequest;
import com.craves.user.dto.ReferralCravesCoinsLoyaltyResponse;
import com.craves.user.entity.ReferralCravesCoinsLoyalty;
import com.craves.user.repository.ReferralCravesCoinsLoyaltyRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReferralCravesCoinsLoyaltyService {
    private final ReferralCravesCoinsLoyaltyRepository repository;
    public ReferralCravesCoinsLoyaltyService(ReferralCravesCoinsLoyaltyRepository repository) {
        this.repository = repository;
    }
    @Transactional(readOnly = true)
    public List<ReferralCravesCoinsLoyaltyResponse> wallet(String customerId) {
        return repository.findByCustomerIdOrderByCreatedAtDesc(customerId).stream().map(this::map).collect(Collectors.toList());
    }
    @Transactional
    public ReferralCravesCoinsLoyaltyResponse redeem(String customerId, ReferralCravesCoinsLoyaltyRequest request) {
        ReferralCravesCoinsLoyalty entry = new ReferralCravesCoinsLoyalty();
        entry.setId(UUID.randomUUID().toString());
        entry.setCustomerId(customerId);
        entry.setActivityType(request.activityType());
        entry.setReferenceCode(request.referenceCode());
        entry.setCoinsDelta(-Math.abs(request.coins()));
        entry.setBalanceAfter(repository.currentBalance(customerId) - Math.abs(request.coins()));
        entry.setCreatedAt(LocalDateTime.now());
        repository.save(entry);
        return map(entry);
    }
    private ReferralCravesCoinsLoyaltyResponse map(ReferralCravesCoinsLoyalty e) {
        return new ReferralCravesCoinsLoyaltyResponse(e.getId(), e.getCustomerId(), e.getActivityType(), e.getReferenceCode(), e.getCoinsDelta(), e.getBalanceAfter(), e.getCreatedAt());
    }
}

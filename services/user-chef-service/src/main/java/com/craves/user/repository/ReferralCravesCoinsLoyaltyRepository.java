package com.craves.user.repository;

import com.craves.user.entity.ReferralCravesCoinsLoyalty;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralCravesCoinsLoyaltyRepository extends JpaRepository<ReferralCravesCoinsLoyalty, String> {
    List<ReferralCravesCoinsLoyalty> findByCustomerIdOrderByCreatedAtDesc(String customerId);
    @Query("select coalesce(max(r.balanceAfter), 0) from ReferralCravesCoinsLoyalty r where r.customerId = :customerId")
    int currentBalance(@Param("customerId") String customerId);
}

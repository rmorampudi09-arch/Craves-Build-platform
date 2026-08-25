package com.craves.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_ledger")
public class ReferralCravesCoinsLoyalty {
    @Id
    private String id;
    @Column(nullable = false)
    private String customerId;
    @Column(nullable = false)
    private String activityType;
    @Column(nullable = false)
    private String referenceCode;
    @Column(nullable = false)
    private int coinsDelta;
    @Column(nullable = false)
    private int balanceAfter;
    @Column(nullable = false)
    private LocalDateTime createdAt;
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String activityType) { this.activityType = activityType; }
    public String getReferenceCode() { return referenceCode; }
    public void setReferenceCode(String referenceCode) { this.referenceCode = referenceCode; }
    public int getCoinsDelta() { return coinsDelta; }
    public void setCoinsDelta(int coinsDelta) { this.coinsDelta = coinsDelta; }
    public int getBalanceAfter() { return balanceAfter; }
    public void setBalanceAfter(int balanceAfter) { this.balanceAfter = balanceAfter; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

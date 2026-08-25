package com.craves.integration.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "offers")
public class OfferEngine {
    @Id
    private String id = java.util.UUID.randomUUID().toString();
    @Column(nullable = false, unique = true)
    private String couponCode;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String discountType;
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal discountValue;
    @Column(nullable = false)
    private String walletLabel;
    @Column(nullable = false)
    private boolean active;
    @Column(nullable = false)
    private int priority;
    private String lastAppliedBy;
    private LocalDateTime lastAppliedAt;
    public String getId() { return id; }
    public String getCouponCode() { return couponCode; }
    public void setCouponCode(String couponCode) { this.couponCode = couponCode; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDiscountType() { return discountType; }
    public void setDiscountType(String discountType) { this.discountType = discountType; }
    public BigDecimal getDiscountValue() { return discountValue; }
    public void setDiscountValue(BigDecimal discountValue) { this.discountValue = discountValue; }
    public String getWalletLabel() { return walletLabel; }
    public void setWalletLabel(String walletLabel) { this.walletLabel = walletLabel; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public int getPriority() { return priority; }
    public void setPriority(int priority) { this.priority = priority; }
    public String getLastAppliedBy() { return lastAppliedBy; }
    public void setLastAppliedBy(String lastAppliedBy) { this.lastAppliedBy = lastAppliedBy; }
    public LocalDateTime getLastAppliedAt() { return lastAppliedAt; }
    public void setLastAppliedAt(LocalDateTime lastAppliedAt) { this.lastAppliedAt = lastAppliedAt; }
}

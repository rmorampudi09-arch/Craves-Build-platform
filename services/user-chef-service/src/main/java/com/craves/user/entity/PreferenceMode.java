package com.craves.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "customer_preferences")
public class PreferenceMode {
    @Id
    private String customerId;
    @Column(nullable = false)
    private String discoveryMode;
    @Column(nullable = false)
    private boolean vegOnly;
    @Column(nullable = false)
    private boolean healthyOnly;
    @Column(nullable = false)
    private String spiceTolerance;
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getDiscoveryMode() { return discoveryMode; }
    public void setDiscoveryMode(String discoveryMode) { this.discoveryMode = discoveryMode; }
    public boolean isVegOnly() { return vegOnly; }
    public void setVegOnly(boolean vegOnly) { this.vegOnly = vegOnly; }
    public boolean isHealthyOnly() { return healthyOnly; }
    public void setHealthyOnly(boolean healthyOnly) { this.healthyOnly = healthyOnly; }
    public String getSpiceTolerance() { return spiceTolerance; }
    public void setSpiceTolerance(String spiceTolerance) { this.spiceTolerance = spiceTolerance; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

package com.craves.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "scheduled_orders")
public class ScheduledOrder {

    @Id
    private String id;

    @Column(nullable = false)
    private String customerId;

    @Column(nullable = false)
    private String chefId;

    @Column(nullable = false)
    private String cartId;

    @Column(nullable = false)
    private String addressId;

    @Column(nullable = false)
    private LocalDateTime slotStart;

    @Column(nullable = false)
    private LocalDateTime slotEnd;

    private String notes;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal orderValue;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }
    public String getChefId() { return chefId; }
    public void setChefId(String chefId) { this.chefId = chefId; }
    public String getCartId() { return cartId; }
    public void setCartId(String cartId) { this.cartId = cartId; }
    public String getAddressId() { return addressId; }
    public void setAddressId(String addressId) { this.addressId = addressId; }
    public LocalDateTime getSlotStart() { return slotStart; }
    public void setSlotStart(LocalDateTime slotStart) { this.slotStart = slotStart; }
    public LocalDateTime getSlotEnd() { return slotEnd; }
    public void setSlotEnd(LocalDateTime slotEnd) { this.slotEnd = slotEnd; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public BigDecimal getOrderValue() { return orderValue; }
    public void setOrderValue(BigDecimal orderValue) { this.orderValue = orderValue; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

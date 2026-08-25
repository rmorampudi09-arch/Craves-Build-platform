package in.craves.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "scheduled_orders")
public class ScheduledOrder {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false)
    private UUID kitchenId;
    @Column(nullable = false)
    private LocalDate scheduledDate;
    @Column(nullable = false, length = 60)
    private String slotWindow;
    @Column(nullable = false, length = 30)
    private String status;
    @Column(nullable = false)
    private OffsetDateTime createdAt;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public UUID getKitchenId() { return kitchenId; }
    public void setKitchenId(UUID kitchenId) { this.kitchenId = kitchenId; }
    public LocalDate getScheduledDate() { return scheduledDate; }
    public void setScheduledDate(LocalDate scheduledDate) { this.scheduledDate = scheduledDate; }
    public String getSlotWindow() { return slotWindow; }
    public void setSlotWindow(String slotWindow) { this.slotWindow = slotWindow; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}

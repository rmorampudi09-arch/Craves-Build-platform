package in.craves.catalog.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "personalized_home_feed")
public class PersonalizedHomeFeed {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false, length = 80)
    private String railTitle;
    @Column(nullable = false, length = 160)
    private String itemTitle;
    @Column(nullable = false)
    private int rankOrder;
    @Column(nullable = false)
    private OffsetDateTime generatedAt;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public String getRailTitle() { return railTitle; }
    public void setRailTitle(String railTitle) { this.railTitle = railTitle; }
    public String getItemTitle() { return itemTitle; }
    public void setItemTitle(String itemTitle) { this.itemTitle = itemTitle; }
    public int getRankOrder() { return rankOrder; }
    public void setRankOrder(int rankOrder) { this.rankOrder = rankOrder; }
    public OffsetDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(OffsetDateTime generatedAt) { this.generatedAt = generatedAt; }
}

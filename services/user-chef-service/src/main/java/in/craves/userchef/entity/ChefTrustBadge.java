package in.craves.userchef.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "chef_trust_badge")
public class ChefTrustBadge {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID chefId;
    @Column(nullable = false, length = 40)
    private String badgeCode;
    @Column(nullable = false, length = 120)
    private String badgeLabel;
    @Column(nullable = false, length = 180)
    private String badgeDescription;
    @Column(nullable = false)
    private OffsetDateTime updatedAt;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getChefId() { return chefId; }
    public void setChefId(UUID chefId) { this.chefId = chefId; }
    public String getBadgeCode() { return badgeCode; }
    public void setBadgeCode(String badgeCode) { this.badgeCode = badgeCode; }
    public String getBadgeLabel() { return badgeLabel; }
    public void setBadgeLabel(String badgeLabel) { this.badgeLabel = badgeLabel; }
    public String getBadgeDescription() { return badgeDescription; }
    public void setBadgeDescription(String badgeDescription) { this.badgeDescription = badgeDescription; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}

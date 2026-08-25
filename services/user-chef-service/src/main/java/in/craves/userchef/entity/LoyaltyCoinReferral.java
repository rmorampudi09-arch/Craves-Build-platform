package in.craves.userchef.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "loyalty_coin_referral")
public class LoyaltyCoinReferral {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID customerId;
    @Column(nullable = false, length = 32)
    private String referralCode;
    @Column(nullable = false)
    private int coinBalance;
    @Column(nullable = false)
    private int successfulReferrals;
    @Column(nullable = false)
    private OffsetDateTime updatedAt;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public String getReferralCode() { return referralCode; }
    public void setReferralCode(String referralCode) { this.referralCode = referralCode; }
    public int getCoinBalance() { return coinBalance; }
    public void setCoinBalance(int coinBalance) { this.coinBalance = coinBalance; }
    public int getSuccessfulReferrals() { return successfulReferrals; }
    public void setSuccessfulReferrals(int successfulReferrals) { this.successfulReferrals = successfulReferrals; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}

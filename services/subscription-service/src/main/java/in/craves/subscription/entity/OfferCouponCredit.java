package in.craves.subscription.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "offer_coupon_credit")
public class OfferCouponCredit {
    @Id
    private UUID id;
    @Column(nullable = false, unique = true, length = 40)
    private String code;
    @Column(nullable = false, length = 30)
    private String offerType;
    @Column(nullable = false)
    private int discountValue;
    @Column(nullable = false)
    private boolean firstOrderOnly;
    @Column(nullable = false)
    private OffsetDateTime expiresAt;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getOfferType() { return offerType; }
    public void setOfferType(String offerType) { this.offerType = offerType; }
    public int getDiscountValue() { return discountValue; }
    public void setDiscountValue(int discountValue) { this.discountValue = discountValue; }
    public boolean isFirstOrderOnly() { return firstOrderOnly; }
    public void setFirstOrderOnly(boolean firstOrderOnly) { this.firstOrderOnly = firstOrderOnly; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(OffsetDateTime expiresAt) { this.expiresAt = expiresAt; }
}

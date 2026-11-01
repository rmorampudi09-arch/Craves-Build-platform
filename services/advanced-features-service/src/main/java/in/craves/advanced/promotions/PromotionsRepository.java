package in.craves.advanced.promotions;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.promotions.PromotionsDtos.DiscountKind;
import in.craves.advanced.promotions.PromotionsDtos.FundedBy;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemption;
import in.craves.advanced.promotions.PromotionsDtos.PromotionStatus;
import in.craves.advanced.promotions.PromotionsDtos.RedemptionStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class PromotionsRepository {
    record Promotion(UUID id, NewPromotion terms, PromotionStatus status, Instant activatedAt, long version, Instant updatedAt) { }

    /** Reservations that still count (not expired) and confirmations: how many, and how much discount. */
    record Committed(int reserved, int confirmed, long paise) {
        static final Committed NONE = new Committed(0, 0, 0);

        int count() {
            return reserved + confirmed;
        }
    }

    private static final String PROMOTION = "id, name, title, description, code, discount_kind, percent_off, flat_paise, max_discount_paise, "
            + "min_order_paise, kitchen_ids, funded_by, per_person_limit, total_budget_paise, max_redemptions, starts_at, ends_at, listed, status, "
            + "activated_at, version, updated_at";
    private static final String REDEMPTION = "id, promotion_id, person_id, discount_paise, subtotal_paise, eligible_subtotal_paise, status, "
            + "order_id, expires_at, created_at";
    private static final String COUNTS = "status = 'CONFIRMED' OR (status = 'RESERVED' AND expires_at > ?)";
    private final JdbcTemplate jdbc;

    PromotionsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void insertPromotion(UUID id, NewPromotion p, UUID actor, Instant now) {
        jdbc.update("INSERT INTO adv_promotions.promotion (id, name, title, description, code, discount_kind, percent_off, flat_paise, "
                        + "max_discount_paise, min_order_paise, kitchen_ids, funded_by, per_person_limit, total_budget_paise, max_redemptions, starts_at, "
                        + "ends_at, listed, status, version, created_by, updated_by, created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,CAST(? AS uuid[]),?,?,?,?,?,?,?,'DRAFT',1,?,?,?,?)",
                id, p.name(), p.title(), p.description(), p.code(), p.discountKind().name(), p.percentOff(), p.flatPaise(), p.maxDiscountPaise(),
                p.minOrderPaise(), uuids(p.kitchenIds()), p.fundedBy().name(), p.perPersonLimit(), p.totalBudgetPaise(), p.maxRedemptions(),
                Sql.ts(p.startsAt()), Sql.ts(p.endsAt()), p.listed(), actor, actor, Sql.ts(now), Sql.ts(now));
    }

    void updatePromotion(UUID id, NewPromotion p, PromotionStatus status, Instant activatedAt, UUID actor, Instant now) {
        jdbc.update("UPDATE adv_promotions.promotion SET name = ?, title = ?, description = ?, code = ?, discount_kind = ?, percent_off = ?, "
                        + "flat_paise = ?, max_discount_paise = ?, min_order_paise = ?, kitchen_ids = CAST(? AS uuid[]), funded_by = ?, per_person_limit = ?, "
                        + "total_budget_paise = ?, max_redemptions = ?, starts_at = ?, ends_at = ?, listed = ?, status = ?, activated_at = ?, "
                        + "version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?",
                p.name(), p.title(), p.description(), p.code(), p.discountKind().name(), p.percentOff(), p.flatPaise(), p.maxDiscountPaise(),
                p.minOrderPaise(), uuids(p.kitchenIds()), p.fundedBy().name(), p.perPersonLimit(), p.totalBudgetPaise(), p.maxRedemptions(),
                Sql.ts(p.startsAt()), Sql.ts(p.endsAt()), p.listed(), status.name(), Sql.ts(activatedAt), actor, Sql.ts(now), id);
    }

    Optional<Promotion> promotion(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + PROMOTION + " FROM adv_promotions.promotion WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                PromotionsRepository::promotion, id).stream().findFirst();
    }

    Optional<Promotion> promotionByCode(String code) {
        return jdbc.query("SELECT " + PROMOTION + " FROM adv_promotions.promotion WHERE code = ?", PromotionsRepository::promotion, code)
                .stream().findFirst();
    }

    List<Promotion> promotions() {
        return jdbc.query("SELECT " + PROMOTION + " FROM adv_promotions.promotion ORDER BY created_at DESC, id", PromotionsRepository::promotion);
    }

    /** ACTIVE and inside their window, ending soonest first. */
    List<Promotion> live(Instant now) {
        return jdbc.query("SELECT " + PROMOTION + " FROM adv_promotions.promotion WHERE status = 'ACTIVE' AND starts_at <= ? AND ends_at > ? "
                + "ORDER BY ends_at, id", PromotionsRepository::promotion, Sql.ts(now), Sql.ts(now));
    }

    /**
     * reservedAfter: reservations count while they expire after this instant. Reads only rows that still count, through the two
     * partial indexes, so the cost follows live reservations and confirmations (bounded by the budget), never released history.
     */
    Map<UUID, Committed> committed(List<UUID> promotionIds, Instant reservedAfter) {
        Map<UUID, Committed> committed = new HashMap<>();
        if (promotionIds.isEmpty()) return committed;
        jdbc.query("SELECT promotion_id, sum(reserved) AS reserved, sum(confirmed) AS confirmed, sum(paise) AS paise FROM ("
                        + "SELECT promotion_id, count(*) AS reserved, 0 AS confirmed, sum(discount_paise) AS paise FROM adv_promotions.redemption "
                        + "WHERE status = 'RESERVED' AND promotion_id = ANY(CAST(? AS uuid[])) AND expires_at > ? GROUP BY promotion_id "
                        + "UNION ALL SELECT promotion_id, 0, count(*), sum(discount_paise) FROM adv_promotions.redemption "
                        + "WHERE status = 'CONFIRMED' AND promotion_id = ANY(CAST(? AS uuid[])) GROUP BY promotion_id) counted GROUP BY promotion_id",
                rs -> {
                    committed.put(rs.getObject("promotion_id", UUID.class), new Committed(rs.getInt("reserved"), rs.getInt("confirmed"), rs.getLong("paise")));
                }, uuids(promotionIds), Sql.ts(reservedAfter), uuids(promotionIds));
        return committed;
    }

    /** How many times the person has reserved (still counting) or used each promotion. */
    Map<UUID, Integer> personCounts(UUID person, List<UUID> promotionIds, Instant reservedAfter) {
        Map<UUID, Integer> counts = new HashMap<>();
        if (promotionIds.isEmpty()) return counts;
        jdbc.query("SELECT promotion_id, count(*) AS used FROM adv_promotions.redemption WHERE person_id = ? AND promotion_id = ANY(CAST(? AS uuid[])) "
                        + "AND (" + COUNTS + ") GROUP BY promotion_id",
                rs -> {
                    counts.put(rs.getObject("promotion_id", UUID.class), rs.getInt("used"));
                }, person, uuids(promotionIds), Sql.ts(reservedAfter));
        return counts;
    }

    Optional<PromotionRedemption> liveReservation(UUID promotionId, UUID person, Instant now) {
        return jdbc.query("SELECT " + REDEMPTION + " FROM adv_promotions.redemption WHERE promotion_id = ? AND person_id = ? AND status = 'RESERVED' "
                + "AND expires_at > ?", PromotionsRepository::redemption, promotionId, person, Sql.ts(now)).stream().findFirst();
    }

    void insertRedemption(PromotionRedemption r, Instant now) {
        jdbc.update("INSERT INTO adv_promotions.redemption (id, promotion_id, person_id, discount_paise, subtotal_paise, eligible_subtotal_paise, "
                        + "status, order_id, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                r.id(), r.promotionId(), r.personId(), r.discountPaise(), r.subtotalPaise(), r.eligibleSubtotalPaise(), r.status().name(), r.orderId(),
                Sql.ts(r.expiresAt()), Sql.ts(r.createdAt()), Sql.ts(now));
    }

    Optional<PromotionRedemption> redemption(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + REDEMPTION + " FROM adv_promotions.redemption WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                PromotionsRepository::redemption, id).stream().findFirst();
    }

    void setRedemption(UUID id, RedemptionStatus status, UUID orderId, Instant now) {
        jdbc.update("UPDATE adv_promotions.redemption SET status = ?, order_id = ?, updated_at = ? WHERE id = ?", status.name(), orderId, Sql.ts(now), id);
    }

    /** Newest first, after the cursor. */
    List<PromotionRedemption> redemptionsOfPromotion(UUID promotionId, Cursor after, int limit) {
        if (after == null) {
            return jdbc.query("SELECT " + REDEMPTION + " FROM adv_promotions.redemption WHERE promotion_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                    PromotionsRepository::redemption, promotionId, limit);
        }
        return jdbc.query("SELECT " + REDEMPTION + " FROM adv_promotions.redemption WHERE promotion_id = ? AND (created_at, id) < (?, ?) "
                + "ORDER BY created_at DESC, id DESC LIMIT ?", PromotionsRepository::redemption, promotionId, Sql.ts(after.at()), after.id(), limit);
    }

    List<PromotionRedemption> redemptionsOfPerson(UUID person) {
        return jdbc.query("SELECT " + REDEMPTION + " FROM adv_promotions.redemption WHERE person_id = ? ORDER BY created_at DESC, id",
                PromotionsRepository::redemption, person);
    }

    /** Deletes what no longer counts; the rest is unlinked from the person, so budgets and caps stay right. */
    int erase(UUID person, UUID erased, Instant reservedAfter, Instant now) {
        return jdbc.update("DELETE FROM adv_promotions.redemption WHERE person_id = ? AND NOT (" + COUNTS + ")", person, Sql.ts(reservedAfter))
                + jdbc.update("UPDATE adv_promotions.redemption SET person_id = ?, updated_at = ? WHERE person_id = ?", erased, Sql.ts(now), person);
    }

    private static Promotion promotion(ResultSet rs, int i) throws SQLException {
        NewPromotion terms = new NewPromotion(rs.getString("name"), rs.getString("title"), rs.getString("description"), rs.getString("code"),
                DiscountKind.valueOf(rs.getString("discount_kind")), rs.getObject("percent_off", Integer.class), rs.getObject("flat_paise", Long.class),
                rs.getObject("max_discount_paise", Long.class), rs.getLong("min_order_paise"), List.of((UUID[]) rs.getArray("kitchen_ids").getArray()),
                FundedBy.valueOf(rs.getString("funded_by")), rs.getInt("per_person_limit"), rs.getLong("total_budget_paise"),
                rs.getObject("max_redemptions", Integer.class), Sql.instant(rs, "starts_at"), Sql.instant(rs, "ends_at"), rs.getBoolean("listed"));
        return new Promotion(rs.getObject("id", UUID.class), terms, PromotionStatus.valueOf(rs.getString("status")), Sql.instant(rs, "activated_at"),
                rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }

    private static PromotionRedemption redemption(ResultSet rs, int i) throws SQLException {
        return new PromotionRedemption(rs.getObject("id", UUID.class), rs.getObject("promotion_id", UUID.class), rs.getObject("person_id", UUID.class),
                rs.getLong("discount_paise"), rs.getLong("subtotal_paise"), rs.getLong("eligible_subtotal_paise"),
                RedemptionStatus.valueOf(rs.getString("status")), rs.getObject("order_id", UUID.class), Sql.instant(rs, "expires_at"),
                Sql.instant(rs, "created_at"));
    }

    private static String[] uuids(List<UUID> ids) {
        return ids.stream().map(UUID::toString).toArray(String[]::new);
    }
}

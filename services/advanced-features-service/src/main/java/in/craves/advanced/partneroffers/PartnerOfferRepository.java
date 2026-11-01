package in.craves.advanced.partneroffers;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferAdminView;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferClaimView;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferDraft;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferStatus;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class PartnerOfferRepository {
    private static final String COLUMNS = "id, partner_name, title, description, terms, link_url, code, starts_at, ends_at, claim_limit, "
            + "claimed_count, status, version, created_at, updated_at";
    private static final String CLAIM = "SELECT o.id AS offer_id, o.partner_name, o.title, o.terms, o.link_url, o.code, o.ends_at, c.order_id, "
            + "c.claimed_at FROM adv_partner_offers.claim c JOIN adv_partner_offers.offer o ON o.id = c.offer_id ";
    private static final RowMapper<PartnerOfferClaimView> CLAIM_ROW = (rs, i) -> new PartnerOfferClaimView(rs.getObject("offer_id", UUID.class),
            rs.getString("partner_name"), rs.getString("title"), rs.getString("terms"), rs.getString("link_url"), rs.getString("code"),
            rs.getObject("order_id", UUID.class), Sql.instant(rs, "claimed_at"), Sql.instant(rs, "ends_at"));
    private final JdbcTemplate jdbc;

    PartnerOfferRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<PartnerOfferAdminView> all() {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_partner_offers.offer ORDER BY created_at DESC, id", PartnerOfferRepository::view);
    }

    Optional<PartnerOfferAdminView> one(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_partner_offers.offer WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                PartnerOfferRepository::view, id).stream().findFirst();
    }

    /** Active, inside its window and not sold out, plus any the person already claimed (they keep seeing what they took). */
    List<PartnerOfferAdminView> liveFor(UUID person, Instant now) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_partner_offers.offer o WHERE o.status = 'ACTIVE' AND o.starts_at <= ? AND o.ends_at > ? "
                        + "AND (o.claim_limit IS NULL OR o.claimed_count < o.claim_limit OR EXISTS (SELECT 1 FROM adv_partner_offers.claim c "
                        + "WHERE c.offer_id = o.id AND c.person_id = ?)) ORDER BY o.ends_at, o.id",
                PartnerOfferRepository::view, Sql.ts(now), Sql.ts(now), person);
    }

    Set<UUID> claimedOfferIds(UUID person) {
        return Set.copyOf(jdbc.queryForList("SELECT offer_id FROM adv_partner_offers.claim WHERE person_id = ?", UUID.class, person));
    }

    void insert(UUID id, PartnerOfferDraft draft, UUID staff, Instant now) {
        jdbc.update("INSERT INTO adv_partner_offers.offer (id, partner_name, title, description, terms, link_url, code, starts_at, ends_at, "
                        + "claim_limit, status, version, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT',1,?,?,?,?)",
                id, draft.partnerName().strip(), draft.title().strip(), draft.description().strip(), draft.terms().strip(), draft.linkUrl(),
                draft.code(), Sql.ts(draft.startsAt()), Sql.ts(draft.endsAt()), draft.claimLimit(), staff, staff, Sql.ts(now), Sql.ts(now));
    }

    void update(UUID id, PartnerOfferDraft draft, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_partner_offers.offer SET partner_name = ?, title = ?, description = ?, terms = ?, link_url = ?, code = ?, "
                        + "starts_at = ?, ends_at = ?, claim_limit = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?",
                draft.partnerName().strip(), draft.title().strip(), draft.description().strip(), draft.terms().strip(), draft.linkUrl(),
                draft.code(), Sql.ts(draft.startsAt()), Sql.ts(draft.endsAt()), draft.claimLimit(), staff, Sql.ts(now), id);
    }

    void status(UUID id, PartnerOfferStatus status, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_partner_offers.offer SET status = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?",
                status.name(), staff, Sql.ts(now), id);
    }

    /** Serialises one person's claims with the erase of their data. */
    void lockPerson(UUID person) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "adv_partner_offers:" + person);
    }

    Optional<PartnerOfferClaimView> claim(UUID person, UUID offerId) {
        return jdbc.query(CLAIM + "WHERE c.person_id = ? AND c.offer_id = ?", CLAIM_ROW, person, offerId).stream().findFirst();
    }

    /** Called under the offer's row lock, so the limit is never passed. */
    void insertClaim(UUID person, UUID offerId, UUID orderId, Instant now) {
        jdbc.update("INSERT INTO adv_partner_offers.claim (id, offer_id, person_id, order_id, claimed_at) VALUES (?,?,?,?,?)",
                UUID.randomUUID(), offerId, person, orderId, Sql.ts(now));
        jdbc.update("UPDATE adv_partner_offers.offer SET claimed_count = claimed_count + 1 WHERE id = ?", offerId);
    }

    List<PartnerOfferClaimView> claimsOf(UUID person) {
        return jdbc.query(CLAIM + "WHERE c.person_id = ? ORDER BY c.claimed_at DESC, c.id", CLAIM_ROW, person);
    }

    int deleteClaimsOf(UUID person) {
        return jdbc.update("DELETE FROM adv_partner_offers.claim WHERE person_id = ?", person);
    }

    private static PartnerOfferAdminView view(ResultSet rs, int i) throws SQLException {
        return new PartnerOfferAdminView(rs.getObject("id", UUID.class), rs.getString("partner_name"), rs.getString("title"),
                rs.getString("description"), rs.getString("terms"), rs.getString("link_url"), rs.getString("code"), Sql.instant(rs, "starts_at"),
                Sql.instant(rs, "ends_at"), (Integer) rs.getObject("claim_limit"), rs.getInt("claimed_count"),
                PartnerOfferStatus.valueOf(rs.getString("status")), rs.getLong("version"), Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"));
    }
}

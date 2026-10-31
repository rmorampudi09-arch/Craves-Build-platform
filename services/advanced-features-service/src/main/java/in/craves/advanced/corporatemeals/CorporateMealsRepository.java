package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.ChargeStatus;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyRole;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatus;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTerms;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.MealKind;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class CorporateMealsRepository {
    record Company(UUID id, String name, int seatLimit, CompanyStatus status, CompanyTerms terms, long version, Instant updatedAt) { }

    record Member(UUID personId, UUID companyId, CompanyRole role, String displayName, Instant joinedAt) { }

    record Invite(UUID id, UUID companyId, int maxUses, int uses, Instant expiresAt, Instant revokedAt, Instant createdAt) { }

    record Charge(UUID id, UUID companyId, UUID personId, MealKind kind, Integer headcount, LocalDate indiaDate, long subtotalPaise,
                  long sharePaise, ChargeStatus status, UUID orderId, Instant expiresAt, Instant createdAt) { }

    record StatementRow(UUID personId, String displayName, int meals, int teamMeals, long subtotalPaise, long sharePaise) { }

    private static final String COMPANY = "id, name, seat_limit, status, share_percent, max_per_meal_paise, meals_per_day, meal_days, window_start, "
            + "window_end, monthly_budget_paise, member_monthly_cap_paise, payment_terms_days, terms_set_at, version, updated_at";
    private static final String MEMBER = "person_id, company_id, role, display_name, joined_at";
    private static final String INVITE = "id, company_id, max_uses, uses, expires_at, revoked_at, created_at";
    private static final String CHARGE = "id, company_id, person_id, kind, headcount, india_date, subtotal_paise, company_share_paise, status, "
            + "order_id, expires_at, created_at";
    /** Charges that count against budgets and limits; the parameter is the instant reservations must expire after. */
    private static final String COUNTS = "(status = 'CONFIRMED' OR (status = 'RESERVED' AND expires_at > ?))";
    private final JdbcTemplate jdbc;

    CorporateMealsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void insertCompany(UUID id, String name, int seatLimit, UUID actor, Instant now) {
        jdbc.update("INSERT INTO adv_corporate_meals.company (id, name, seat_limit, status, version, created_by, updated_by, created_at, updated_at) "
                + "VALUES (?,?,?,'ACTIVE',1,?,?,?,?)", id, name, seatLimit, actor, actor, Sql.ts(now), Sql.ts(now));
    }

    void updateCompany(UUID id, String name, int seatLimit, CompanyStatus status, UUID actor, Instant now) {
        jdbc.update("UPDATE adv_corporate_meals.company SET name = ?, seat_limit = ?, status = ?, version = version + 1, updated_by = ?, updated_at = ? "
                + "WHERE id = ?", name, seatLimit, status.name(), actor, Sql.ts(now), id);
    }

    void setTerms(UUID id, CompanyTerms t, UUID actor, Instant now) {
        jdbc.update("UPDATE adv_corporate_meals.company SET share_percent = ?, max_per_meal_paise = ?, meals_per_day = ?, meal_days = CAST(? AS text[]), "
                        + "window_start = ?, window_end = ?, monthly_budget_paise = ?, member_monthly_cap_paise = ?, payment_terms_days = ?, "
                        + "terms_set_at = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?",
                t.sharePercent(), t.maxPerMealPaise(), t.mealsPerDay(), t.mealDays().stream().sorted().map(Enum::name).toArray(String[]::new),
                t.windowStart(), t.windowEnd(), t.monthlyBudgetPaise(), t.memberMonthlyCapPaise(), t.paymentTermsDays(), Sql.ts(now), actor,
                Sql.ts(now), id);
    }

    Optional<Company> company(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COMPANY + " FROM adv_corporate_meals.company WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                CorporateMealsRepository::company, id).stream().findFirst();
    }

    List<Company> companies() {
        return jdbc.query("SELECT " + COMPANY + " FROM adv_corporate_meals.company ORDER BY created_at DESC, id", CorporateMealsRepository::company);
    }

    Map<UUID, Integer> memberCounts() {
        Map<UUID, Integer> counts = new HashMap<>();
        jdbc.query("SELECT company_id, count(*) AS members FROM adv_corporate_meals.member GROUP BY company_id",
                rs -> {
                    counts.put(rs.getObject("company_id", UUID.class), rs.getInt("members"));
                });
        return counts;
    }

    int memberCount(UUID companyId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_corporate_meals.member WHERE company_id = ?", Integer.class, companyId);
        return count == null ? 0 : count;
    }

    Optional<Member> member(UUID person) {
        return jdbc.query("SELECT " + MEMBER + " FROM adv_corporate_meals.member WHERE person_id = ?", CorporateMealsRepository::member, person)
                .stream().findFirst();
    }

    void insertMember(Member m) {
        jdbc.update("INSERT INTO adv_corporate_meals.member (person_id, company_id, role, display_name, joined_at) VALUES (?,?,?,?,?)",
                m.personId(), m.companyId(), m.role().name(), m.displayName(), Sql.ts(m.joinedAt()));
    }

    void updateMember(UUID person, CompanyRole role, String displayName) {
        jdbc.update("UPDATE adv_corporate_meals.member SET role = ?, display_name = ? WHERE person_id = ?", role.name(), displayName, person);
    }

    int deleteMember(UUID person) {
        return jdbc.update("DELETE FROM adv_corporate_meals.member WHERE person_id = ?", person);
    }

    /** In joining order, after the (joinedAt, personId) position when one is given. */
    List<Member> members(UUID companyId, Instant afterJoined, UUID afterPerson, int limit) {
        if (afterJoined == null) {
            return jdbc.query("SELECT " + MEMBER + " FROM adv_corporate_meals.member WHERE company_id = ? ORDER BY joined_at, person_id LIMIT ?",
                    CorporateMealsRepository::member, companyId, limit);
        }
        return jdbc.query("SELECT " + MEMBER + " FROM adv_corporate_meals.member WHERE company_id = ? AND (joined_at, person_id) > (?, ?) "
                + "ORDER BY joined_at, person_id LIMIT ?", CorporateMealsRepository::member, companyId, Sql.ts(afterJoined), afterPerson, limit);
    }

    void insertInvite(UUID id, UUID companyId, String codeHash, int maxUses, Instant expiresAt, UUID actor, Instant now) {
        jdbc.update("INSERT INTO adv_corporate_meals.invite (id, company_id, code_hash, max_uses, uses, expires_at, created_by, created_at) "
                + "VALUES (?,?,?,?,0,?,?,?)", id, companyId, codeHash, maxUses, Sql.ts(expiresAt), actor, Sql.ts(now));
    }

    Optional<Invite> inviteByHash(String codeHash) {
        return jdbc.query("SELECT " + INVITE + " FROM adv_corporate_meals.invite WHERE code_hash = ?", CorporateMealsRepository::invite, codeHash)
                .stream().findFirst();
    }

    List<Invite> invites(UUID companyId, int limit) {
        return jdbc.query("SELECT " + INVITE + " FROM adv_corporate_meals.invite WHERE company_id = ? ORDER BY created_at DESC, id LIMIT ?",
                CorporateMealsRepository::invite, companyId, limit);
    }

    int liveInvites(UUID companyId, Instant now) {
        Integer live = jdbc.queryForObject("SELECT count(*) FROM adv_corporate_meals.invite WHERE company_id = ? AND revoked_at IS NULL "
                + "AND expires_at > ? AND uses < max_uses", Integer.class, companyId, Sql.ts(now));
        return live == null ? 0 : live;
    }

    void useInvite(UUID id) {
        jdbc.update("UPDATE adv_corporate_meals.invite SET uses = uses + 1 WHERE id = ?", id);
    }

    int revokeInvite(UUID id, UUID companyId, Instant now) {
        return jdbc.update("UPDATE adv_corporate_meals.invite SET revoked_at = coalesce(revoked_at, ?) WHERE id = ? AND company_id = ?",
                Sql.ts(now), id, companyId);
    }

    void insertCharge(Charge c, String memberName, Instant now) {
        jdbc.update("INSERT INTO adv_corporate_meals.charge (id, company_id, person_id, member_name, kind, headcount, india_date, subtotal_paise, "
                        + "company_share_paise, status, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                c.id(), c.companyId(), c.personId(), memberName, c.kind().name(), c.headcount(), c.indiaDate(), c.subtotalPaise(), c.sharePaise(),
                c.status().name(), Sql.ts(c.expiresAt()), Sql.ts(c.createdAt()), Sql.ts(now));
    }

    Optional<Charge> charge(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + CHARGE + " FROM adv_corporate_meals.charge WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                CorporateMealsRepository::charge, id).stream().findFirst();
    }

    void setCharge(UUID id, ChargeStatus status, UUID orderId, Instant now) {
        jdbc.update("UPDATE adv_corporate_meals.charge SET status = ?, order_id = ?, updated_at = ? WHERE id = ?", status.name(), orderId, Sql.ts(now), id);
    }

    Optional<Charge> liveReservation(UUID companyId, UUID person, Instant now) {
        return jdbc.query("SELECT " + CHARGE + " FROM adv_corporate_meals.charge WHERE company_id = ? AND person_id = ? AND status = 'RESERVED' "
                + "AND expires_at > ? LIMIT 1", CorporateMealsRepository::charge, companyId, person, Sql.ts(now)).stream().findFirst();
    }

    /** Company share confirmed or reserved (still counting) per company for India dates from..to; companyId null: every company. */
    Map<UUID, Long> committed(UUID companyId, LocalDate from, LocalDate to, Instant reservedAfter) {
        Map<UUID, Long> committed = new HashMap<>();
        jdbc.query("SELECT company_id, sum(company_share_paise) AS paise FROM adv_corporate_meals.charge WHERE (CAST(? AS uuid) IS NULL OR company_id = ?) "
                        + "AND india_date BETWEEN ? AND ? AND status IN ('RESERVED', 'CONFIRMED') AND " + COUNTS + " GROUP BY company_id",
                rs -> {
                    committed.put(rs.getObject("company_id", UUID.class), rs.getLong("paise"));
                }, companyId, companyId, from, to, Sql.ts(reservedAfter));
        return committed;
    }

    /** A member's own meals (team meals excluded) still counting on a day, and their company share over from..to. */
    int mealsOn(UUID companyId, UUID person, LocalDate day, Instant reservedAfter) {
        Integer meals = jdbc.queryForObject("SELECT count(*) FROM adv_corporate_meals.charge WHERE company_id = ? AND person_id = ? AND kind = 'MEAL' "
                + "AND india_date = ? AND " + COUNTS, Integer.class, companyId, person, day, Sql.ts(reservedAfter));
        return meals == null ? 0 : meals;
    }

    long memberCommitted(UUID companyId, UUID person, LocalDate from, LocalDate to, Instant reservedAfter) {
        Long paise = jdbc.queryForObject("SELECT coalesce(sum(company_share_paise), 0) FROM adv_corporate_meals.charge WHERE company_id = ? "
                        + "AND person_id = ? AND kind = 'MEAL' AND india_date BETWEEN ? AND ? AND " + COUNTS,
                Long.class, companyId, person, from, to, Sql.ts(reservedAfter));
        return paise == null ? 0 : paise;
    }

    /** Confirmed charges of India dates from..to, one row per person (the newest name they charged under). */
    List<StatementRow> statement(UUID companyId, LocalDate from, LocalDate to) {
        return jdbc.query("SELECT person_id, (array_agg(member_name ORDER BY created_at DESC))[1] AS display_name, "
                        + "count(*) FILTER (WHERE kind = 'MEAL') AS meals, count(*) FILTER (WHERE kind = 'TEAM_MEAL') AS team_meals, "
                        + "sum(subtotal_paise) AS subtotal, sum(company_share_paise) AS share FROM adv_corporate_meals.charge "
                        + "WHERE company_id = ? AND status = 'CONFIRMED' AND india_date BETWEEN ? AND ? GROUP BY person_id ORDER BY share DESC, person_id",
                (rs, i) -> new StatementRow(rs.getObject("person_id", UUID.class), rs.getString("display_name"), rs.getInt("meals"),
                        rs.getInt("team_meals"), rs.getLong("subtotal"), rs.getLong("share")), companyId, from, to);
    }

    List<Charge> chargesOf(UUID person) {
        return jdbc.query("SELECT " + CHARGE + " FROM adv_corporate_meals.charge WHERE person_id = ? ORDER BY created_at DESC, id",
                CorporateMealsRepository::charge, person);
    }

    /** Deletes the person's charges that no longer count; the rest are unlinked from them, so budgets and statements stay right. */
    int eraseCharges(UUID person, UUID erased, Instant reservedAfter, Instant now) {
        return jdbc.update("DELETE FROM adv_corporate_meals.charge WHERE person_id = ? AND NOT " + COUNTS, person, Sql.ts(reservedAfter))
                + jdbc.update("UPDATE adv_corporate_meals.charge SET person_id = ?, member_name = NULL, updated_at = ? WHERE person_id = ?",
                erased, Sql.ts(now), person);
    }

    List<String> namesOnCharges(UUID person) {
        return jdbc.queryForList("SELECT DISTINCT member_name FROM adv_corporate_meals.charge WHERE person_id = ? AND member_name IS NOT NULL "
                + "ORDER BY member_name", String.class, person);
    }

    List<UUID> invitesCreatedBy(UUID person) {
        return jdbc.queryForList("SELECT id FROM adv_corporate_meals.invite WHERE created_by = ? ORDER BY created_at", UUID.class, person);
    }

    int unlinkInvites(UUID person, UUID erased) {
        return jdbc.update("UPDATE adv_corporate_meals.invite SET created_by = ? WHERE created_by = ?", erased, person);
    }

    private static Company company(ResultSet rs, int i) throws SQLException {
        CompanyTerms terms = null;
        if (rs.getObject("terms_set_at") != null) {
            Set<DayOfWeek> days = Arrays.stream((String[]) rs.getArray("meal_days").getArray()).map(DayOfWeek::valueOf)
                    .collect(Collectors.toCollection(() -> EnumSet.noneOf(DayOfWeek.class)));
            terms = new CompanyTerms(rs.getInt("share_percent"), rs.getLong("max_per_meal_paise"), rs.getInt("meals_per_day"), days,
                    rs.getObject("window_start", LocalTime.class), rs.getObject("window_end", LocalTime.class), rs.getLong("monthly_budget_paise"),
                    rs.getObject("member_monthly_cap_paise", Long.class), rs.getInt("payment_terms_days"));
        }
        return new Company(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("seat_limit"), CompanyStatus.valueOf(rs.getString("status")),
                terms, rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }

    private static Member member(ResultSet rs, int i) throws SQLException {
        return new Member(rs.getObject("person_id", UUID.class), rs.getObject("company_id", UUID.class), CompanyRole.valueOf(rs.getString("role")),
                rs.getString("display_name"), Sql.instant(rs, "joined_at"));
    }

    private static Invite invite(ResultSet rs, int i) throws SQLException {
        return new Invite(rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class), rs.getInt("max_uses"), rs.getInt("uses"),
                Sql.instant(rs, "expires_at"), Sql.instant(rs, "revoked_at"), Sql.instant(rs, "created_at"));
    }

    private static Charge charge(ResultSet rs, int i) throws SQLException {
        return new Charge(rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class), rs.getObject("person_id", UUID.class),
                MealKind.valueOf(rs.getString("kind")), rs.getObject("headcount", Integer.class), rs.getObject("india_date", LocalDate.class),
                rs.getLong("subtotal_paise"), rs.getLong("company_share_paise"), ChargeStatus.valueOf(rs.getString("status")),
                rs.getObject("order_id", UUID.class), Sql.instant(rs, "expires_at"), Sql.instant(rs, "created_at"));
    }
}

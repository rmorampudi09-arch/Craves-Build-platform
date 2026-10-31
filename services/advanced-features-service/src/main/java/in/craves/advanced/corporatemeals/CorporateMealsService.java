package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.ChargeStatus;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyChange;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyCharge;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyInviteView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealAllowance;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealCart;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealItem;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealQuote;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberPage;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberRole;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMembership;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyRole;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatement;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatementLine;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatus;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTerms;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTermsChange;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.JoinCompany;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.MealKind;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.NewCompany;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.NewCompanyInvite;
import in.craves.advanced.corporatemeals.CorporateMealsRepository.Charge;
import in.craves.advanced.corporatemeals.CorporateMealsRepository.Company;
import in.craves.advanced.corporatemeals.CorporateMealsRepository.Invite;
import in.craves.advanced.corporatemeals.CorporateMealsRepository.Member;
import in.craves.advanced.corporatemeals.CorporateMealsRepository.StatementRow;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Companies pay part of their people's meals on terms staff enter for them. A charge is reserved at checkout, under the
 * company's row lock so its budget and limits are never overspent, then confirmed with the order or released.
 */
@Service
public class CorporateMealsService implements PersonalDataContributor {
    static final UUID ERASED = new UUID(0, 0);
    static final Duration RESERVATION = Duration.ofMinutes(10);
    /** Reservations keep counting this long after they expire, so replicas whose clocks differ slightly never overspend a budget. */
    static final Duration EXPIRY_GRACE = Duration.ofSeconds(30);
    static final int MAX_LIVE_INVITES = 20;
    /** shortcut: managers see their newest 50 invites; add paging if companies keep more. */
    static final int INVITE_LIST_LIMIT = 50;
    private static final Pattern CODE = Pattern.compile("[A-Za-z0-9_-]{43}");
    private final SecureRandom random = new SecureRandom();
    private final CorporateMealsRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;

    public CorporateMealsService(CorporateMealsRepository repository, CatalogGateway catalog, Audit audit, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
    }

    // Staff

    @Transactional(readOnly = true)
    public List<CompanyView> companies() {
        Instant now = clock.instant();
        YearMonth month = YearMonth.from(CorporateMealsRules.indiaDate(now));
        Map<UUID, Long> committed = repository.committed(null, month.atDay(1), month.atEndOfMonth(), counted(now));
        Map<UUID, Integer> members = repository.memberCounts();
        return repository.companies().stream()
                .map(company -> view(company, members.getOrDefault(company.id(), 0), month, committed.getOrDefault(company.id(), 0L))).toList();
    }

    /** A new company pays for nothing until staff set its terms. */
    @Transactional
    public CompanyView createCompany(UUID staff, NewCompany request) {
        UUID id = UUID.randomUUID();
        String name = text(request.name(), "name");
        repository.insertCompany(id, name, request.seatLimit(), staff, clock.instant());
        audit.record(CorporateMealsModule.ID, staff, "COMPANY_CREATED", "company", id, Map.of("name", name, "seatLimit", request.seatLimit()));
        return companyView(id);
    }

    @Transactional
    public CompanyView updateCompany(UUID staff, UUID id, CompanyChange change) {
        String name = text(change.name(), "name");
        Company current = lockedCompany(id, change.expectedVersion());
        int members = repository.memberCount(id);
        if (change.seatLimit() < members) {
            throw new ApiProblem(409, "SEATS_BELOW_MEMBERS", "The company already has more members than that", List.of("members: " + members));
        }
        repository.updateCompany(id, name, change.seatLimit(), change.status(), staff, clock.instant());
        String action = current.status() == change.status() ? "COMPANY_UPDATED" : "COMPANY_" + change.status().name();
        audit.record(CorporateMealsModule.ID, staff, action, "company", id,
                Map.of("name", name, "seatLimit", change.seatLimit(), "status", change.status().name()));
        return companyView(id);
    }

    /** New terms apply to charges reserved from now on; confirmed charges keep their amounts. */
    @Transactional
    public CompanyView setTerms(UUID staff, UUID id, CompanyTermsChange change) {
        CompanyTerms terms = change.terms();
        if (!terms.windowStart().isBefore(terms.windowEnd())) {
            throw ApiProblem.badRequest("INVALID_MEAL_WINDOW", "windowStart must be before windowEnd; a window cannot run past midnight");
        }
        lockedCompany(id, change.expectedVersion());
        repository.setTerms(id, terms, staff, clock.instant());
        audit.record(CorporateMealsModule.ID, staff, "TERMS_SET", "company", id, Map.of("terms", terms));
        return companyView(id);
    }

    /** Adds a person to the company with a role, or changes their role and name. */
    @Transactional
    public CompanyMemberView setMember(UUID staff, UUID companyId, UUID person, CompanyMemberRole request) {
        Company company = repository.company(companyId, true).orElseThrow(CorporateMealsService::companyNotFound);
        Optional<Member> existing = repository.member(person);
        if (existing.isPresent() && !existing.get().companyId().equals(companyId)) {
            throw ApiProblem.conflict("IN_ANOTHER_COMPANY", "This person belongs to another company; they must leave it first");
        }
        String name = text(request.displayName(), "displayName");
        if (existing.isEmpty()) {
            if (repository.memberCount(companyId) >= company.seatLimit()) throw companyFull();
            insertMember(new Member(person, companyId, request.role(), name, clock.instant()));
        } else {
            repository.updateMember(person, request.role(), name);
        }
        audit.record(CorporateMealsModule.ID, staff, "MEMBER_ROLE_SET", "company", companyId, Map.of("personId", person, "role", request.role().name()));
        return memberView(repository.member(person).orElseThrow());
    }

    @Transactional(readOnly = true)
    public CompanyStatement statement(UUID companyId, String month) {
        Company company = repository.company(companyId, false).orElseThrow(CorporateMealsService::companyNotFound);
        YearMonth period = CorporateMealsRules.month(month, clock.instant());
        List<StatementRow> rows = repository.statement(companyId, period.atDay(1), period.atEndOfMonth());
        List<CompanyStatementLine> people = rows.stream()
                .map(row -> new CompanyStatementLine(row.personId(), row.displayName(), row.meals(), row.teamMeals(), row.sharePaise())).toList();
        return new CompanyStatement(companyId, company.name(), period.toString(),
                company.terms() == null ? null : CorporateMealsRules.dueDate(period, company.terms().paymentTermsDays()),
                rows.stream().mapToInt(StatementRow::meals).sum(), rows.stream().mapToInt(StatementRow::teamMeals).sum(),
                rows.stream().mapToLong(StatementRow::subtotalPaise).sum(), rows.stream().mapToLong(StatementRow::sharePaise).sum(), people);
    }

    /** Staff give a reserved or used company share back to the budget (for example a confirmation no real order backs). Audited. */
    @Transactional
    public CompanyCharge voidCharge(UUID staff, UUID chargeId, String reason) {
        String why = text(reason, "reason");
        Charge found = repository.charge(chargeId, false).orElseThrow(CorporateMealsService::chargeNotFound);
        repository.company(found.companyId(), true); // same lock order as reserve() and confirm()
        Charge charge = repository.charge(chargeId, true).orElseThrow();
        if (charge.status() == ChargeStatus.RESERVED || charge.status() == ChargeStatus.CONFIRMED) {
            repository.setCharge(chargeId, ChargeStatus.VOIDED, charge.orderId(), clock.instant());
            audit.record(CorporateMealsModule.ID, staff, "CHARGE_VOIDED", "charge", chargeId, Map.of("companyId", charge.companyId(),
                    "status", charge.status().name(), "companySharePaise", charge.sharePaise(), "reason", why));
        }
        return view(repository.charge(chargeId, false).orElseThrow());
    }

    // Company managers

    @Transactional(readOnly = true)
    public CompanyView managedCompany(UUID person) {
        return companyView(manager(person).companyId());
    }

    @Transactional(readOnly = true)
    public CompanyStatement managedStatement(UUID person, String month) {
        return statement(manager(person).companyId(), month);
    }

    @Transactional(readOnly = true)
    public CompanyMemberPage members(UUID person, String cursor, int limit) {
        Member manager = manager(person);
        Cursor position = Cursor.decode(cursor);
        List<Member> rows = repository.members(manager.companyId(), position == null ? null : position.at(), position == null ? null : position.id(),
                limit + 1);
        List<CompanyMemberView> items = rows.stream().limit(limit).map(CorporateMealsService::memberView).toList();
        String next = rows.size() > limit ? new Cursor(rows.get(limit - 1).joinedAt(), rows.get(limit - 1).personId()).encode() : null;
        return new CompanyMemberPage(items, next);
    }

    /** Managers remove members; managers themselves are changed by Craves staff. */
    @Transactional
    public void removeMember(UUID person, UUID memberId) {
        Member manager = manager(person);
        Member target = repository.member(memberId).filter(member -> member.companyId().equals(manager.companyId()))
                .orElseThrow(() -> ApiProblem.notFound("MEMBER_NOT_FOUND", "No such member"));
        if (target.role() == CompanyRole.MANAGER) throw ApiProblem.conflict("MANAGER_CHANGED_BY_STAFF", "Craves staff change a company's managers");
        repository.deleteMember(memberId);
        audit.record(CorporateMealsModule.ID, person, "MEMBER_REMOVED", "company", manager.companyId(), Map.of("personId", memberId));
    }

    /** The code is returned only here, once; only its hash is stored. */
    @Transactional
    public CompanyInviteView createInvite(UUID person, NewCompanyInvite request) {
        Company company = repository.company(manager(person).companyId(), true).orElseThrow();
        if (company.status() != CompanyStatus.ACTIVE) throw companySuspended();
        if (request.maxUses() > company.seatLimit()) throw ApiProblem.badRequest("INVALID_MAX_USES", "maxUses cannot be more than the company's seats");
        Instant now = clock.instant();
        if (repository.liveInvites(company.id(), now) >= MAX_LIVE_INVITES) {
            throw ApiProblem.conflict("TOO_MANY_INVITES", "Your company has " + MAX_LIVE_INVITES + " open invites; revoke one first");
        }
        byte[] secret = new byte[32];
        random.nextBytes(secret);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        UUID id = UUID.randomUUID();
        Instant expiresAt = now.plus(Duration.ofDays(request.expiresInDays()));
        repository.insertInvite(id, company.id(), Idempotency.sha256(code), request.maxUses(), expiresAt, person, now);
        audit.record(CorporateMealsModule.ID, person, "INVITE_CREATED", "invite", id,
                Map.of("companyId", company.id(), "maxUses", request.maxUses(), "expiresAt", expiresAt.toString()));
        return new CompanyInviteView(id, code, request.maxUses(), 0, expiresAt, false, now);
    }

    @Transactional(readOnly = true)
    public List<CompanyInviteView> invites(UUID person) {
        return repository.invites(manager(person).companyId(), INVITE_LIST_LIMIT).stream().map(CorporateMealsService::view).toList();
    }

    @Transactional
    public void revokeInvite(UUID person, UUID inviteId) {
        Member manager = manager(person);
        if (repository.revokeInvite(inviteId, manager.companyId(), clock.instant()) == 0) {
            throw ApiProblem.notFound("INVITE_NOT_FOUND", "No such invite");
        }
        audit.record(CorporateMealsModule.ID, person, "INVITE_REVOKED", "invite", inviteId, Map.of("companyId", manager.companyId()));
    }

    // Members

    /** Joining the same company again is harmless; a person belongs to one company at a time. */
    @Transactional
    public CompanyMembership join(UUID person, JoinCompany request) {
        String code = request.code().strip();
        String name = text(request.displayName(), "displayName");
        if (!CODE.matcher(code).matches()) throw inviteNotValid();
        String hash = Idempotency.sha256(code);
        Invite found = repository.inviteByHash(hash).orElseThrow(CorporateMealsService::inviteNotValid);
        Company company = repository.company(found.companyId(), true).orElseThrow(); // serialises joins: seats and invite uses
        Invite invite = repository.inviteByHash(hash).orElseThrow();
        Instant now = clock.instant();
        if (invite.revokedAt() != null || !now.isBefore(invite.expiresAt()) || invite.uses() >= invite.maxUses()
                || company.status() != CompanyStatus.ACTIVE) {
            throw inviteNotValid();
        }
        Optional<Member> existing = repository.member(person);
        if (existing.isPresent()) {
            if (existing.get().companyId().equals(company.id())) return membership(existing.get(), company, now);
            throw alreadyInACompany();
        }
        if (repository.memberCount(company.id()) >= company.seatLimit()) throw companyFull();
        insertMember(new Member(person, company.id(), CompanyRole.MEMBER, name, now));
        repository.useInvite(invite.id());
        audit.record(CorporateMealsModule.ID, person, "MEMBER_JOINED", "company", company.id(), Map.of("inviteId", invite.id()));
        return membership(repository.member(person).orElseThrow(), company, now);
    }

    @Transactional(readOnly = true)
    public CompanyMembership membership(UUID person) {
        Member member = repository.member(person).orElseThrow(CorporateMealsService::notInACompany);
        return membership(member, repository.company(member.companyId(), false).orElseThrow(), clock.instant());
    }

    @Transactional
    public void leave(UUID person) {
        repository.member(person).ifPresent(member -> {
            repository.deleteMember(person);
            audit.record(CorporateMealsModule.ID, person, "MEMBER_LEFT", "company", member.companyId(), Map.of());
        });
    }

    /** What the company would pay towards this cart now. Stores nothing. */
    @Transactional(readOnly = true)
    public CompanyMealQuote quote(UUID person, CompanyMealCart cart) {
        Member member = payer(person, cart);
        long subtotal = price(cart.items());
        Instant now = clock.instant();
        long share = share(repository.company(member.companyId(), false).orElseThrow(), member, cart, subtotal, now);
        return new CompanyMealQuote(cart.kind(), subtotal, share, subtotal - share);
    }

    /** Reserves the company's share for this checkout; budget and limits are checked and taken under the company's row lock. */
    @Transactional
    public CompanyCharge reserve(UUID person, CompanyMealCart cart) {
        UUID companyId = payer(person, cart).companyId();
        long subtotal = price(cart.items()); // asks Catalog before any row lock
        Company company = repository.company(companyId, true).orElseThrow();
        Member member = payer(person, cart); // again under the lock: the person may have left or changed role meanwhile
        if (!member.companyId().equals(companyId)) throw notInACompany();
        Instant now = clock.instant();
        Optional<Charge> live = repository.liveReservation(companyId, person, now);
        if (live.isPresent()) {
            throw new ApiProblem(409, "CHARGE_RESERVATION_EXISTS", "A company payment is already waiting for your checkout",
                    List.of(live.get().id().toString()));
        }
        long share = share(company, member, cart, subtotal, now);
        Charge charge = new Charge(UUID.randomUUID(), companyId, person, cart.kind(), cart.headcount(), CorporateMealsRules.indiaDate(now), subtotal,
                share, ChargeStatus.RESERVED, null, now.plus(RESERVATION), now);
        repository.insertCharge(charge, member.displayName(), now);
        return view(repository.charge(charge.id(), false).orElseThrow());
    }

    /** Confirms a live reservation with the order it became. Repeating it with the same order is harmless. */
    @Transactional
    public CompanyCharge confirm(UUID person, UUID chargeId, UUID orderId) {
        Charge found = own(person, chargeId, false);
        Company company = repository.company(found.companyId(), true).orElseThrow(); // same lock order as reserve()
        Charge charge = own(person, chargeId, true);
        if (charge.status() == ChargeStatus.CONFIRMED) {
            if (orderId.equals(charge.orderId())) return view(charge);
            throw ApiProblem.conflict("CHARGE_CONFIRMED", "This company payment is already used for another order");
        }
        if (charge.status() != ChargeStatus.RESERVED) throw ApiProblem.conflict("CHARGE_RELEASED", "This company payment was released");
        Instant now = clock.instant();
        if (!now.isBefore(charge.expiresAt())) throw ApiProblem.conflict("CHARGE_EXPIRED", "This company payment expired; ask for it again");
        if (company.status() != CompanyStatus.ACTIVE || repository.member(person).filter(m -> m.companyId().equals(company.id())).isEmpty()) {
            throw ApiProblem.conflict("COMPANY_NOT_PAYING", "Your company no longer pays for this order");
        }
        try {
            repository.setCharge(chargeId, ChargeStatus.CONFIRMED, orderId, now);
        } catch (DuplicateKeyException taken) {
            throw ApiProblem.conflict("ORDER_HAS_COMPANY_CHARGE", "This order already has a company payment");
        }
        return view(repository.charge(chargeId, false).orElseThrow());
    }

    @Transactional
    public void release(UUID person, UUID chargeId) {
        Charge charge = own(person, chargeId, true);
        if (charge.status() == ChargeStatus.CONFIRMED) {
            throw ApiProblem.conflict("CHARGE_CONFIRMED", "A used company payment is given back by cancelling the order");
        }
        if (charge.status() == ChargeStatus.RESERVED) repository.setCharge(chargeId, ChargeStatus.RELEASED, null, clock.instant());
    }

    @Override
    public String moduleId() {
        return CorporateMealsModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("membership", repository.member(person).map(member -> Map.of("companyId", member.companyId(), "role", member.role().name(),
                "displayName", member.displayName(), "joinedAt", member.joinedAt().toString())).orElse(null));
        export.put("charges", repository.chargesOf(person).stream().map(CorporateMealsService::view).toList());
        export.put("namesOnCharges", repository.namesOnCharges(person));
        export.put("invitesCreated", repository.invitesCreatedBy(person));
        return export;
    }

    /** Ends the membership; used company shares stay on the company's statement, without the person. */
    @Override
    public int erase(UUID person) {
        // Same lock order as reserve() and confirm(), so a reservation being made right now is erased too.
        repository.member(person).ifPresent(member -> repository.company(member.companyId(), true));
        Instant now = clock.instant();
        return repository.deleteMember(person) + repository.eraseCharges(person, ERASED, counted(now), now) + repository.unlinkInvites(person, ERASED);
    }

    private long share(Company company, Member member, CompanyMealCart cart, long subtotal, Instant now) {
        if (company.status() != CompanyStatus.ACTIVE) throw companySuspended();
        CompanyTerms terms = company.terms();
        if (terms == null) throw ApiProblem.conflict("COMPANY_TERMS_NOT_SET", "Your company's meal programme has not started yet");
        boolean team = cart.kind() == MealKind.TEAM_MEAL;
        if (team && (cart.headcount() == null || cart.headcount() > company.seatLimit())) {
            throw ApiProblem.badRequest("INVALID_HEADCOUNT", "A team meal feeds from 2 people up to the company's seats");
        }
        if (!team && cart.headcount() != null) throw ApiProblem.badRequest("HEADCOUNT_ONLY_FOR_TEAM_MEALS", "Only a team meal has a headcount");
        LocalDate today = CorporateMealsRules.indiaDate(now);
        YearMonth month = YearMonth.from(today);
        Instant after = counted(now);
        long companyCommitted = repository.committed(company.id(), month.atDay(1), month.atEndOfMonth(), after).getOrDefault(company.id(), 0L);
        int mealsToday = team ? 0 : repository.mealsOn(company.id(), member.personId(), today, after);
        long memberCommitted = team || terms.memberMonthlyCapPaise() == null ? 0
                : repository.memberCommitted(company.id(), member.personId(), month.atDay(1), month.atEndOfMonth(), after);
        return CorporateMealsRules.share(terms, cart.kind(), cart.headcount(), subtotal, mealsToday, companyCommitted, memberCommitted, now);
    }

    private long price(List<CompanyMealItem> items) {
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        items.forEach(item -> quantities.merge(item.menuItemId(), item.quantity(), Integer::sum));
        Map<UUID, MenuItem> live = catalog.purchasable(quantities.keySet());
        List<String> unavailable = quantities.keySet().stream().filter(id -> live.get(id) == null || live.get(id).pricePaise() == null)
                .map(UUID::toString).toList();
        if (!unavailable.isEmpty()) throw new ApiProblem(409, "ITEMS_UNAVAILABLE", "Some dishes cannot be bought right now", unavailable);
        long subtotal = 0;
        for (Map.Entry<UUID, Integer> line : quantities.entrySet()) {
            subtotal = Math.addExact(subtotal, Math.multiplyExact(live.get(line.getKey()).pricePaise().longValue(), line.getValue().longValue()));
        }
        return subtotal;
    }

    private CompanyMembership membership(Member member, Company company, Instant now) {
        CompanyTerms terms = company.terms();
        if (terms == null) {
            return new CompanyMembership(company.id(), company.name(), member.role(), member.displayName(), member.joinedAt(), null, false, 0, null);
        }
        LocalDate today = CorporateMealsRules.indiaDate(now);
        YearMonth month = YearMonth.from(today);
        int mealsLeft = Math.max(0, terms.mealsPerDay() - repository.mealsOn(company.id(), member.personId(), today, counted(now)));
        Long monthLeft = terms.memberMonthlyCapPaise() == null ? null : Math.max(0, terms.memberMonthlyCapPaise()
                - repository.memberCommitted(company.id(), member.personId(), month.atDay(1), month.atEndOfMonth(), counted(now)));
        CompanyMealAllowance allowance = new CompanyMealAllowance(terms.sharePercent(), terms.maxPerMealPaise(), terms.mealsPerDay(), terms.mealDays(),
                terms.windowStart(), terms.windowEnd(), terms.memberMonthlyCapPaise());
        return new CompanyMembership(company.id(), company.name(), member.role(), member.displayName(), member.joinedAt(), allowance,
                company.status() == CompanyStatus.ACTIVE && CorporateMealsRules.paysAt(terms, now), mealsLeft, monthLeft);
    }

    private Member payer(UUID person, CompanyMealCart cart) {
        Member member = repository.member(person).orElseThrow(CorporateMealsService::notInACompany);
        if (cart.kind() == MealKind.TEAM_MEAL && member.role() != CompanyRole.MANAGER) {
            throw ApiProblem.forbidden("TEAM_MEALS_ARE_FOR_MANAGERS", "Only your company's meal managers can order team meals");
        }
        return member;
    }

    private Member manager(UUID person) {
        return repository.member(person).filter(member -> member.role() == CompanyRole.MANAGER)
                .orElseThrow(() -> ApiProblem.forbidden("NOT_A_COMPANY_MANAGER", "Only your company's meal managers can do this"));
    }

    private Charge own(UUID person, UUID chargeId, boolean forUpdate) {
        // Another person's charge answers like a missing one, so charge ids reveal nothing.
        return repository.charge(chargeId, forUpdate).filter(charge -> charge.personId().equals(person))
                .orElseThrow(CorporateMealsService::chargeNotFound);
    }

    private Company lockedCompany(UUID id, long expectedVersion) {
        Company company = repository.company(id, true).orElseThrow(CorporateMealsService::companyNotFound);
        if (company.version() != expectedVersion) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "This company changed since you loaded it; reload and try again");
        }
        return company;
    }

    private void insertMember(Member member) {
        try {
            repository.insertMember(member);
        } catch (DuplicateKeyException raced) {
            throw alreadyInACompany();
        }
    }

    private CompanyView companyView(UUID id) {
        Company company = repository.company(id, false).orElseThrow(CorporateMealsService::companyNotFound);
        Instant now = clock.instant();
        YearMonth month = YearMonth.from(CorporateMealsRules.indiaDate(now));
        long committed = repository.committed(id, month.atDay(1), month.atEndOfMonth(), counted(now)).getOrDefault(id, 0L);
        return view(company, repository.memberCount(id), month, committed);
    }

    private static CompanyView view(Company company, int members, YearMonth month, long committed) {
        return new CompanyView(company.id(), company.name(), company.seatLimit(), members, company.status(), company.terms(), company.version(),
                company.updatedAt(), month.toString(), committed);
    }

    private static CompanyCharge view(Charge charge) {
        return new CompanyCharge(charge.id(), charge.companyId(), charge.kind(), charge.headcount(), charge.indiaDate(), charge.subtotalPaise(),
                charge.sharePaise(), charge.subtotalPaise() - charge.sharePaise(), charge.status(), charge.orderId(), charge.expiresAt(),
                charge.createdAt());
    }

    private static CompanyInviteView view(Invite invite) {
        return new CompanyInviteView(invite.id(), null, invite.maxUses(), invite.uses(), invite.expiresAt(), invite.revokedAt() != null,
                invite.createdAt());
    }

    private static CompanyMemberView memberView(Member member) {
        return new CompanyMemberView(member.personId(), member.displayName(), member.role(), member.joinedAt());
    }

    private static Instant counted(Instant now) {
        return now.minus(EXPIRY_GRACE);
    }

    /** Trimmed with inner spaces collapsed; text that is blank after that (for example only Unicode spaces) is refused. */
    private static String text(String value, String field) {
        String tidy = value.strip().replaceAll("\\s+", " ");
        if (tidy.isEmpty()) throw ApiProblem.badRequest("BLANK_TEXT", field + " cannot be blank");
        return tidy;
    }

    private static ApiProblem companyNotFound() {
        return ApiProblem.notFound("COMPANY_NOT_FOUND", "No such company");
    }

    private static ApiProblem chargeNotFound() {
        return ApiProblem.notFound("CHARGE_NOT_FOUND", "No such company payment");
    }

    private static ApiProblem notInACompany() {
        return ApiProblem.notFound("NOT_IN_A_COMPANY", "You are not part of a company meal programme");
    }

    private static ApiProblem alreadyInACompany() {
        return ApiProblem.conflict("ALREADY_IN_A_COMPANY", "Leave your current company before joining another");
    }

    private static ApiProblem inviteNotValid() {
        return ApiProblem.notFound("INVITE_NOT_VALID", "This invite is not valid; ask your company for a new one");
    }

    private static ApiProblem companyFull() {
        return ApiProblem.conflict("COMPANY_FULL", "Your company has no free seats; ask its manager");
    }

    private static ApiProblem companySuspended() {
        return ApiProblem.conflict("COMPANY_SUSPENDED", "This company's meal programme is paused");
    }
}

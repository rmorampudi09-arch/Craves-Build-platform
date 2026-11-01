package in.craves.advanced.corporatemeals;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class CorporateMealsDtos {
    private CorporateMealsDtos() { }

    public enum CompanyStatus { ACTIVE, SUSPENDED }

    public enum CompanyRole { MEMBER, MANAGER }

    public enum MealKind { MEAL, TEAM_MEAL }

    public enum ChargeStatus { RESERVED, CONFIRMED, RELEASED, VOIDED }

    /** Staff create a company; it pays for nothing until staff set its terms. seatLimit counts managers too. */
    public record NewCompany(@NotBlank @Size(max = 120) String name, @NotNull @Min(1) @Max(100_000) Integer seatLimit) { }

    public record CompanyChange(@NotBlank @Size(max = 120) String name, @NotNull @Min(1) @Max(100_000) Integer seatLimit,
                                @NotNull CompanyStatus status, @NotNull Long expectedVersion) { }

    /**
     * The company's billing terms and meal subsidy as agreed with the company and entered by staff; nothing has a default.
     * The company pays sharePercent of a meal (whole paise, rounded down), at most maxPerMealPaise (a team meal: that times its
     * headcount), on mealDays from windowStart to windowEnd India time (the order's time), at most mealsPerDay meals per member
     * per India day, within monthlyBudgetPaise per India month and memberMonthlyCapPaise per member when set.
     * paymentTermsDays: days after a month ends that its statement is due.
     */
    public record CompanyTerms(@NotNull @Min(1) @Max(100) Integer sharePercent,
                               @NotNull @Min(1) @Max(10_000_000) Long maxPerMealPaise,
                               @NotNull @Min(1) @Max(5) Integer mealsPerDay,
                               @NotEmpty Set<@NotNull DayOfWeek> mealDays,
                               @NotNull LocalTime windowStart,
                               @NotNull LocalTime windowEnd,
                               @NotNull @Min(1) Long monthlyBudgetPaise,
                               @Min(1) Long memberMonthlyCapPaise,
                               @NotNull @Min(0) @Max(120) Integer paymentTermsDays) { }

    public record CompanyTermsChange(@NotNull @Valid CompanyTerms terms, @NotNull Long expectedVersion) { }

    /** Staff and manager view. terms is null until staff set them; month is the current India month (YYYY-MM). */
    public record CompanyView(UUID id, String name, int seatLimit, int members, CompanyStatus status, CompanyTerms terms, long version,
                              Instant updatedAt, String month, long monthCommittedPaise) { }

    /** Staff add a person to a company or change their role (managers run invites, members and statements). */
    public record CompanyMemberRole(@NotNull CompanyRole role, @NotBlank @Size(max = 60) String displayName) { }

    public record CompanyMemberView(UUID personId, String displayName, CompanyRole role, Instant joinedAt) { }

    public record CompanyMemberPage(List<CompanyMemberView> items, String nextCursor) { }

    /** maxUses: how many people may join with the code (at most the seat limit). */
    public record NewCompanyInvite(@NotNull @Min(1) @Max(30) Integer expiresInDays, @NotNull @Min(1) @Max(100_000) Integer maxUses) { }

    /** code is returned only once, when the invite is created; it is stored only as a hash. */
    public record CompanyInviteView(UUID id, String code, int maxUses, int uses, Instant expiresAt, boolean revoked, Instant createdAt) { }

    /** displayName: how the person appears to their company's managers and on its statement. */
    public record JoinCompany(@NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 60) String displayName) { }

    /** What a member sees of the terms: never the company's budget or payment terms. */
    public record CompanyMealAllowance(int sharePercent, long maxPerMealPaise, int mealsPerDay, Set<DayOfWeek> mealDays, LocalTime windowStart,
                                       LocalTime windowEnd, Long memberMonthlyCapPaise) { }

    /** allowance is null until staff set the company's terms; payingNow: the company pays for a meal ordered right now. */
    public record CompanyMembership(UUID companyId, String companyName, CompanyRole role, String displayName, Instant joinedAt,
                                    CompanyMealAllowance allowance, boolean payingNow, int mealsLeftToday, Long monthLeftPaise) { }

    public record CompanyMealItem(@NotNull UUID menuItemId, @NotNull @Min(1) @Max(100) Integer quantity) { }

    /** A TEAM_MEAL (managers only) feeds headcount people, from 2 up to the company's seat limit; a MEAL has no headcount. */
    public record CompanyMealCart(@NotNull MealKind kind, @Min(2) @Max(100_000) Integer headcount,
                                  @NotEmpty @Size(max = 50) List<@NotNull @Valid CompanyMealItem> items) { }

    /** Prices are the dishes' live Catalog prices (option add-ons are not counted); order-service stays the authority for the total. */
    public record CompanyMealQuote(MealKind kind, long subtotalPaise, long companySharePaise, long memberSharePaise) { }

    /** status RESERVED with expiresAt in the past means the reservation lapsed and no longer counts. */
    public record CompanyCharge(UUID id, UUID companyId, MealKind kind, Integer headcount, LocalDate indiaDate, long subtotalPaise,
                                long companySharePaise, long memberSharePaise, ChargeStatus status, UUID orderId, Instant expiresAt,
                                Instant createdAt) { }

    public record CompanyChargeConfirm(@NotNull UUID orderId) { }

    public record CompanyChargeVoid(@NotBlank @Size(max = 300) String reason) { }

    /** Confirmed charges of one India month. dueDate: the month's last day plus the payment terms (null until terms are set). */
    public record CompanyStatement(UUID companyId, String companyName, String month, LocalDate dueDate, int meals, int teamMeals,
                                   long subtotalPaise, long companySharePaise, List<CompanyStatementLine> people) { }

    /** personId is the nil UUID for people who erased their data; their amounts stay on the statement. */
    public record CompanyStatementLine(UUID personId, String displayName, int meals, int teamMeals, long companySharePaise) { }
}

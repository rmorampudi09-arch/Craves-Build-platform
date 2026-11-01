package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTerms;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.MealKind;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.stream.Collectors;

/** Pure subsidy rules, kept apart from the database so they are unit-tested directly. */
final class CorporateMealsRules {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private CorporateMealsRules() { }

    /** Whole paise rounded down, never above the cap or the meal itself, so a company never pays more than it agreed to. */
    static long companyShare(long subtotalPaise, int sharePercent, long capPaise) {
        return Math.min(Math.min(Math.multiplyExact(subtotalPaise, (long) sharePercent) / 100, capPaise), subtotalPaise);
    }

    /** One of the company's meal days, from windowStart up to (not including) windowEnd, India time. */
    static boolean paysAt(CompanyTerms terms, Instant at) {
        ZonedDateTime local = at.atZone(INDIA);
        LocalTime time = local.toLocalTime();
        return terms.mealDays().contains(local.getDayOfWeek()) && !time.isBefore(terms.windowStart()) && time.isBefore(terms.windowEnd());
    }

    /**
     * What the company pays towards this order, trimmed to what is left of its monthly budget (and of the member's monthly cap
     * for a member's own meal), or the refusal as an ApiProblem. A team meal counts only against the company's budget.
     */
    static long share(CompanyTerms terms, MealKind kind, Integer headcount, long subtotalPaise, int mealsToday, long companyCommittedPaise,
                      long memberCommittedPaise, Instant at) {
        if (!paysAt(terms, at)) {
            throw new ApiProblem(422, "OUTSIDE_MEAL_HOURS", "Your company pays only for meals ordered on its meal days and hours",
                    List.of("mealDays: " + terms.mealDays().stream().sorted().map(Enum::name).collect(Collectors.joining(",")),
                            "window: " + terms.windowStart() + "-" + terms.windowEnd() + " India time"));
        }
        boolean team = kind == MealKind.TEAM_MEAL;
        long cap = team ? Math.multiplyExact(terms.maxPerMealPaise().longValue(), headcount.longValue()) : terms.maxPerMealPaise();
        long share = companyShare(subtotalPaise, terms.sharePercent(), cap);
        if (share <= 0) throw ApiProblem.unprocessable("MEAL_TOO_SMALL", "This order is too small for your company to pay a share of it");
        if (!team && mealsToday >= terms.mealsPerDay()) {
            throw ApiProblem.conflict("DAILY_MEALS_USED", "Your company already paid for your meals today");
        }
        long budgetLeft = terms.monthlyBudgetPaise() - companyCommittedPaise;
        if (budgetLeft <= 0) throw ApiProblem.conflict("COMPANY_BUDGET_USED", "Your company's meal budget for this month is used up");
        share = Math.min(share, budgetLeft);
        if (!team && terms.memberMonthlyCapPaise() != null) {
            long memberLeft = terms.memberMonthlyCapPaise() - memberCommittedPaise;
            if (memberLeft <= 0) throw ApiProblem.conflict("MONTHLY_ALLOWANCE_USED", "You have used this month's meal allowance");
            share = Math.min(share, memberLeft);
        }
        return share;
    }

    static LocalDate indiaDate(Instant at) {
        return at.atZone(INDIA).toLocalDate();
    }

    /** YYYY-MM; blank means the current India month. */
    static YearMonth month(String value, Instant now) {
        if (value == null || value.isBlank()) return YearMonth.from(indiaDate(now));
        try {
            return YearMonth.parse(value.strip());
        } catch (DateTimeParseException ex) {
            throw ApiProblem.badRequest("INVALID_MONTH", "month must look like 2026-11");
        }
    }

    static LocalDate dueDate(YearMonth month, int paymentTermsDays) {
        return month.atEndOfMonth().plusDays(paymentTermsDays);
    }
}

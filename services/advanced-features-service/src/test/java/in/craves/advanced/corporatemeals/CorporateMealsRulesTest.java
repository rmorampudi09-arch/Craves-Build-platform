package in.craves.advanced.corporatemeals;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTerms;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.MealKind;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.EnumSet;
import java.util.function.LongSupplier;
import org.junit.jupiter.api.Test;

class CorporateMealsRulesTest {
    // 2 Nov 2026 is a Monday: 07:30 UTC is 13:00 in India.
    static final Instant MONDAY_LUNCH = Instant.parse("2026-11-02T07:30:00Z");
    static final CompanyTerms TERMS = new CompanyTerms(50, 15_000L, 1, EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY), LocalTime.of(11, 0),
            LocalTime.of(15, 0), 100_000L, 20_000L, 30);

    static String outcome(LongSupplier share) {
        try {
            return String.valueOf(share.getAsLong());
        } catch (ApiProblem problem) {
            return problem.code();
        }
    }

    @Test
    void theCompanyShareRoundsDownAndNeverExceedsTheCapOrTheMeal() {
        assertThat(CorporateMealsRules.companyShare(33_333, 50, 100_000)).isEqualTo(16_666);
        assertThat(CorporateMealsRules.companyShare(32_000, 50, 15_000)).isEqualTo(15_000);
        assertThat(CorporateMealsRules.companyShare(9_000, 100, 15_000)).isEqualTo(9_000);
        assertThat(CorporateMealsRules.companyShare(1, 50, 15_000)).isZero();
    }

    @Test
    void companiesPayOnTheirMealDaysInsideTheWindowIndiaTime() {
        assertThat(CorporateMealsRules.paysAt(TERMS, MONDAY_LUNCH)).isTrue();
        assertThat(CorporateMealsRules.paysAt(TERMS, Instant.parse("2026-11-02T05:30:00Z"))).isTrue(); // 11:00 sharp
        assertThat(CorporateMealsRules.paysAt(TERMS, Instant.parse("2026-11-02T09:30:00Z"))).isFalse(); // 15:00 is the end
        assertThat(CorporateMealsRules.paysAt(TERMS, Instant.parse("2026-11-01T07:30:00Z"))).isFalse(); // Sunday
        assertThat(CorporateMealsRules.indiaDate(Instant.parse("2026-11-01T19:00:00Z"))).isEqualTo(LocalDate.of(2026, 11, 2));
    }

    @Test
    void theShareIsTrimmedToWhatIsLeftOrRefusedWithTheReason() {
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 0, 0, MONDAY_LUNCH))).isEqualTo("15000");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 0, 15_000, MONDAY_LUNCH))).isEqualTo("5000");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 92_000, 0, MONDAY_LUNCH))).isEqualTo("8000");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 0, 0, Instant.parse("2026-11-02T10:00:00Z"))))
                .isEqualTo("OUTSIDE_MEAL_HOURS");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 1, 0, 0, 0, MONDAY_LUNCH))).isEqualTo("MEAL_TOO_SMALL");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 1, 0, 0, MONDAY_LUNCH))).isEqualTo("DAILY_MEALS_USED");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 100_000, 0, MONDAY_LUNCH)))
                .isEqualTo("COMPANY_BUDGET_USED");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.MEAL, null, 32_000, 0, 0, 20_000, MONDAY_LUNCH)))
                .isEqualTo("MONTHLY_ALLOWANCE_USED");
    }

    @Test
    void teamMealsScaleWithHeadcountAndCountOnlyAgainstTheBudget() {
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.TEAM_MEAL, 4, 200_000, 1, 0, 20_000, MONDAY_LUNCH))).isEqualTo("60000");
        assertThat(outcome(() -> CorporateMealsRules.share(TERMS, MealKind.TEAM_MEAL, 10, 200_000, 0, 30_000, 0, MONDAY_LUNCH))).isEqualTo("70000");
        CompanyTerms noCap = new CompanyTerms(100, 10_000L, 2, EnumSet.allOf(DayOfWeek.class), LocalTime.of(0, 0), LocalTime.of(23, 0), 50_000L, null, 0);
        assertThat(outcome(() -> CorporateMealsRules.share(noCap, MealKind.MEAL, null, 9_000, 1, 0, 0, MONDAY_LUNCH))).isEqualTo("9000");
    }

    @Test
    void monthsAreYearMonthAndStatementsFallDueAfterThePaymentTerms() {
        assertThat(CorporateMealsRules.month(null, MONDAY_LUNCH)).isEqualTo(YearMonth.of(2026, 11));
        assertThat(CorporateMealsRules.month(" 2026-10 ", MONDAY_LUNCH)).isEqualTo(YearMonth.of(2026, 10));
        assertThat(outcome(() -> CorporateMealsRules.month("Nov 2026", MONDAY_LUNCH).getMonthValue())).isEqualTo("INVALID_MONTH");
        assertThat(CorporateMealsRules.dueDate(YearMonth.of(2026, 11), 30)).isEqualTo(LocalDate.of(2026, 12, 30));
        assertThat(CorporateMealsRules.dueDate(YearMonth.of(2026, 2), 0)).isEqualTo(LocalDate.of(2026, 2, 28));
    }
}

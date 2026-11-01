package in.craves.advanced.menuoptions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriod;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodWindow;
import in.craves.advanced.menuoptions.MenuOptionsDtos.OptionChoice;
import in.craves.advanced.menuoptions.MenuOptionsDtos.OptionGroup;
import in.craves.advanced.menuoptions.MenuOptionsDtos.QuotedChoice;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MenuOptionsRulesTest {
    static final UUID JEERA = UUID.randomUUID();
    static final UUID GHEE = UUID.randomUUID();
    static final UUID RAITA = UUID.randomUUID();
    static final UUID SALAN = UUID.randomUUID();
    static final List<OptionGroup> GROUPS = List.of(
            new OptionGroup(UUID.randomUUID(), "Rice", 1, 1, List.of(new OptionChoice(JEERA, "Jeera rice", 0L, true),
                    new OptionChoice(GHEE, "Ghee rice", 2500L, true))),
            new OptionGroup(UUID.randomUUID(), "Add-ons", 0, 2, List.of(new OptionChoice(RAITA, "Raita", 3000L, true),
                    new OptionChoice(SALAN, "Salan", 1500L, false))));

    static String code(Runnable action) {
        try {
            action.run();
            return "none";
        } catch (ApiProblem problem) {
            return problem.code();
        }
    }

    @Test
    void newGroupsAndChoicesGetIdsTidyNamesAndAreAvailableByDefault() {
        List<OptionGroup> groups = MenuOptionsRules.normalise(List.of(new OptionGroup(null, "  Spice   level ", 1, 1,
                List.of(new OptionChoice(null, "Mild", 0L, null), new OptionChoice(null, "Hot", 0L, false)))));
        assertThat(groups.get(0).id()).isNotNull();
        assertThat(groups.get(0).name()).isEqualTo("Spice level");
        assertThat(groups.get(0).choices()).extracting(OptionChoice::available).containsExactly(true, false);
        assertThat(groups.get(0).choices()).allSatisfy(choice -> assertThat(choice.id()).isNotNull());
    }

    @Test
    void inconsistentGroupsAreRefusedWithEveryReason() {
        UUID same = UUID.randomUUID();
        assertThatThrownBy(() -> MenuOptionsRules.normalise(List.of(
                new OptionGroup(null, "Rice", 3, 2, List.of(new OptionChoice(same, "Plain", 0L, true))),
                new OptionGroup(null, "rice", 0, 1, List.of(new OptionChoice(same, "Plain", 0L, true), new OptionChoice(null, "plain", 0L, true))))))
                .isInstanceOfSatisfying(ApiProblem.class, problem -> {
                    assertThat(problem.code()).isEqualTo("INVALID_OPTIONS");
                    assertThat(problem.details()).containsExactly("Rice: minSelect is above maxSelect", "Rice: maxSelect is above the number of choices",
                            "rice: group name used twice", "rice: choice Plain id used twice", "rice: choice plain used twice");
                });
    }

    @Test
    void selectionsMustFitEveryGroup() {
        List<QuotedChoice> quoted = MenuOptionsRules.select(GROUPS, List.of(RAITA, GHEE));
        assertThat(quoted).extracting(QuotedChoice::choiceName).containsExactly("Ghee rice", "Raita");
        assertThat(code(() -> MenuOptionsRules.select(GROUPS, List.of(RAITA)))).isEqualTo("SELECTION_INVALID");
        assertThat(code(() -> MenuOptionsRules.select(GROUPS, List.of(JEERA, GHEE)))).isEqualTo("SELECTION_INVALID");
        assertThat(code(() -> MenuOptionsRules.select(GROUPS, List.of(JEERA, SALAN)))).isEqualTo("CHOICE_UNAVAILABLE");
        assertThat(code(() -> MenuOptionsRules.select(GROUPS, List.of(JEERA, UUID.randomUUID())))).isEqualTo("UNKNOWN_CHOICE");
        assertThat(code(() -> MenuOptionsRules.select(GROUPS, List.of(JEERA, JEERA)))).isEqualTo("DUPLICATE_CHOICE");
        assertThat(code(() -> MenuOptionsRules.select(List.of(), null))).isEqualTo("none");
    }

    @Test
    void mealWindowsUseIndiaTimeAndMayRunPastMidnight() {
        MealPeriodWindow lunch = new MealPeriodWindow(MealPeriod.LUNCH, LocalTime.of(12, 0), LocalTime.of(15, 0), EnumSet.allOf(DayOfWeek.class));
        MealPeriodWindow lateFriday = new MealPeriodWindow(MealPeriod.LATE_NIGHT, LocalTime.of(22, 0), LocalTime.of(1, 0), EnumSet.of(DayOfWeek.FRIDAY));
        // 2 Nov 2026 is a Monday; 07:30 UTC is 13:00 in India.
        assertThat(MenuOptionsRules.serves(lunch, ZonedDateTime.parse("2026-11-02T07:30:00Z"))).isTrue();
        assertThat(MenuOptionsRules.serves(lunch, ZonedDateTime.parse("2026-11-02T09:30:00Z"))).isFalse();
        assertThat(MenuOptionsRules.serves(lateFriday, ZonedDateTime.parse("2026-11-06T18:00:00Z"))).isTrue();
        assertThat(MenuOptionsRules.serves(lateFriday, ZonedDateTime.parse("2026-11-06T19:00:00Z"))).isTrue();
        assertThat(MenuOptionsRules.serves(lateFriday, ZonedDateTime.parse("2026-11-06T20:00:00Z"))).isFalse();
        assertThat(MenuOptionsRules.serves(lateFriday, ZonedDateTime.parse("2026-11-07T18:00:00Z"))).isFalse();
    }
}

package in.craves.advanced.menuoptions;

import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodWindow;
import in.craves.advanced.menuoptions.MenuOptionsDtos.OptionChoice;
import in.craves.advanced.menuoptions.MenuOptionsDtos.OptionGroup;
import in.craves.advanced.menuoptions.MenuOptionsDtos.QuotedChoice;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Pure option and meal-period rules, unit-tested without the database. */
final class MenuOptionsRules {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private MenuOptionsRules() { }

    /** Gives new groups and choices an id, tidies names, defaults choices to available, and checks each group's rules. */
    static List<OptionGroup> normalise(List<OptionGroup> groups) {
        List<String> problems = new ArrayList<>();
        Set<UUID> ids = new HashSet<>();
        Set<String> groupNames = new HashSet<>();
        List<OptionGroup> normalised = new ArrayList<>();
        for (OptionGroup group : groups == null ? List.<OptionGroup>of() : groups) {
            String name = tidy(group.name());
            UUID groupId = group.id() == null ? UUID.randomUUID() : group.id();
            if (!groupNames.add(name.toLowerCase(Locale.ROOT))) problems.add(name + ": group name used twice");
            if (!ids.add(groupId)) problems.add(name + ": id used twice");
            Set<String> choiceNames = new HashSet<>();
            List<OptionChoice> choices = new ArrayList<>();
            for (OptionChoice choice : group.choices()) {
                String choiceName = tidy(choice.name());
                UUID choiceId = choice.id() == null ? UUID.randomUUID() : choice.id();
                if (!choiceNames.add(choiceName.toLowerCase(Locale.ROOT))) problems.add(name + ": choice " + choiceName + " used twice");
                if (!ids.add(choiceId)) problems.add(name + ": choice " + choiceName + " id used twice");
                choices.add(new OptionChoice(choiceId, choiceName, choice.priceDeltaPaise(), choice.available() == null || choice.available()));
            }
            if (group.minSelect() > group.maxSelect()) problems.add(name + ": minSelect is above maxSelect");
            if (group.maxSelect() > choices.size()) problems.add(name + ": maxSelect is above the number of choices");
            normalised.add(new OptionGroup(groupId, name, group.minSelect(), group.maxSelect(), choices));
        }
        if (!problems.isEmpty()) throw new ApiProblem(400, "INVALID_OPTIONS", "The option groups are not consistent", problems);
        return normalised;
    }

    /** Checks a customer's picks: known, available, each picked once, and within every group's minimum and maximum. */
    static List<QuotedChoice> select(List<OptionGroup> groups, List<UUID> choiceIds) {
        List<UUID> picked = choiceIds == null ? List.of() : choiceIds;
        if (new HashSet<>(picked).size() != picked.size()) throw ApiProblem.badRequest("DUPLICATE_CHOICE", "Pick each choice once");
        Map<UUID, OptionChoice> byId = new HashMap<>();
        groups.forEach(group -> group.choices().forEach(choice -> byId.put(choice.id(), choice)));
        List<String> unknown = picked.stream().filter(id -> !byId.containsKey(id)).map(UUID::toString).toList();
        if (!unknown.isEmpty()) throw new ApiProblem(400, "UNKNOWN_CHOICE", "These choices are not offered for this dish", unknown);
        List<String> unavailable = picked.stream().map(byId::get).filter(choice -> !choice.available()).map(OptionChoice::name).toList();
        if (!unavailable.isEmpty()) throw new ApiProblem(409, "CHOICE_UNAVAILABLE", "Some choices are not available right now", unavailable);
        List<String> problems = new ArrayList<>();
        List<QuotedChoice> quoted = new ArrayList<>();
        for (OptionGroup group : groups) {
            List<OptionChoice> mine = group.choices().stream().filter(choice -> picked.contains(choice.id())).toList();
            if (mine.size() < group.minSelect() || mine.size() > group.maxSelect()) problems.add(group.name() + ": choose " + range(group));
            mine.forEach(choice -> quoted.add(new QuotedChoice(group.id(), group.name(), choice.id(), choice.name(), choice.priceDeltaPaise())));
        }
        if (!problems.isEmpty()) throw new ApiProblem(400, "SELECTION_INVALID", "The choices do not fit the dish's options", problems);
        return quoted;
    }

    /** True when the window serves that moment (India time); a window ending before it starts runs past midnight. */
    static boolean serves(MealPeriodWindow window, ZonedDateTime when) {
        ZonedDateTime local = when.withZoneSameInstant(INDIA);
        LocalTime time = local.toLocalTime();
        DayOfWeek day = local.getDayOfWeek();
        if (window.startsAt().isBefore(window.endsAt())) {
            return window.days().contains(day) && !time.isBefore(window.startsAt()) && time.isBefore(window.endsAt());
        }
        return window.days().contains(day) && !time.isBefore(window.startsAt())
                || window.days().contains(day.minus(1)) && time.isBefore(window.endsAt());
    }

    private static String range(OptionGroup group) {
        if (group.minSelect().equals(group.maxSelect())) return "exactly " + group.minSelect();
        return group.minSelect() == 0 ? "up to " + group.maxSelect() : group.minSelect() + " to " + group.maxSelect();
    }

    private static String tidy(String name) {
        return name.strip().replaceAll("\\s+", " ");
    }
}

package in.craves.advanced.orderamendments;

import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentChangeKind;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentChange;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentLine;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Pure amendment rules, kept apart from the database and the gateways so they are unit-tested directly. */
final class OrderAmendmentRules {
    /** The customer may ask for changes until the kitchen starts cooking. */
    static final Set<String> CUSTOMER_MAY_PROPOSE = Set.of("PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED");
    /** The chef may propose changes (for example a substitution) from seeing the order until the food is ready. */
    static final Set<String> CHEF_MAY_PROPOSE = Set.of("CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING");
    /** A proposal can be accepted while the order is still in the kitchen. */
    static final Set<String> STILL_IN_KITCHEN = Set.of("PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING");

    private OrderAmendmentRules() { }

    /** Kept between 1 and 60; anything unreadable means 10, because a bad setting must not stop the other modules from starting. */
    static int answerMinutes(String setting) {
        try {
            return Math.max(1, Math.min(60, Integer.parseInt(setting.strip())));
        } catch (RuntimeException unreadable) {
            return 10;
        }
    }

    /** The order's lines with the accepted amendments applied in order (Order service applies them only with M24). */
    static Map<UUID, OrderLine> effective(List<OrderLine> orderLines, List<List<OrderAmendmentLine>> accepted) {
        Map<UUID, OrderLine> lines = new LinkedHashMap<>();
        orderLines.forEach(line -> lines.put(line.id(), line));
        for (List<OrderAmendmentLine> amendment : accepted) {
            for (OrderAmendmentLine change : amendment) {
                OrderLine line = lines.get(change.orderItemId());
                if (line == null) continue;
                lines.put(line.id(), switch (change.kind()) {
                    case REMOVE, REDUCE -> new OrderLine(line.id(), line.menuItemId(), line.name(), line.unitPricePaise(), change.quantityAfter());
                    case REPLACE -> new OrderLine(line.id(), change.substituteMenuItemId(), change.substituteName(), change.substituteUnitPricePaise(),
                            line.quantity());
                    case ADJUST -> line;
                });
            }
        }
        return lines;
    }

    /**
     * Checks the requested changes against the current lines and prices them. substitutes: dishes Catalog sells right now from the
     * order's kitchen. Every reason a change does not fit is reported at once; nothing may raise the order's total.
     */
    static List<OrderAmendmentLine> plan(Map<UUID, OrderLine> lines, List<OrderAmendmentChange> changes, Map<UUID, MenuItem> substitutes) {
        List<String> problems = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        Map<UUID, Integer> after = new LinkedHashMap<>();
        lines.values().forEach(line -> after.put(line.id(), line.quantity()));
        List<OrderAmendmentLine> planned = new ArrayList<>();
        for (OrderAmendmentChange change : changes) {
            UUID id = change.orderItemId();
            OrderLine line = lines.get(id);
            if (!seen.add(id)) {
                problems.add(id + ": changed twice");
                continue;
            }
            if (line == null) {
                problems.add(id + ": not a line of this order");
                continue;
            }
            if (line.quantity() <= 0) {
                problems.add(id + ": already removed");
                continue;
            }
            if (change.quantity() != null && change.kind() != AmendmentChangeKind.REDUCE) problems.add(id + ": quantity is only for REDUCE");
            if (change.substituteMenuItemId() != null && change.kind() != AmendmentChangeKind.REPLACE) {
                problems.add(id + ": substituteMenuItemId is only for REPLACE");
            }
            String note = blankToNull(change.note());
            long unit = line.unitPricePaise();
            switch (change.kind()) {
                case REMOVE -> {
                    after.put(id, 0);
                    planned.add(new OrderAmendmentLine(id, change.kind(), line.menuItemId(), line.name(), line.quantity(), 0, unit, null, null, null, note,
                            -Math.multiplyExact(unit, (long) line.quantity())));
                }
                case REDUCE -> {
                    Integer quantity = change.quantity();
                    if (quantity == null || quantity >= line.quantity()) {
                        problems.add(id + ": REDUCE needs a quantity below " + line.quantity());
                        continue;
                    }
                    after.put(id, quantity);
                    planned.add(new OrderAmendmentLine(id, change.kind(), line.menuItemId(), line.name(), line.quantity(), quantity, unit, null, null, null,
                            note, -Math.multiplyExact(unit, (long) (line.quantity() - quantity))));
                }
                case REPLACE -> {
                    UUID substitute = change.substituteMenuItemId();
                    MenuItem dish = substitute == null ? null : substitutes.get(substitute);
                    if (substitute == null) {
                        problems.add(id + ": REPLACE needs substituteMenuItemId");
                    } else if (substitute.equals(line.menuItemId())) {
                        problems.add(id + ": the substitute is the same dish (use ADJUST)");
                    } else if (dish == null) {
                        problems.add(id + ": substitute " + substitute + " is not on this kitchen's menu right now");
                    } else if (dish.pricePaise() > unit) {
                        problems.add(id + ": substitute costs " + dish.pricePaise() + " paise, more than the " + unit + " paid");
                    } else {
                        planned.add(new OrderAmendmentLine(id, change.kind(), line.menuItemId(), line.name(), line.quantity(), line.quantity(), unit,
                                dish.id(), dish.name(), dish.pricePaise(), note,
                                Math.multiplyExact(dish.pricePaise() - unit, (long) line.quantity())));
                    }
                }
                case ADJUST -> {
                    if (note == null) {
                        problems.add(id + ": ADJUST needs a note saying what changes");
                        continue;
                    }
                    planned.add(new OrderAmendmentLine(id, change.kind(), line.menuItemId(), line.name(), line.quantity(), line.quantity(), unit, null,
                            null, null, note, 0));
                }
            }
        }
        if (problems.isEmpty() && after.values().stream().mapToInt(Integer::intValue).sum() <= 0) {
            problems.add("every dish would be removed: cancel the order instead");
        }
        if (!problems.isEmpty()) throw new ApiProblem(422, "AMENDMENT_INVALID", "These changes do not fit the order", problems);
        return planned;
    }

    static long foodDelta(List<OrderAmendmentLine> changes) {
        return changes.stream().mapToLong(OrderAmendmentLine::deltaPaise).reduce(0, Math::addExact);
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}

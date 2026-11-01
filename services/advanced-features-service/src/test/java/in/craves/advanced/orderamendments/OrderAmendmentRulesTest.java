package in.craves.advanced.orderamendments;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentChangeKind;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentChange;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentLine;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderAmendmentRulesTest {
    static final UUID KITCHEN = UUID.randomUUID();
    static final OrderLine BIRYANI = new OrderLine(UUID.randomUUID(), UUID.randomUUID(), "Chicken dum biryani", 32_000, 2);
    static final OrderLine RAITA = new OrderLine(UUID.randomUUID(), UUID.randomUUID(), "Boondi raita", 4_000, 3);
    static final MenuItem PULAO = new MenuItem(UUID.randomUUID(), KITCHEN, "Veg pulao", 25_000L);
    static final MenuItem MUTTON = new MenuItem(UUID.randomUUID(), KITCHEN, "Mutton biryani", 45_000L);
    static final Map<UUID, MenuItem> SUBSTITUTES = Map.of(PULAO.id(), PULAO, MUTTON.id(), MUTTON);

    static Map<UUID, OrderLine> lines(OrderLine... lines) {
        return OrderAmendmentRules.effective(List.of(lines), List.of());
    }

    static OrderAmendmentChange change(OrderLine line, AmendmentChangeKind kind, Integer quantity, UUID substitute, String note) {
        return new OrderAmendmentChange(line.id(), kind, quantity, substitute, note);
    }

    static List<String> problems(Map<UUID, OrderLine> lines, OrderAmendmentChange... changes) {
        try {
            OrderAmendmentRules.plan(lines, List.of(changes), SUBSTITUTES);
            return List.of();
        } catch (ApiProblem problem) {
            assertThat(problem.code()).isEqualTo("AMENDMENT_INVALID");
            return problem.details();
        }
    }

    @Test
    void changesArePricedFromWhatTheCustomerPaidAndNeverRaiseTheTotal() {
        List<OrderAmendmentLine> planned = OrderAmendmentRules.plan(lines(BIRYANI, RAITA), List.of(
                change(BIRYANI, AmendmentChangeKind.REPLACE, null, PULAO.id(), "Out of chicken today"),
                change(RAITA, AmendmentChangeKind.REDUCE, 1, null, null)), SUBSTITUTES);
        // (250.00 - 320.00) x 2 and 40.00 x (3 - 1) back.
        assertThat(planned).extracting(OrderAmendmentLine::deltaPaise).containsExactly(-14_000L, -8_000L);
        assertThat(OrderAmendmentRules.foodDelta(planned)).isEqualTo(-22_000);
        assertThat(planned.get(0).substituteName()).isEqualTo("Veg pulao");
        assertThat(planned.get(0).quantityAfter()).isEqualTo(2);
        assertThat(planned.get(0).note()).isEqualTo("Out of chicken today");
        OrderAmendmentLine removed = OrderAmendmentRules.plan(lines(BIRYANI, RAITA), List.of(change(RAITA, AmendmentChangeKind.REMOVE, null, null, " ")),
                SUBSTITUTES).get(0);
        assertThat(removed.deltaPaise()).isEqualTo(-12_000);
        assertThat(removed.quantityAfter()).isZero();
        assertThat(removed.note()).isNull();
        OrderAmendmentLine adjusted = OrderAmendmentRules.plan(lines(BIRYANI), List.of(change(BIRYANI, AmendmentChangeKind.ADJUST, null, null,
                " No fried onions ")), SUBSTITUTES).get(0);
        assertThat(adjusted.deltaPaise()).isZero();
        assertThat(adjusted.note()).isEqualTo("No fried onions");
    }

    @Test
    void everyReasonAChangeDoesNotFitIsReportedAtOnce() {
        UUID stranger = UUID.randomUUID();
        assertThat(problems(lines(BIRYANI, RAITA),
                change(BIRYANI, AmendmentChangeKind.REPLACE, null, MUTTON.id(), null),
                change(RAITA, AmendmentChangeKind.REDUCE, 3, null, null),
                new OrderAmendmentChange(stranger, AmendmentChangeKind.REMOVE, null, null, null)))
                .containsExactly(BIRYANI.id() + ": substitute costs 45000 paise, more than the 32000 paid",
                        RAITA.id() + ": REDUCE needs a quantity below 3", stranger + ": not a line of this order");
        assertThat(problems(lines(BIRYANI, RAITA),
                change(BIRYANI, AmendmentChangeKind.REPLACE, null, BIRYANI.menuItemId(), null),
                change(RAITA, AmendmentChangeKind.ADJUST, 2, null, null)))
                .containsExactly(BIRYANI.id() + ": the substitute is the same dish (use ADJUST)", RAITA.id() + ": quantity is only for REDUCE",
                        RAITA.id() + ": ADJUST needs a note saying what changes");
        assertThat(problems(lines(BIRYANI), change(BIRYANI, AmendmentChangeKind.REPLACE, null, UUID.randomUUID(), null)).get(0))
                .contains("is not on this kitchen's menu right now");
        assertThat(problems(lines(BIRYANI), change(BIRYANI, AmendmentChangeKind.REMOVE, null, PULAO.id(), null), change(BIRYANI,
                AmendmentChangeKind.REMOVE, null, null, null)))
                .containsExactly(BIRYANI.id() + ": substituteMenuItemId is only for REPLACE", BIRYANI.id() + ": changed twice");
        assertThat(problems(lines(BIRYANI, RAITA), change(BIRYANI, AmendmentChangeKind.REMOVE, null, null, null),
                change(RAITA, AmendmentChangeKind.REMOVE, null, null, null)))
                .containsExactly("every dish would be removed: cancel the order instead");
    }

    @Test
    void acceptedChangesReplayOverTheOrderSoNothingIsRefundedTwice() {
        List<OrderAmendmentLine> first = OrderAmendmentRules.plan(lines(BIRYANI, RAITA), List.of(
                change(BIRYANI, AmendmentChangeKind.REPLACE, null, PULAO.id(), null),
                change(RAITA, AmendmentChangeKind.REMOVE, null, null, null)), SUBSTITUTES);
        Map<UUID, OrderLine> now = OrderAmendmentRules.effective(List.of(BIRYANI, RAITA), List.of(first));
        assertThat(now.get(BIRYANI.id())).isEqualTo(new OrderLine(BIRYANI.id(), PULAO.id(), "Veg pulao", 25_000, 2));
        assertThat(now.get(RAITA.id()).quantity()).isZero();
        assertThat(problems(now, change(RAITA, AmendmentChangeKind.REDUCE, 1, null, null))).containsExactly(RAITA.id() + ": already removed");
        assertThat(problems(now, change(BIRYANI, AmendmentChangeKind.REMOVE, null, null, null)))
                .containsExactly("every dish would be removed: cancel the order instead");
        // The pulao line is now priced at 250.00, so reducing it gives back 250.00, not the biryani's 320.00.
        assertThat(OrderAmendmentRules.plan(now, List.of(change(BIRYANI, AmendmentChangeKind.REDUCE, 1, null, null)), SUBSTITUTES).get(0).deltaPaise())
                .isEqualTo(-25_000);
    }

    @Test
    void theAnswerWindowIsClampedAndAnUnreadableValueMeansTen() {
        assertThat(OrderAmendmentRules.answerMinutes(" 15 ")).isEqualTo(15);
        assertThat(OrderAmendmentRules.answerMinutes("0")).isEqualTo(1);
        assertThat(OrderAmendmentRules.answerMinutes("600")).isEqualTo(60);
        assertThat(OrderAmendmentRules.answerMinutes("ten")).isEqualTo(10);
        assertThat(OrderAmendmentRules.answerMinutes(null)).isEqualTo(10);
    }

    @Test
    void customersAskUntilCookingStartsAndChefsUntilTheFoodIsReady() {
        assertThat(OrderAmendmentRules.CUSTOMER_MAY_PROPOSE).contains("PAID", "CHEF_ACCEPTED").doesNotContain("PREPARING", "PAYMENT_PENDING");
        assertThat(OrderAmendmentRules.CHEF_MAY_PROPOSE).contains("PREPARING").doesNotContain("PAID", "READY_FOR_PICKUP");
        assertThat(OrderAmendmentRules.STILL_IN_KITCHEN).doesNotContain("READY_FOR_PICKUP", "CANCELLED", "REFUNDED", "CHEF_REJECTED");
    }
}

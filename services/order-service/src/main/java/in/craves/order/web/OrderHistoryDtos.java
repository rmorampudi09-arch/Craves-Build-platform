package in.craves.order.web;

import in.craves.order.web.ApiDtos.OrderResponse;
import java.util.List;

public final class OrderHistoryDtos {
    private OrderHistoryDtos() {
    }

    public record OrderPageResponse(
        List<OrderResponse> orders,
        String nextCursor,
        boolean hasMore
    ) {
    }
}

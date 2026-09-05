package in.craves.notification.api;

import java.util.List;

public record AppNoticePageResponse(
    List<AppNoticeResponse> notices,
    String nextCursor,
    boolean hasMore
) {
}

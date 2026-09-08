package in.craves.order.web;

import java.time.Instant;
import java.util.List;

public record StandardApiErrorResponse(
    Instant timestamp,
    int status,
    String code,
    String error,
    String message,
    List<String> details,
    String path,
    String correlationId
) {
    public StandardApiErrorResponse {
        details = details == null ? List.of() : List.copyOf(details);
    }
}

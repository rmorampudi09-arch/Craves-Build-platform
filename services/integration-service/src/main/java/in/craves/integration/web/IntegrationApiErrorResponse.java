package in.craves.integration.web;

import java.time.Instant;
import java.util.List;

public record IntegrationApiErrorResponse(
    Instant timestamp,
    int status,
    String code,
    String error,
    String message,
    List<String> details,
    String path,
    String correlationId
) {
    public IntegrationApiErrorResponse {
        details = details == null ? List.of() : List.copyOf(details);
    }
}

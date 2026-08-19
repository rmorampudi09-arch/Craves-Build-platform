package in.craves.auth.exception;

import java.time.Instant;
import java.util.List;

public record ApiErrorResponse(
    Instant timestamp,
    int status,
    String code,
    String error,
    String message,
    List<String> details,
    String path,
    String correlationId
) {
    public ApiErrorResponse {
        details = details == null ? List.of() : List.copyOf(details);
    }

    public static ApiErrorResponse of(
        int status,
        String code,
        String message,
        List<String> details,
        String path,
        String correlationId
    ) {
        return new ApiErrorResponse(
            Instant.now(),
            status,
            code,
            code,
            message,
            details,
            path,
            correlationId
        );
    }
}

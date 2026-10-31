package in.craves.advanced.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;

/** The platform error envelope: {timestamp, code, message, details, correlationId}. */
public record ErrorBody(Instant timestamp, String code, String message, List<String> details, String correlationId) {
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    public static ErrorBody of(String code, String message, List<String> details, HttpServletRequest request) {
        return new ErrorBody(Instant.now(), code, message, details == null ? List.of() : details, CorrelationFilter.current(request));
    }

    public static void write(HttpServletRequest request, HttpServletResponse response, int status, String code, String message)
            throws IOException {
        if (response.isCommitted()) return;
        response.resetBuffer();
        response.setStatus(status);
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        JSON.writeValue(response.getOutputStream(), of(code, message, List.of(), request));
    }
}

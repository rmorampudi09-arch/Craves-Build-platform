package in.craves.advanced.platform.web;

import java.util.List;

/** A failure with an HTTP status and a stable machine-readable code (the error envelope's {@code code}). */
public class ApiProblem extends RuntimeException {
    private final int status;
    private final String code;
    private final transient List<String> details;

    public ApiProblem(int status, String code, String message) {
        this(status, code, message, List.of());
    }

    public ApiProblem(int status, String code, String message, List<String> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details == null ? List.of() : List.copyOf(details);
    }

    public int status() { return status; }
    public String code() { return code; }
    public List<String> details() { return details; }

    public static ApiProblem badRequest(String code, String message) { return new ApiProblem(400, code, message); }
    public static ApiProblem forbidden(String code, String message) { return new ApiProblem(403, code, message); }
    public static ApiProblem notFound(String code, String message) { return new ApiProblem(404, code, message); }
    public static ApiProblem conflict(String code, String message) { return new ApiProblem(409, code, message); }
    public static ApiProblem unprocessable(String code, String message) { return new ApiProblem(422, code, message); }
    public static ApiProblem unavailable(String code, String message) { return new ApiProblem(503, code, message); }

    public static void require(boolean condition, int status, String code, String message) {
        if (!condition) throw new ApiProblem(status, code, message);
    }
}

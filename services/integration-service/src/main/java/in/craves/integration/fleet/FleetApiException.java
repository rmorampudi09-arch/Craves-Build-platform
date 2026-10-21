package in.craves.integration.fleet;

/** A refusal with a code and a plain message that is safe to show to the admin or the rider. */
public class FleetApiException extends RuntimeException {
    private final int status;
    private final String code;

    public FleetApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static FleetApiException invalid(String message) {
        return new FleetApiException(400, "VALIDATION_FAILED", message);
    }

    public static FleetApiException forbidden() {
        return new FleetApiException(403, "FORBIDDEN", "Your role can't do this.");
    }

    public static FleetApiException notFound(String code, String message) {
        return new FleetApiException(404, code, message);
    }

    public static FleetApiException conflict(String code, String message) {
        return new FleetApiException(409, code, message);
    }

    public static FleetApiException unprocessable(String code, String message) {
        return new FleetApiException(422, code, message);
    }
}

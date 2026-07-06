package in.craves.userchef.exception;

public class ApiException extends RuntimeException {
    private final String code;
    private final int status;

    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public int getStatus() {
        return status;
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(401, code, message);
    }
}

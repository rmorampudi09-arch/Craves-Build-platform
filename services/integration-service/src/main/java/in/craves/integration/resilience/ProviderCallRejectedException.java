package in.craves.integration.resilience;

public class ProviderCallRejectedException extends RuntimeException {
    public enum Reason {
        CIRCUIT_OPEN,
        BULKHEAD_FULL
    }

    private final String providerId;
    private final Reason reason;

    public ProviderCallRejectedException(String providerId, Reason reason) {
        super("Provider " + providerId + " call was not started because " + reason.name().toLowerCase());
        this.providerId = providerId;
        this.reason = reason;
    }

    public String providerId() { return providerId; }
    public Reason reason() { return reason; }
}

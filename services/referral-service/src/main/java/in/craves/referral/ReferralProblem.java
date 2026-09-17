package in.craves.referral;

/** Stable, non-PII error codes. Database messages and supplied payloads are never returned. */
public final class ReferralProblem extends RuntimeException {
    private final int status;
    public ReferralProblem(int status, String code) { super(code); this.status = status; }
    public int status() { return status; }
    public static void require(boolean condition, int status, String code) {
        if (!condition) throw new ReferralProblem(status, code);
    }
}

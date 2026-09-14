package in.craves.integration.payout.bank;

import java.text.Normalizer;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/** Bank numbers are never part of public read models or generated record toString output. */
public final class BankOnboardingModels {
    private BankOnboardingModels() {}
    public static final String CONSENT_VERSION = "craves-bank-validation-20260914-v1";

    public record Submission(UUID requestKey, UUID expectedCurrentId, String accountHolderName,
                             String accountNumber, String accountNumberConfirmation, String ifsc,
                             boolean consent, String consentVersion) {
        @Override public String toString() { return "BankSubmission[redacted]"; }
    }
    public record Identity(UUID chefId, UUID applicationId, String name, String email, String phone,
                           String status, Instant updatedAt) {
        public boolean approved() { return "APPROVED".equals(status); }
        @Override public String toString() { return "BankIdentity[redacted]"; }
    }
    public record Details(UUID chefId, UUID applicationId, String name, String email, String phone,
                          String accountNumber, String ifsc) {
        @Override public String toString() { return "BankDetails[redacted]"; }
    }
    public record Result(String validationId, String fundAccountId, String contactId,
                         String state, String evidenceHash) {}
    public record Status(UUID id, String state, String lastFour, String ifsc, boolean bankValidated,
                         boolean applicationApproved, boolean automaticActivation, String message,
                         Instant updatedAt) {}
    public record AdminRow(UUID chefId, Status bank) {}
    public record Work(UUID id, UUID chefId, UUID leaseId, String state, String validationId,
                       String encryptedDetails, Instant createdAt) {
        @Override public String toString() { return "BankWork[id=" + id + "]"; }
    }

    public static Details details(Submission request, Identity identity) {
        if (request == null || request.requestKey() == null || !request.consent()
                || !CONSENT_VERSION.equals(request.consentVersion()))
            throw new IllegalArgumentException("Bank validation consent and request identity are required");
        if (request.accountNumber() == null || !request.accountNumber().matches("[0-9]{6,24}")
                || !request.accountNumber().equals(request.accountNumberConfirmation()))
            throw new IllegalArgumentException("Enter matching bank account numbers");
        String ifsc = request.ifsc() == null ? "" : request.ifsc().trim().toUpperCase(Locale.ROOT);
        if (!ifsc.matches("[A-Z]{4}0[A-Z0-9]{6}")) throw new IllegalArgumentException("Invalid IFSC format");
        if (identity == null || identity.chefId() == null || identity.applicationId() == null
                || !java.util.Set.of("PENDING", "APPROVED").contains(identity.status())
                || identity.name() == null || identity.name().length() > 120
                || normalizeName(identity.name()).length() < 2)
            throw new IllegalArgumentException("A submitted chef application is required");
        if (!normalizeName(identity.name()).equals(normalizeName(request.accountHolderName())))
            throw new IllegalArgumentException("Account holder must match the saved applicant name");
        if (identity.email() == null || identity.email().length() > 254
                || !identity.email().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            throw new IllegalArgumentException("A valid saved chef email is required");
        String phone = identity.phone() == null ? "" : identity.phone().replaceFirst("^\\+91", "");
        if (!phone.matches("[6-9][0-9]{9}")) throw new IllegalArgumentException("Verified Indian phone is required");
        return new Details(identity.chefId(), identity.applicationId(), identity.name().trim(),
                identity.email(), phone, request.accountNumber(), ifsc);
    }

    /** Deliberately not fuzzy matching: initials or a different business name do not silently pass. */
    public static String normalizeName(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC).toUpperCase(Locale.ROOT)
                .replaceAll("[.\\-'’]", " ").replaceAll("\\s+", " ").trim();
    }
}

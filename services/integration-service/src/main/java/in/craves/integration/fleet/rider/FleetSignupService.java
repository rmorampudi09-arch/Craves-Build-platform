package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.rider.FleetRiderModels.PayoutAccountInput;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderModels.SignUp;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.payout.bank.BankOnboardingModels;
import in.craves.integration.security.CravesPrincipal;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Riders sign up in the app, like chefs: anyone signed in with an OTP-verified Indian mobile becomes a PENDING rider,
 * sends documents and a payout account, and ops checks both by hand. Nothing here lets a rider work: ops activates them
 * (RESTORE), and an account the rider typed is never paid until ops confirms it.
 */
@Service
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetSignupService {
    static final Map<String, String> VEHICLE_LABELS = Map.of("PETROL", "Petrol two-wheeler", "ELECTRIC", "Electric two-wheeler",
        "BICYCLE", "Bicycle");
    // A make and model as people write it: "Honda Activa 6G", "TVS Jupiter 125", "Ather 450X", "Hero Sprint".
    static final String VEHICLE_MODEL = "^[\\p{L}\\p{N}][\\p{L}\\p{N} .&/+-]{1,39}$";
    private static final Set<String> LANGUAGES = Set.of("en", "te", "hi");
    // Ops has relied on the name once it accepted a document carrying it or confirmed a payout account in it.
    private static final String NAME_CHECKED_SQL = "SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_document WHERE rider_id = ? "
        + "AND status = 'VERIFIED' AND type IN ('PAN', 'DRIVING_LICENCE', 'BANK_PROOF')) OR EXISTS (SELECT 1 "
        + "FROM fleet_schema.rider_payout_account WHERE rider_id = ? AND state = 'ACTIVE')";

    private final JdbcTemplate jdbc;
    private final FleetRiderService riders;
    private final BankDataCipher cipher;

    public FleetSignupService(JdbcTemplate jdbc, FleetRiderService riders, BankDataCipher cipher) {
        this.jdbc = jdbc;
        this.riders = riders;
        this.cipher = cipher;
    }

    /**
     * Creates the PENDING rider for this phone, with the make and model as the vehicle label when given (else the kind's). A
     * rider still PENDING sends it again to correct their details (an empty plate keeps the one on file); for anyone further
     * along it only answers /me.
     */
    @Transactional
    public RiderMe signUp(CravesPrincipal principal, SignUp input) {
        String phone = principal.phoneNumber();
        if (phone == null || !phone.matches(FleetRules.RIDER_PHONE)) {
            throw FleetApiException.unprocessable("PHONE_REQUIRED", "Sign in with your Indian mobile number to sign up.");
        }
        String name = input == null || input.name() == null ? "" : input.name().trim().replaceAll("\\s+", " ");
        if (name.length() < 2 || name.length() > 120) {
            throw FleetApiException.invalid("Enter your full name as on your documents.");
        }
        if (!LANGUAGES.contains(input.language())) {
            throw FleetApiException.invalid("Choose English, Telugu or Hindi.");
        }
        String label = input.vehicleKind() == null ? null : VEHICLE_LABELS.get(input.vehicleKind());
        if (label == null) {
            throw FleetApiException.invalid("Choose what you ride: a petrol two-wheeler, an electric two-wheeler or a bicycle.");
        }
        String model = input.vehicleModel() == null ? "" : input.vehicleModel().trim().replaceAll("\\s+", " ");
        if (!model.isEmpty() && !model.matches(VEHICLE_MODEL)) {
            throw FleetApiException.invalid("Enter the make and model, like Honda Activa 6G.");
        }
        String registration = null;
        if (!"BICYCLE".equals(input.vehicleKind())) {
            registration = input.vehicleRegNumber() == null ? "" : input.vehicleRegNumber().replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
            if (!registration.isEmpty() && !registration.matches(FleetRules.VEHICLE_REGISTRATION)) {
                throw invalidPlate();
            }
        }
        if (!Boolean.TRUE.equals(input.adult())) {
            throw FleetApiException.invalid("Riders must be 18 or older.");
        }
        RiderMe me = riders.me(principal); // links a rider ops already added for this phone
        if ("PENDING".equals(me.status())) {
            changeDetails(principal.identityId(), name, input.language(), input.vehicleKind(), label, model.isEmpty() ? null : model,
                registration);
            return riders.me(principal);
        }
        if (!"NOT_RIDER".equals(me.status())) {
            return me;
        }
        if ("".equals(registration)) {
            throw invalidPlate();
        }
        UUID identity = principal.identityId();
        // ON CONFLICT: a double tap, or the phone already belongs to another account's rider (answered below).
        jdbc.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, language, vehicle_label, vehicle_reg_number, vehicle_kind, "
            + "created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
            UUID.randomUUID(), identity, name, phone, input.language(), model.isEmpty() ? label : model, registration, input.vehicleKind(),
            identity);
        me = riders.me(principal);
        if ("NOT_RIDER".equals(me.status())) {
            throw FleetApiException.conflict("PHONE_IN_USE", "This number is already a Craves rider on another account. Call rider support.");
        }
        return me;
    }

    /**
     * A PENDING rider correcting their sign-up. The name is locked once ops accepted the PAN card, driving licence or bank
     * proof, or confirmed a payout account; the vehicle (kind, make and model, plate) once ops accepted the RC (going online
     * only checks that some RC is accepted). A new name also sets aside a payout account sent in the old one: ops could never
     * confirm it, so the rider sends it again. model is null when the app sent none.
     */
    private void changeDetails(UUID identityId, String name, String language, String kind, String kindLabel, String model,
                               String registration) {
        jdbc.queryForObject("SELECT id FROM fleet_schema.rider WHERE identity_id = ? FOR UPDATE", UUID.class, identityId);
        FleetRiderService.Rider rider = riders.rider(identityId);
        String plate = "".equals(registration) ? rider.vehicleRegNumber() : registration;
        if (registration != null && plate == null) {
            throw invalidPlate();
        }
        boolean renamed = !FleetRules.sameName(name, rider.name());
        if (renamed && Boolean.TRUE.equals(jdbc.queryForObject(NAME_CHECKED_SQL, Boolean.class, rider.id(), rider.id()))) {
            throw FleetApiException.unprocessable("NAME_LOCKED",
                "Ops has already checked your documents or payout account in this name. Call rider support to change it.");
        }
        // A rider ops added before sign-up existed has no kind; the document checks treat that as PETROL.
        String onFile = jdbc.queryForObject("SELECT vehicle_kind FROM fleet_schema.rider WHERE id = ?", String.class, rider.id());
        boolean kindChanged = !kind.equals(onFile == null ? "PETROL" : onFile);
        // Without a make and model (an app before 1.2.0) the label on file stays, unless the kind changed.
        String label = model != null ? model : kindChanged ? kindLabel : rider.vehicleLabel();
        boolean vehicleChanged = kindChanged || !Objects.equals(plate, rider.vehicleRegNumber())
            || !Objects.equals(label, rider.vehicleLabel());
        if (vehicleChanged && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_document "
            + "WHERE rider_id = ? AND type = 'VEHICLE_RC' AND status = 'VERIFIED')", Boolean.class, rider.id()))) {
            throw FleetApiException.unprocessable("VEHICLE_LOCKED",
                "Ops has already accepted your RC for this vehicle. Call rider support to change it.");
        }
        jdbc.update("UPDATE fleet_schema.rider SET name = ?, language = ?, updated_at = now() WHERE id = ? AND status = 'PENDING'",
            name, language, rider.id());
        if (vehicleChanged) {
            jdbc.update("UPDATE fleet_schema.rider SET vehicle_kind = ?, vehicle_label = ?, vehicle_reg_number = ? WHERE id = ? "
                + "AND status = 'PENDING'", kind, label, plate, rider.id());
        }
        if (renamed) {
            jdbc.queryForList("SELECT id, holder_name FROM fleet_schema.rider_payout_account WHERE rider_id = ? AND state = 'SUBMITTED'",
                rider.id()).stream().filter(sent -> !FleetRules.sameName((String) sent.get("holder_name"), name))
                .forEach(sent -> jdbc.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE id = ?", sent.get("id")));
        }
    }

    private static FleetApiException invalidPlate() {
        return FleetApiException.invalid("Enter the number plate as on the RC, like TS09EA1234.");
    }

    /**
     * The payout account the rider types, in their KYC name. It waits as SUBMITTED, replacing an earlier one they sent, and is
     * paid only after ops confirms it; an account ops already set keeps being paid until then.
     */
    @Transactional
    public void submitPayoutAccount(UUID identityId, PayoutAccountInput input) {
        FleetRiderService.Rider rider = riders.rider(identityId);
        if ("DEACTIVATED".equals(rider.status())) {
            throw FleetApiException.forbidden();
        }
        String holder = input == null || input.holderName() == null ? "" : input.holderName().trim();
        if (holder.length() < 2 || holder.length() > 120) {
            throw FleetApiException.invalid("Enter the account holder's name.");
        }
        boolean upi = "UPI".equals(input.method());
        String upiId = input.upiId() == null ? null : input.upiId().trim();
        String accountNumber = input.accountNumber() == null ? null : input.accountNumber().replaceAll("\\s", "");
        String ifsc = upi || input.ifsc() == null ? null : input.ifsc().trim().toUpperCase(Locale.ROOT);
        if (!FleetRules.validPayoutAccount(input.method(), upiId, accountNumber, ifsc)) {
            throw FleetApiException.invalid("UPI needs a UPI ID like name@bank; a bank account needs its number and IFSC.");
        }
        if (!FleetRules.sameName(holder, rider.name())) {
            throw FleetApiException.unprocessable("HOLDER_NAME_MISMATCH", "The account must be in your name, as on your documents.");
        }
        if (!cipher.ready()) {
            throw new FleetApiException(503, "PAYOUT_ACCOUNT_STORAGE_UNAVAILABLE", "Encrypted storage for payout accounts is not ready.");
        }
        String account = upi ? upiId.toLowerCase(Locale.ROOT) : accountNumber;
        String fingerprint = cipher.accountFingerprint(FleetRules.payoutAccountKey(input.method(), account, ifsc));
        jdbc.queryForObject("SELECT id FROM fleet_schema.rider WHERE id = ? FOR UPDATE", UUID.class, rider.id());
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_account "
            + "WHERE fingerprint = ? AND rider_id <> ? AND state IN ('ACTIVE', 'SUBMITTED'))", Boolean.class, fingerprint, rider.id()))) {
            throw FleetApiException.conflict("PAYOUT_ACCOUNT_NOT_UNIQUE", "This UPI ID or bank account belongs to another rider.");
        }
        UUID id = UUID.randomUUID();
        // The same encrypted record ops writes: the rider is the owner, a UPI ID goes where the account number goes.
        String encrypted = cipher.encrypt(id, rider.id(), new BankOnboardingModels.Details(rider.id(), null, holder, null, null, account, ifsc));
        jdbc.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE rider_id = ? AND state = 'SUBMITTED'", rider.id());
        jdbc.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, masked_account, ifsc, "
                + "holder_name, state, verified_in_person, set_by, set_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', false, ?, ?)",
            id, rider.id(), input.method(), encrypted, fingerprint, upi ? FleetRules.maskUpi(account) : FleetRules.maskAccount(account),
            ifsc, holder, identityId, rider.name());
    }
}

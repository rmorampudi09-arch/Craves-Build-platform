package in.craves.integration.fleet;

import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Pure fleet rules: masking, the KYC name match and the two due-process tracks. */
public final class FleetRules {
    public static final Duration NOTICE_PERIOD = Duration.ofDays(7);
    public static final Duration SAFETY_REVIEW = Duration.ofHours(72);
    /** A verified document past its expiry date (IST) shows as EXPIRED. */
    public static final String DOCUMENT_STATUS_SQL =
        "CASE WHEN status = 'VERIFIED' AND expires_on < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'EXPIRED' ELSE status END";
    /** The rider's latest NOTICE, open until a RESTORE or DEACTIVATE follows it. */
    public static final String OPEN_NOTICE_SQL = """
        SELECT n.reason, n.evidence_summary, n.deadline, n.appeal_phone, n.created_at FROM fleet_schema.rider_status_event n
        WHERE n.rider_id = ? AND n.kind = 'NOTICE' AND NOT EXISTS (
          SELECT 1 FROM fleet_schema.rider_status_event e
          WHERE e.rider_id = n.rider_id AND e.kind IN ('RESTORE', 'DEACTIVATE') AND e.created_at >= n.created_at)
        ORDER BY n.created_at DESC LIMIT 1""";
    private static final Set<String> HONORIFICS = Set.of("MR", "MRS", "MS", "MISS", "SHRI", "SMT", "KUMARI", "DR");
    public static final String RIDER_PHONE = "^\\+91[6-9][0-9]{9}$";
    public static final String VEHICLE_REGISTRATION = "^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$";
    /**
     * What a rider applying must send, by what they ride (V160): a bicycle needs no licence or RC, an electric bike no PUC.
     * Everyone sends PHOTO, a live front-camera selfie (app code SELFIE) that ops accept beside the licence photo and then
     * compare every go-online selfie with (R16 item 7). A rider ops added before sign-up has no kind and sends the petrol set.
     * The rider's checklist, the ops review and the application stage all read this one list (docs/riders/FLOWS.md).
     */
    public static final Map<String, List<String>> REQUIRED_DOCUMENTS = Map.of(
        "PETROL", List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN", "BANK_PROOF", "PHOTO"),
        "ELECTRIC", List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PAN", "BANK_PROOF", "PHOTO"),
        "BICYCLE", List.of("PAN", "BANK_PROOF", "PHOTO"));
    /** The four riding documents: verified only with the expiry date printed on them (/shift/start checks it). */
    public static final Set<String> EXPIRING_DOCUMENTS = Set.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC");
    /** REQUIRED_DOCUMENTS as SQL: the text[] of types for the rider row aliased r (built from the constants above). */
    public static final String REQUIRED_DOCUMENTS_SQL = "CASE r.vehicle_kind WHEN 'ELECTRIC' THEN " + sqlArray("ELECTRIC")
        + " WHEN 'BICYCLE' THEN " + sqlArray("BICYCLE") + " ELSE " + sqlArray("PETROL") + " END";

    private FleetRules() {
    }

    /** The documents a rider with this vehicle kind sends; null (ops added them before sign-up) is the petrol set. */
    public static List<String> requiredDocuments(String vehicleKind) {
        return REQUIRED_DOCUMENTS.getOrDefault(vehicleKind == null ? "PETROL" : vehicleKind, REQUIRED_DOCUMENTS.get("PETROL"));
    }

    private static String sqlArray(String kind) {
        return REQUIRED_DOCUMENTS.get(kind).stream().map(type -> "'" + type + "'").collect(Collectors.joining(", ", "ARRAY[", "]::text[]"));
    }

    /** A UPI ID like name@bank, or a bank account of 9 to 18 digits with its IFSC; never both. */
    public static boolean validPayoutAccount(String method, String upiId, String accountNumber, String ifsc) {
        return "UPI".equals(method)
            ? upiId != null && upiId.matches("^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$") && accountNumber == null
            : "BANK".equals(method) && accountNumber != null && accountNumber.matches("^[0-9]{9,18}$")
                && ifsc != null && ifsc.matches("^[A-Z]{4}0[A-Z0-9]{6}$") && upiId == null;
    }

    /** What the keyed fingerprint hashes: the same account at the same bank, whatever branch IFSC was typed. */
    public static String payoutAccountKey(String method, String account, String ifsc) {
        return "UPI".equals(method) ? "UPI:" + account : "BANK:" + ifsc.substring(0, 4) + ":" + account;
    }

    /** "+919876543210" becomes "+91 98xxxxx210". */
    public static String maskPhone(String phone) {
        if (phone == null || !phone.matches("\\+91[0-9]{10}")) {
            return "+91 xxxxxxxxxx";
        }
        return "+91 " + phone.substring(3, 5) + "xxxxx" + phone.substring(10);
    }

    /** The JWT carries no name, so admins are shown by their masked phone. */
    public static String adminName(String phone, UUID identityId) {
        return phone != null && phone.matches("\\+91[0-9]{10}") ? "Admin " + maskPhone(phone)
            : "Admin " + identityId.toString().substring(0, 8);
    }

    /** "TS09EA1234" becomes "TS09xx1234". */
    public static String maskVehicle(String registration) {
        String plate = registration.replace(" ", "");
        return plate.length() <= 8 ? plate : plate.substring(0, 4) + "xx" + plate.substring(plate.length() - 4);
    }

    public static String maskAccount(String accountNumber) {
        return "xxxxxx" + accountNumber.substring(accountNumber.length() - 4);
    }

    /** "ravi.kumar@okaxis" becomes "ra****@okaxis". */
    public static String maskUpi(String upiId) {
        int at = upiId.indexOf('@');
        return upiId.substring(0, Math.min(2, at)) + "****" + upiId.substring(at);
    }

    /**
     * The payout holder name matches the KYC name when both have the same words, in any order, after removing
     * accents, case, punctuation and the titles Mr, Mrs, Ms, Miss, Shri, Smt, Kumari and Dr. Initials stay words,
     * so "R Kumar" does not match "Ravi Kumar".
     */
    public static boolean sameName(String holderName, String kycName) {
        List<String> holder = nameWords(holderName);
        return !holder.isEmpty() && holder.equals(nameWords(kycName));
    }

    static List<String> nameWords(String name) {
        if (name == null) {
            return List.of();
        }
        String folded = Normalizer.normalize(name, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT);
        return Arrays.stream(folded.split("[^\\p{L}]+")).filter(word -> !word.isEmpty() && !HONORIFICS.contains(word))
            .sorted().toList();
    }

    /**
     * The rider status after a status event, or a refusal. A person always decides (this runs only for an admin's
     * request) and nothing here blocks anyone automatically.
     * SAFETY_PAUSE: ACTIVE to SUSPENDED now, with a review within 72 h. NOTICE: changes nothing, deadline at least
     * 7 days ahead. RESTORE: back to ACTIVE (also activates a PENDING rider). DEACTIVATE: after a safety pause, or
     * once an open notice's deadline has passed; never without one of them.
     *
     * @param openNoticeDeadline the deadline of the latest NOTICE not yet followed by RESTORE or DEACTIVATE, or null
     */
    public static String statusAfter(String kind, String current, Instant deadline, Instant reviewBy, String appealPhone,
                                     Instant openNoticeDeadline, Instant now) {
        if (!"RESTORE".equals(kind) && (appealPhone == null || appealPhone.isBlank())) {
            throw FleetApiException.unprocessable("APPEAL_PHONE_REQUIRED", "Add the phone number the rider can call to appeal.");
        }
        switch (kind) {
            case "SAFETY_PAUSE" -> {
                if (reviewBy == null || !reviewBy.isAfter(now) || reviewBy.isAfter(now.plus(SAFETY_REVIEW))) {
                    throw FleetApiException.unprocessable("REVIEW_BY_TOO_LATE", "The safety review must be within the next 72 hours.");
                }
                return require("ACTIVE".equals(current), "SUSPENDED");
            }
            case "NOTICE" -> {
                if (deadline == null || deadline.isBefore(now.plus(NOTICE_PERIOD))) {
                    throw FleetApiException.unprocessable("NOTICE_DEADLINE_TOO_SOON", "The notice deadline must be at least 7 days from now.");
                }
                return require("ACTIVE".equals(current) || "SUSPENDED".equals(current), current);
            }
            case "RESTORE" -> {
                boolean openNotice = openNoticeDeadline != null;
                return require(List.of("PENDING", "SUSPENDED", "DEACTIVATED").contains(current)
                    || ("ACTIVE".equals(current) && openNotice), "ACTIVE");
            }
            case "DEACTIVATE" -> {
                if ("SUSPENDED".equals(current)) {
                    return "DEACTIVATED";
                }
                if (!"ACTIVE".equals(current)) {
                    return require(false, null);
                }
                if (openNoticeDeadline == null || openNoticeDeadline.isAfter(now)) {
                    throw FleetApiException.unprocessable("NOTICE_REQUIRED",
                        "Send a notice and wait for its deadline, or pause the rider for a safety review first.");
                }
                return "DEACTIVATED";
            }
            default -> throw FleetApiException.invalid("Choose SAFETY_PAUSE, NOTICE, RESTORE or DEACTIVATE.");
        }
    }

    private static String require(boolean allowed, String after) {
        if (!allowed) {
            throw FleetApiException.conflict("INVALID_STATUS_TRANSITION", "This change does not apply to the rider's current status.");
        }
        return after;
    }
}

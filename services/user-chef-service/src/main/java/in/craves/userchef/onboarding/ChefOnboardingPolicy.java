package in.craves.userchef.onboarding;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.onboarding.ChefOnboardingDtos.Details;
import in.craves.userchef.onboarding.ChefOnboardingDtos.ProofKind;
import in.craves.userchef.web.ApiDtos.KycDocumentResponse;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.util.StringUtils;

public final class ChefOnboardingPolicy {
    private ChefOnboardingPolicy() {}
    public static final Set<String> LANGUAGES = Set.of(
        "en","as","bn","brx","doi","gu","hi","kn","ks","kok","mai","ml","mni",
        "mr","ne","or","pa","sa","sat","sd","ta","te","ur"
    );
    public static Set<KycDocumentType> required(ProofKind proof) {
        var types = new LinkedHashSet<KycDocumentType>();
        types.add(KycDocumentType.SELECTED_PROOF_FRONT);
        if (proof == ProofKind.AADHAAR || proof == ProofKind.OTHER_GOVERNMENT_ID)
            types.add(KycDocumentType.SELECTED_PROOF_BACK);
        types.add(KycDocumentType.KITCHEN_PHOTO_1);
        types.add(KycDocumentType.KITCHEN_PHOTO_2);
        types.add(KycDocumentType.FSSAI_LICENSE);
        return Set.copyOf(types);
    }
    public static boolean accepted(List<KycDocumentResponse> documents, KycDocumentType type) {
        return documents.stream().anyMatch(d -> d.documentType() == type &&
            ("UPLOADED".equals(d.status()) || "APPROVED".equals(d.status())));
    }
    public static boolean kitchenComplete(Details d) {
        return d != null && StringUtils.hasText(d.kitchenName()) &&
            StringUtils.hasText(d.addressLine1()) && StringUtils.hasText(d.city()) &&
            StringUtils.hasText(d.state()) && StringUtils.hasText(d.postalCode()) &&
            d.latitude() != null && d.longitude() != null;
    }
    public static String resume(Details d, List<KycDocumentResponse> docs, boolean submitted) {
        if (d == null || d.dateOfBirth() == null) return "personal";
        if (!kitchenComplete(d)) return "kitchen";
        if (!accepted(docs, KycDocumentType.KITCHEN_PHOTO_1) ||
            !accepted(docs, KycDocumentType.KITCHEN_PHOTO_2)) return "kitchen-photos";
        if (!StringUtils.hasText(d.fssaiNumber()) || !accepted(docs, KycDocumentType.FSSAI_LICENSE))
            return "fssai";
        if (d.proofKind() == null || !required(d.proofKind()).stream().allMatch(t -> accepted(docs,t)))
            return "documents";
        return submitted ? "waiting" : "review";
    }
    public static void validate(Details d) {
        if (d == null) throw ApiException.badRequest("ONBOARDING_DETAILS_REQUIRED","Complete your personal details.");
        requiredText(d.firstName(),100); requiredText(d.lastName(),100); requiredText(d.email(),255);
        if (d.dateOfBirth() == null || d.dateOfBirth().isAfter(LocalDate.now()) ||
            d.dateOfBirth().isBefore(LocalDate.of(1900,1,1)))
            throw ApiException.badRequest("DATE_OF_BIRTH_INVALID","Enter a valid date of birth.");
        optionalText(d.kitchenName(),160); optionalText(d.kitchenDescription(),1000);
        optionalText(d.addressLine1(),255); optionalText(d.addressLine2(),255); optionalText(d.landmark(),255);
        optionalText(d.city(),120); optionalText(d.state(),120); optionalText(d.otherGovernmentId(),80);
        if (StringUtils.hasText(d.postalCode()) && !d.postalCode().matches("[0-9]{6}"))
            throw ApiException.badRequest("PINCODE_INVALID","Enter a six-digit pincode.");
        if ((d.latitude() == null) != (d.longitude() == null) ||
            d.latitude() != null && (d.latitude().abs().compareTo(java.math.BigDecimal.valueOf(90)) > 0 ||
            d.longitude().abs().compareTo(java.math.BigDecimal.valueOf(180)) > 0))
            throw ApiException.badRequest("KITCHEN_COORDINATES_INVALID","Choose a valid kitchen location.");
        if (d.proofKind() == ProofKind.OTHER_GOVERNMENT_ID) requiredText(d.otherGovernmentId(),80);
        if (StringUtils.hasText(d.fssaiNumber()) && !d.fssaiNumber().matches("[0-9]{14}"))
            throw ApiException.badRequest("FSSAI_NUMBER_INVALID","Enter the 14-digit FSSAI registration or licence number.");
        if (d.language() == null || !LANGUAGES.contains(d.language()))
            throw ApiException.badRequest("LANGUAGE_INVALID","Choose a supported language.");
    }
    private static void requiredText(String value,int limit) {
        if (!StringUtils.hasText(value) || value.length() > limit)
            throw ApiException.badRequest("ONBOARDING_FIELD_INVALID","Complete the required fields within their length limits.");
    }
    private static void optionalText(String value,int limit) {
        if (value != null && value.length() > limit)
            throw ApiException.badRequest("ONBOARDING_FIELD_TOO_LONG","One of the details exceeds its length limit.");
    }
}

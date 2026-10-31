package in.craves.advanced.experiments;

import in.craves.advanced.experiments.ExperimentDtos.ExperimentVariant;
import in.craves.advanced.platform.web.ApiProblem;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Pure rules, unit-tested directly. */
final class ExperimentRules {
    /** Counts below this are reported as null: aggregate reports must not single out a handful of people. */
    static final int MIN_REPORTED = 5;
    static final int MAX_PROPERTY_TEXT = 100;
    static final int MAX_NUMBER_CHARS = 30;

    private ExperimentRules() { }

    /** Same person, same salt: always the same variant, on every replica, with nothing stored. */
    static String assign(UUID salt, UUID person, List<ExperimentVariant> variants) {
        long total = variants.stream().mapToLong(ExperimentVariant::weight).sum();
        long bucket = Long.remainderUnsigned(ByteBuffer.wrap(sha256(salt + ":" + person)).getLong(), total);
        for (ExperimentVariant variant : variants) {
            bucket -= variant.weight();
            if (bucket < 0) return variant.key();
        }
        throw new IllegalStateException("unreachable");
    }

    static void checkVariants(List<ExperimentVariant> variants) {
        if (new HashSet<>(variants.stream().map(ExperimentVariant::key).toList()).size() != variants.size()) {
            throw ApiProblem.badRequest("DUPLICATE_VARIANT", "Each variant needs its own key");
        }
    }

    /** Properties are flat: short text, numbers or true/false. Nested values could smuggle in anything. */
    static boolean validProperties(Map<String, Object> properties) {
        if (properties == null) return true;
        // Postgres jsonb refuses \u0000, which would fail the whole batch.
        return properties.values().stream().allMatch(value -> value instanceof Boolean
                || value instanceof Number number && number.toString().length() <= MAX_NUMBER_CHARS
                || value instanceof String text && text.length() <= MAX_PROPERTY_TEXT && text.indexOf('\0') < 0);
    }

    static Long suppress(long count) {
        return count < MIN_REPORTED ? null : count;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}

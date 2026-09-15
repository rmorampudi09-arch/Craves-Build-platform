package in.craves.referral.core;

import java.security.SecureRandom;

public final class ReferralCodes {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private ReferralCodes() { }
    public static String generate() {
        char[] value = new char[16];
        for (int i = 0; i < value.length; i++) value[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        return new String(value);
    }
    public static boolean valid(String code) { return code != null && code.matches("[2-9A-HJ-NP-Z]{16}"); }
}

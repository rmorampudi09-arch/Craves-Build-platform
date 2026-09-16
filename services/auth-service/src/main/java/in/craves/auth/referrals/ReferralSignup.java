package in.craves.auth.referrals;

/** Optional signup handoff. A raw referral code is deliberately not accepted here. */
public record ReferralSignup(String attributionToken,String termsVersion,Boolean termsAccepted) {
    public static ReferralSignup parse(com.fasterxml.jackson.databind.JsonNode value){
        if(value==null || !value.isObject())throw new IllegalArgumentException("REFERRAL_CONSENT_REQUIRED");
        var keys=new java.util.HashSet<String>();value.fieldNames().forEachRemaining(keys::add);
        if(!java.util.Set.of("attributionToken","termsVersion","termsAccepted").containsAll(keys)
            || !value.path("termsVersion").isTextual() || !value.path("termsAccepted").isBoolean()
            || (value.hasNonNull("attributionToken") && !value.path("attributionToken").isTextual()))throw new IllegalArgumentException("INVALID_REFERRAL_CONSENT");
        return new ReferralSignup(value.hasNonNull("attributionToken")?value.path("attributionToken").asText():null,value.path("termsVersion").asText(),value.path("termsAccepted").booleanValue());
    }
}

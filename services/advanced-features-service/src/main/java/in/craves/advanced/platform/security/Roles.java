package in.craves.advanced.platform.security;

import java.util.Set;

public final class Roles {
    public static final String CUSTOMER = "CUSTOMER";
    public static final String CHEF = "CHEF";
    public static final String PLATFORM_ADMIN = "PLATFORM_ADMIN";
    public static final String SUPPORT_ADMIN = "SUPPORT_ADMIN";
    public static final String CHEF_ADMIN = "CHEF_ADMIN";
    public static final String COMPLIANCE_ADMIN = "COMPLIANCE_ADMIN";
    public static final String OPERATIONS_ADMIN = "OPERATIONS_ADMIN";
    public static final String PAYMENTS_ADMIN = "PAYMENTS_ADMIN";
    public static final String AUDIT_ADMIN = "AUDIT_ADMIN";

    /** Roles any Craves service may put in a token; anything else is ignored. */
    public static final Set<String> KNOWN = Set.of(CUSTOMER, CHEF, "RIDER", PLATFORM_ADMIN, SUPPORT_ADMIN, PAYMENTS_ADMIN,
            OPERATIONS_ADMIN, CHEF_ADMIN, COMPLIANCE_ADMIN, "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", AUDIT_ADMIN);

    /** Internal staff roles whose live session is re-checked with Auth on every request. */
    public static final Set<String> ADMIN = Set.of(PLATFORM_ADMIN, SUPPORT_ADMIN, PAYMENTS_ADMIN, OPERATIONS_ADMIN, CHEF_ADMIN,
            COMPLIANCE_ADMIN, "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", AUDIT_ADMIN);

    private Roles() { }
}

package in.craves.referral.infra;

import java.util.Map;
import org.flywaydb.core.Flyway;

/** Separate migration entry point. Normal service startup NEVER applies DDL. */
public final class ReferralMigrate {
    private ReferralMigrate() { }
    public static void main(String[] args) {
        Map<String, String> env = System.getenv();
        if (!"CREATE_REFERRAL_SCHEMA_ONLY".equals(env.get("REFERRAL_MIGRATION_CONFIRM")))
            throw new IllegalStateException("Explicit referral migration confirmation required");
        String url = required(env, "REFERRAL_MIGRATION_DB_URL");
        String user = required(env, "REFERRAL_MIGRATION_DB_USER");
        String password = required(env, "REFERRAL_MIGRATION_DB_PASSWORD");
        if (!(url.startsWith("jdbc:postgresql://127.0.0.1:") || url.startsWith("jdbc:postgresql://localhost:"))
                && !url.contains("sslmode=verify-full"))
            throw new IllegalStateException("Remote migration requires verified PostgreSQL TLS");
        Flyway.configure().dataSource(url,user,password).schemas("referral_schema")
            .defaultSchema("referral_schema").table("referral_flyway_history")
            .locations("classpath:db/referral_migration").cleanDisabled(true).load().migrate();
        System.out.println("Referral schema migration complete; no activation performed.");
    }
    private static String required(Map<String,String> env, String name) {
        String value = env.get(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + name);
        return value;
    }
}

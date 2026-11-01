package in.craves.advanced.platform.module;

import java.util.List;

/**
 * One isolated feature: its own Postgres schema and Flyway history, its own switch
 * ({@code CRAVES_ADV_<ID>_ENABLED}, default on), its own API path prefixes and its own concurrency budget.
 *
 * @param id               kebab-case id, also the APIM API name suffix
 * @param schema           Postgres schema owned only by this module
 * @param pathPrefixes     API prefixes served by this module
 * @param publicGetPaths   Ant patterns readable without a token
 * @param publicPostPaths  Ant patterns writable without a token (keep empty unless the handbook says otherwise)
 */
public record FeatureModule(String id, String schema, List<String> pathPrefixes, List<String> publicGetPaths,
                            List<String> publicPostPaths) {
    public FeatureModule {
        if (!id.matches("[a-z][a-z0-9-]{1,38}")) throw new IllegalArgumentException("bad module id " + id);
        if (!schema.matches("adv_[a-z0-9_]{2,40}")) throw new IllegalArgumentException("bad schema " + schema);
        pathPrefixes = List.copyOf(pathPrefixes);
        publicGetPaths = List.copyOf(publicGetPaths);
        publicPostPaths = List.copyOf(publicPostPaths);
    }

    public String migrations() {
        return "classpath:db/advanced/" + schema.substring("adv_".length());
    }

    public String flagName() {
        return "CRAVES_ADV_" + id.toUpperCase().replace('-', '_') + "_ENABLED";
    }

    public boolean serves(String path) {
        return pathPrefixes.stream().anyMatch(prefix -> path.equals(prefix) || path.startsWith(prefix + "/"));
    }
}

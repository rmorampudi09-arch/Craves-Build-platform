package in.craves.advanced.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.dataformat.yaml.YAMLGenerator;
import in.craves.advanced.platform.module.FeatureModule;
import in.craves.advanced.support.IntegrationTestBase;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/**
 * The OpenAPI contract of every module, generated from the controllers and split by the module's path prefixes.
 * CI fails when a committed contract in contracts/openapi/advanced/ differs from the code;
 * regenerate with {@code ADV_WRITE_CONTRACTS=true mvn verify} and commit the files.
 */
@Import(ContractsIT.Docs.class)
@TestPropertySource(properties = {"advanced.api-docs-enabled=true", "springdoc.api-docs.version=openapi_3_0"})
class ContractsIT extends IntegrationTestBase {
    static final Path CONTRACTS = Path.of("../../contracts/openapi/advanced");

    @Autowired
    List<FeatureModule> modules;
    @Autowired
    ObjectMapper json;

    @TestConfiguration
    static class Docs {
        @Bean
        OpenAPI cravesAdvancedOpenApi() {
            return new OpenAPI().info(new Info().title("Craves advanced features").version("v1"))
                    .components(new Components().addSecuritySchemes("bearer",
                            new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                    .addSecurityItem(new SecurityRequirement().addList("bearer"));
        }
    }

    @Test
    void contractsMatchTheCode() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        JsonNode full = json.readTree(body);
        ObjectMapper yaml = new ObjectMapper(new YAMLFactory().disable(YAMLGenerator.Feature.WRITE_DOC_START_MARKER)
                .enable(YAMLGenerator.Feature.MINIMIZE_QUOTES)).enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        boolean write = "true".equals(System.getenv("ADV_WRITE_CONTRACTS"));
        List<String> drift = new ArrayList<>();
        List<FeatureModule> documented = new ArrayList<>(modules.stream().filter(m -> !m.id().equals("broken-feature")).toList());
        documented.add(new FeatureModule("advanced", "adv_platform", List.of("/api/v1/advanced"), List.of(), List.of()));
        for (FeatureModule module : documented) {
            ObjectNode contract = json.createObjectNode();
            contract.put("openapi", full.path("openapi").asText());
            ObjectNode info = contract.putObject("info");
            info.put("title", "Craves " + module.id() + " API");
            info.put("version", "v1");
            info.put("description", "Generated from services/advanced-features-service. Base URL https://api.craves.in. "
                    + "Errors: {timestamp, code, message, details, correlationId}. Feature switch: " + (module.id().equals("advanced")
                    ? "none" : module.flagName()) + ".");
            contract.putArray("servers").addObject().put("url", "https://api.craves.in");
            contract.set("security", full.path("security"));
            ObjectNode paths = contract.putObject("paths");
            Iterator<Map.Entry<String, JsonNode>> all = full.path("paths").fields();
            while (all.hasNext()) {
                Map.Entry<String, JsonNode> entry = all.next();
                if (module.serves(entry.getKey())) paths.set(entry.getKey(), entry.getValue());
            }
            ObjectNode components = contract.putObject("components");
            components.set("securitySchemes", full.path("components").path("securitySchemes"));
            ObjectNode schemas = components.putObject("schemas");
            for (String name : referencedSchemas(paths, full.path("components").path("schemas"))) {
                schemas.set(name, full.path("components").path("schemas").path(name));
            }
            String rendered = yaml.writeValueAsString(json.treeToValue(contract, Object.class));
            Path file = CONTRACTS.resolve(module.id() + "-v1.yaml");
            if (write) {
                Files.createDirectories(CONTRACTS);
                Files.writeString(file, rendered);
            } else if (!Files.exists(file) || !Files.readString(file).equals(rendered)) {
                drift.add(file.toString());
            }
        }
        String routes = routes(full, documented);
        Path routesFile = Path.of("../../infra/apim/advanced-features/routes.txt");
        if (write) {
            Files.writeString(routesFile, routes);
        } else if (!Files.exists(routesFile) || !Files.readString(routesFile).equals(routes)) {
            drift.add(routesFile.toString());
        }
        assertThat(drift).as("Contracts differ from the code; run ADV_WRITE_CONTRACTS=true mvn verify and commit them").isEmpty();
    }

    /** One APIM API per path prefix; one operation per path and method; policy from the module's public patterns. */
    static String routes(JsonNode full, List<FeatureModule> modules) {
        org.springframework.util.AntPathMatcher ant = new org.springframework.util.AntPathMatcher();
        StringBuilder out = new StringBuilder("# Generated by ContractsIT from the controllers. Do not edit; see README.md.\n"
                + "# api|api id|gateway path (= backend path)|display name|module\n"
                + "# route|api id|operation id|method|url template relative to the api path|policy (user, admin, public)\n");
        for (FeatureModule module : modules) {
            for (String prefix : module.pathPrefixes()) {
                String segment = prefix.substring(prefix.lastIndexOf('/') + 1);
                String apiId = "craves-adv-" + segment + "-v1";
                out.append("api|").append(apiId).append('|').append(prefix.substring(1)).append("|Craves ").append(segment)
                        .append(" v1|").append(module.id()).append('\n');
                List<String> lines = new ArrayList<>();
                Iterator<Map.Entry<String, JsonNode>> paths = full.path("paths").fields();
                while (paths.hasNext()) {
                    Map.Entry<String, JsonNode> path = paths.next();
                    String url = path.getKey();
                    if (!(url.equals(prefix) || url.startsWith(prefix + "/"))) continue;
                    Iterator<String> methods = path.getValue().fieldNames();
                    while (methods.hasNext()) {
                        String method = methods.next().toUpperCase();
                        if (!List.of("GET", "POST", "PUT", "PATCH", "DELETE").contains(method)) continue;
                        List<String> open = method.equals("GET") ? module.publicGetPaths() : method.equals("POST") ? module.publicPostPaths() : List.of();
                        boolean isPublic = open.stream().anyMatch(pattern -> ant.match(pattern, url))
                                || (method.equals("GET") && url.equals("/api/v1/advanced/features"));
                        boolean isAdmin = url.contains("/admin") || url.equals("/api/v1/advanced/modules");
                        String relative = url.substring(prefix.length());
                        if (relative.isEmpty()) relative = "/";
                        String operation = (method.toLowerCase() + "-" + segment + relative.replaceAll("[{}]", "").replaceAll("[^A-Za-z0-9]+", "-"))
                                .replaceAll("-+$", "");
                        lines.add("route|" + apiId + "|" + operation + "|" + method + "|" + relative + "|"
                                + (isPublic ? "public" : isAdmin ? "admin" : "user"));
                    }
                }
                lines.stream().sorted().forEach(line -> out.append(line).append('\n'));
            }
        }
        return out.toString();
    }

    private static Set<String> referencedSchemas(JsonNode root, JsonNode schemas) {
        Set<String> found = new LinkedHashSet<>();
        Deque<JsonNode> work = new ArrayDeque<>();
        work.push(root);
        while (!work.isEmpty()) {
            JsonNode node = work.pop();
            if (node.isObject()) {
                JsonNode ref = node.get("$ref");
                if (ref != null && ref.isTextual() && ref.asText().startsWith("#/components/schemas/")) {
                    String name = ref.asText().substring("#/components/schemas/".length());
                    if (found.add(name) && schemas.has(name)) work.push(schemas.get(name));
                }
                node.elements().forEachRemaining(work::push);
            } else if (node.isArray()) {
                node.elements().forEachRemaining(work::push);
            }
        }
        return found;
    }
}

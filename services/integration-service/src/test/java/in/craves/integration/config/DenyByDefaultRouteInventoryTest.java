package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

// CH-03: the security chain now ends in denyAll; every live controller route must sit under an explicit rule.
class DenyByDefaultRouteInventoryTest {
    private static final String BASE_PACKAGE = "in.craves.integration";
    private static final List<String> EXPLICIT_PREFIXES = List.of("/api/", "/internal/");

    @Test
    void everyControllerRouteIsCoveredByAnExplicitRule() throws Exception {
        List<String> routes = new ArrayList<>();
        List<String> uncovered = new ArrayList<>();
        for (Class<?> type : ScheduledJobsUseNamedPoolsTest.classesUnder(BASE_PACKAGE)) {
            if (!AnnotatedElementUtils.hasAnnotation(type, Controller.class)) {
                continue;
            }
            RequestMapping typeMapping = AnnotatedElementUtils.findMergedAnnotation(type, RequestMapping.class);
            String[] prefixes = typeMapping == null || typeMapping.path().length == 0 ? new String[] {""} : typeMapping.path();
            for (Method method : type.getDeclaredMethods()) {
                RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                if (mapping == null) {
                    continue;
                }
                String[] suffixes = mapping.path().length == 0 ? new String[] {""} : mapping.path();
                for (String prefix : prefixes) {
                    for (String suffix : suffixes) {
                        String route = prefix + suffix;
                        routes.add(route);
                        if (EXPLICIT_PREFIXES.stream().noneMatch(route::startsWith)) {
                            uncovered.add(type.getSimpleName() + " " + route);
                        }
                    }
                }
            }
        }
        assertThat(routes).isNotEmpty();
        assertThat(uncovered).as("routes the deny-by-default rule would block").isEmpty();
    }
}

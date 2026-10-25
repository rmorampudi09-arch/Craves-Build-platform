package in.craves.order.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;

// CH-01 regression: a job on the shared default scheduler lets one slow worker freeze every other worker.
class ScheduledJobsUseNamedPoolsTest {
    private static final String BASE_PACKAGE = "in.craves.order";

    @Test
    void everyScheduledJobRunsOnADeclaredWorkerPool() throws Exception {
        Set<String> pools = new TreeSet<>();
        Map<String, String> jobs = new TreeMap<>();
        for (Class<?> type : classesUnder(BASE_PACKAGE)) {
            for (Method method : type.getDeclaredMethods()) {
                Bean bean = method.getAnnotation(Bean.class);
                if (bean != null && TaskScheduler.class.isAssignableFrom(method.getReturnType())) {
                    pools.addAll(bean.name().length == 0 ? List.of(method.getName()) : List.of(bean.name()));
                }
                for (Scheduled scheduled : AnnotatedElementUtils.findMergedRepeatableAnnotations(method, Scheduled.class)) {
                    jobs.put(type.getName() + "#" + method.getName(), scheduled.scheduler());
                }
            }
        }

        assertThat(jobs).isNotEmpty();
        assertThat(jobs).allSatisfy((job, scheduler) ->
            assertThat(scheduler).as("%s must name a declared scheduler pool", job).isIn(pools));
    }

    // Reads the class files directly: a component scan applies @ConditionalOnProperty and would hide those classes' pools and routes.
    static List<Class<?>> classesUnder(String basePackage) throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        CachingMetadataReaderFactory readers = new CachingMetadataReaderFactory(resolver);
        List<Class<?>> classes = new ArrayList<>();
        ClassLoader loader = ScheduledJobsUseNamedPoolsTest.class.getClassLoader();
        for (Resource resource : resolver.getResources("classpath*:" + basePackage.replace('.', '/') + "/**/*.class")) {
            classes.add(Class.forName(readers.getMetadataReader(resource).getClassMetadata().getClassName(), false, loader));
        }
        return classes;
    }
}

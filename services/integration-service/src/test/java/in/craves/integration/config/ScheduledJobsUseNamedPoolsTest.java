package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;

// CH-01 regression: a job on the shared default scheduler lets one slow worker freeze every other worker.
class ScheduledJobsUseNamedPoolsTest {
    private static final String BASE_PACKAGE = "in.craves.integration";

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

    static List<Class<?>> classesUnder(String basePackage) throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
                return true;
            }
        };
        scanner.addIncludeFilter((reader, factory) -> true);
        List<Class<?>> classes = new ArrayList<>();
        ClassLoader loader = ScheduledJobsUseNamedPoolsTest.class.getClassLoader();
        for (BeanDefinition definition : scanner.findCandidateComponents(basePackage)) {
            classes.add(Class.forName(definition.getBeanClassName(), false, loader));
        }
        return classes;
    }
}

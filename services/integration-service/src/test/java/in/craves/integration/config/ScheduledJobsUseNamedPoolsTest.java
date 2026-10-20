package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
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
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

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

    // A fixed-delay job never overlaps itself, so one thread per job keeps each job's timing without waiting on another.
    @Test
    void everyJobHasItsOwnThreadOnAPoolTheLagWatchdogSees() throws Exception {
        Map<String, ThreadPoolTaskScheduler> pools = new TreeMap<>();
        Map<String, Integer> jobs = new TreeMap<>();
        for (Class<?> type : classesUnder(BASE_PACKAGE)) {
            for (Method method : type.getDeclaredMethods()) {
                Bean bean = method.getAnnotation(Bean.class);
                if (bean != null && method.getParameterCount() == 0
                    && ThreadPoolTaskScheduler.class.isAssignableFrom(method.getReturnType())) {
                    Constructor<?> constructor = type.getDeclaredConstructor();
                    constructor.setAccessible(true);
                    method.setAccessible(true);
                    ThreadPoolTaskScheduler pool = (ThreadPoolTaskScheduler) method.invoke(constructor.newInstance());
                    for (String name : bean.name().length == 0 ? List.of(method.getName()) : List.of(bean.name())) {
                        pools.put(name, pool);
                    }
                }
                for (Scheduled scheduled : AnnotatedElementUtils.findMergedRepeatableAnnotations(method, Scheduled.class)) {
                    jobs.merge(scheduled.scheduler(), 1, Integer::sum);
                }
            }
        }

        assertThat(jobs).allSatisfy((name, count) -> {
            assertThat(pools).as("%s must be a worker pool bean without parameters", name).containsKey(name);
            assertThat(pools.get(name).getPoolSize()).as("threads in %s", name).isGreaterThanOrEqualTo(count);
            if (!name.equals(WorkerSchedulingConfiguration.MONITOR_SCHEDULER)) {
                assertThat(pools.get(name)).as("%s must be watched by SchedulerLagWatchdog", name)
                    .isInstanceOf(SchedulerLagWatchdog.MonitoredTaskScheduler.class);
            }
        });
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

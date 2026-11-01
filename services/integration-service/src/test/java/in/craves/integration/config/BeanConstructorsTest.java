package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;

// A bean with two constructors and no @Autowired fails at startup ("No default constructor found"); only the compiler ran here.
class BeanConstructorsTest {
    @Test
    void everyBeanWithSeveralConstructorsMarksTheOneSpringUses() throws Exception {
        for (Class<?> type : ScheduledJobsUseNamedPoolsTest.classesUnder("in.craves.integration")) {
            Constructor<?>[] constructors = type.getDeclaredConstructors();
            if (!AnnotatedElementUtils.hasAnnotation(type, Component.class) || constructors.length < 2) {
                continue;
            }
            assertThat(Arrays.stream(constructors).anyMatch(c -> c.isAnnotationPresent(Autowired.class) || c.getParameterCount() == 0))
                .as("%s has %d constructors; put @Autowired on the one Spring should use", type.getName(), constructors.length)
                .isTrue();
        }
    }
}

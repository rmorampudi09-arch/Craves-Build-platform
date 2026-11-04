package in.craves.auth.deletion;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** One thread and a bounded queue for deletion notices: a notification-service that hangs must never hold a request thread. */
@Configuration(proxyBeanMethods = false)
class DeletionNoticeExecutorConfiguration {
    static final String NAME = "deletionNoticeExecutor";
    private static final int QUEUE_SIZE = 100;

    // A full queue throws RejectedExecutionException (AbortPolicy): the caller logs the request id and drops the notice.
    @Bean(name = NAME)
    ThreadPoolExecutor deletionNoticeExecutor() {
        return new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(QUEUE_SIZE), runnable -> {
            Thread thread = new Thread(runnable, "deletion-notices");
            thread.setDaemon(true);
            return thread;
        });
    }
}

package in.craves.integration.delivery.status;

import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

/**
 * CRAVES_DELIVERY_WEBHOOK_VERIFY_FETCH shadow or enforce only: one thread of Pidge's own on which DeliveryWebhookProcessor
 * reads a booking back from Pidge, so a slow Pidge holds up no other courier's callbacks. Off, this bean and its thread
 * do not exist.
 */
@Component
@ConditionalOnExpression(
    "'${craves.delivery-command.webhook-verify-fetch:off}'.trim().toLowerCase() matches 'shadow|enforce'")
public class PidgeCallbackReadBack implements DisposableBean {
    /** Small, so that a queued callback is reached well inside the shortest webhook lease (1 minute) at 8 s a read. */
    static final int QUEUE = 5;
    private final Function<String, ProviderDelivery> read;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(QUEUE),
        task -> {
            Thread thread = new Thread(task, "pidge-webhook-read-back");
            thread.setDaemon(true);
            return thread;
        });

    @Autowired
    public PidgeCallbackReadBack(PidgeApiClient pidge) {
        this(pidge::readBack);
    }

    PidgeCallbackReadBack(Function<String, ProviderDelivery> read) {
        this.read = read;
    }

    /** False when the queue is full or the bean is stopping: the task was not taken. */
    boolean submit(Runnable task) {
        try {
            executor.execute(task);
            return true;
        } catch (RejectedExecutionException full) {
            return false;
        }
    }

    ProviderDelivery read(String providerOrderId) {
        return read.apply(providerOrderId);
    }

    /** Lets the callbacks already taken finish; one still running after 10 seconds is interrupted and its lease expires. */
    @Override
    public void destroy() throws InterruptedException {
        executor.shutdown();
        if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
            executor.shutdownNow();
        }
    }
}

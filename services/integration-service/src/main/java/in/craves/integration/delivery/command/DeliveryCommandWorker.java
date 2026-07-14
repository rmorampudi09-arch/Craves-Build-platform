package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandCompletionService.CompletionReceipt;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryRoutingException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class DeliveryCommandWorker {
    private final DeliveryCommandRepository commands;
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryProviderRouter router;
    private final DeliveryCommandCompletionService completionService;
    private final DeliveryCommandProperties properties;

    public DeliveryCommandWorker(DeliveryCommandRepository commands,
                                 DeliveryJobRepository deliveryJobs,
                                 DeliveryProviderRouter router,
                                 DeliveryCommandCompletionService completionService,
                                 DeliveryCommandProperties properties) {
        this.commands = commands;
        this.deliveryJobs = deliveryJobs;
        this.router = router;
        this.completionService = completionService;
        this.properties = properties;
    }

    public WorkerReceipt process(DeliveryCommandMessage message) {
        if (message == null || message.commandId() == null || message.chefSubOrderId() == null) {
            throw new DeliveryCommandNonRetryableException("Delivery command identity is missing");
        }

        Optional<CommandRecord> claimed = commands.claim(
            message.commandId(), properties.getMaxDeliveryAttempts()
        );
        if (claimed.isEmpty()) {
            return handleUnclaimed(message.commandId(), message.chefSubOrderId());
        }

        CommandRecord command = claimed.get();
        Optional<UUID> existingJob = deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId());
        if (existingJob.isPresent()) {
            commands.markCompleted(message.commandId());
            return new WorkerReceipt(existingJob.get(), true, "ALREADY_COMPLETED");
        }

        try {
            RoutingResult routingResult = router.route(command.message());
            CompletionReceipt receipt = completionService.complete(command.message(), routingResult);
            return new WorkerReceipt(
                receipt.deliveryJobId(), receipt.duplicate(), routingResult.providerId()
            );
        } catch (DeliveryRoutingException ex) {
            handleFailure(command, ex);
            throw new DeliveryCommandTransientException(ex.getMessage(), ex);
        } catch (RuntimeException ex) {
            handleFailure(command, ex);
            throw new DeliveryCommandTransientException("Delivery command processing failed", ex);
        }
    }

    private WorkerReceipt handleUnclaimed(UUID commandId, UUID chefSubOrderId) {
        Optional<CommandRecord> current = commands.findById(commandId);
        if (current.isEmpty()) {
            throw new DeliveryCommandNonRetryableException("Delivery command does not exist in the database");
        }
        CommandRecord command = current.get();
        if ("COMPLETED".equals(command.status())) {
            UUID deliveryJobId = deliveryJobs.findIdByChefSubOrderId(chefSubOrderId)
                .orElseThrow(() -> new DeliveryCommandNonRetryableException(
                    "Completed delivery command has no delivery job"
                ));
            return new WorkerReceipt(deliveryJobId, true, "ALREADY_COMPLETED");
        }
        if ("DEAD_LETTER".equals(command.status())
            || command.attemptCount() >= properties.getMaxDeliveryAttempts()) {
            commands.markDeadLetter(commandId, "Delivery command attempt limit exhausted");
            throw new DeliveryCommandNonRetryableException(
                "Delivery command attempt limit exhausted"
            );
        }
        throw new DeliveryCommandTransientException(
            "Delivery command is currently being processed or is not claimable"
        );
    }

    private void handleFailure(CommandRecord command, RuntimeException error) {
        String message = safeMessage(error);
        if (command.attemptCount() >= properties.getMaxDeliveryAttempts()) {
            commands.markDeadLetter(command.id(), message);
            throw new DeliveryCommandNonRetryableException(
                "Delivery command exhausted its retry budget: " + message,
                error
            );
        }
        commands.markFailed(command.id(), message);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    public record WorkerReceipt(UUID deliveryJobId, boolean duplicate, String providerId) {}

    public static class DeliveryCommandTransientException extends RuntimeException {
        public DeliveryCommandTransientException(String message) {
            super(message);
        }

        public DeliveryCommandTransientException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static class DeliveryCommandNonRetryableException extends RuntimeException {
        public DeliveryCommandNonRetryableException(String message) {
            super(message);
        }

        public DeliveryCommandNonRetryableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

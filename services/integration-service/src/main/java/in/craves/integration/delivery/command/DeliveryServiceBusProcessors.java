package in.craves.integration.delivery.command;

import com.azure.messaging.servicebus.ServiceBusProcessorClient;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.azure.messaging.servicebus.models.ServiceBusReceiveMode;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandScheduler.DeliveryMessageValidationException;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandNonRetryableException;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandTransientException;
import in.craves.integration.delivery.command.DeliveryServiceBusConfiguration.DeliveryServiceBusClientFactory;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "craves.delivery-command", name = "enabled", havingValue = "true")
public class DeliveryServiceBusProcessors {
    private static final Logger log = LoggerFactory.getLogger(DeliveryServiceBusProcessors.class);

    private final DeliveryCommandScheduler scheduler;
    private final DeliveryCommandWorker worker;
    private final DeliveryCommandProperties properties;
    private final ObjectMapper objectMapper;
    private final ServiceBusProcessorClient chefAcceptedProcessor;
    private final ServiceBusProcessorClient commandProcessor;

    public DeliveryServiceBusProcessors(DeliveryServiceBusClientFactory factory,
                                        DeliveryCommandScheduler scheduler,
                                        DeliveryCommandWorker worker,
                                        DeliveryCommandProperties properties,
                                        ObjectMapper objectMapper) {
        this.scheduler = scheduler;
        this.worker = worker;
        this.properties = properties;
        this.objectMapper = objectMapper;

        this.chefAcceptedProcessor = factory.newBuilder()
            .processor()
            .topicName(properties.getTopicName())
            .subscriptionName(properties.getChefAcceptedSubscriptionName())
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .disableAutoComplete()
            .maxConcurrentCalls(properties.getMaxConcurrentMessages())
            .prefetchCount(properties.getPrefetchCount())
            .maxAutoLockRenewDuration(properties.maxAutoLockRenewDuration())
            .processMessage(this::processChefAccepted)
            .processError(context -> log.error(
                "Service Bus chef-accepted processor error from {} / {}",
                context.getFullyQualifiedNamespace(), context.getEntityPath(), context.getException()
            ))
            .buildProcessorClient();

        this.commandProcessor = factory.newBuilder()
            .processor()
            .queueName(properties.getQueueName())
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .disableAutoComplete()
            .maxConcurrentCalls(properties.getMaxConcurrentMessages())
            .prefetchCount(properties.getPrefetchCount())
            .maxAutoLockRenewDuration(properties.maxAutoLockRenewDuration())
            .processMessage(this::processDeliveryCommand)
            .processError(context -> log.error(
                "Service Bus delivery-command processor error from {} / {}",
                context.getFullyQualifiedNamespace(), context.getEntityPath(), context.getException()
            ))
            .buildProcessorClient();
    }

    @PostConstruct
    void start() {
        chefAcceptedProcessor.start();
        commandProcessor.start();
        log.info(
            "Delivery Service Bus processors started: topic={}, subscription={}, queue={}",
            properties.getTopicName(),
            properties.getChefAcceptedSubscriptionName(),
            properties.getQueueName()
        );
    }

    private void processChefAccepted(ServiceBusReceivedMessageContext context) {
        try {
            String rawBody = context.getMessage().getBody().toString();
            JavaType eventType = objectMapper.getTypeFactory().constructParametricType(
                EventEnvelope.class, ChefAcceptedOrderData.class
            );
            EventEnvelope<ChefAcceptedOrderData> event = objectMapper.readValue(rawBody, eventType);
            scheduler.schedule(event);
            context.complete();
        } catch (DeliveryMessageValidationException | IllegalArgumentException ex) {
            deadLetter(context, "INVALID_CHEF_ACCEPTED_EVENT", ex);
        } catch (Exception ex) {
            retryOrDeadLetter(context, "CHEF_ACCEPTED_SCHEDULING_FAILED", ex);
        }
    }

    private void processDeliveryCommand(ServiceBusReceivedMessageContext context) {
        try {
            String rawBody = context.getMessage().getBody().toString();
            DeliveryCommandMessage message = objectMapper.readValue(rawBody, DeliveryCommandMessage.class);
            worker.process(message);
            context.complete();
        } catch (DeliveryCommandNonRetryableException | IllegalArgumentException ex) {
            deadLetter(context, "DELIVERY_COMMAND_NON_RETRYABLE", ex);
        } catch (DeliveryCommandTransientException ex) {
            retryOrDeadLetter(context, "DELIVERY_COMMAND_RETRY_EXHAUSTED", ex);
        } catch (Exception ex) {
            retryOrDeadLetter(context, "DELIVERY_COMMAND_UNEXPECTED_FAILURE", ex);
        }
    }

    private void retryOrDeadLetter(ServiceBusReceivedMessageContext context,
                                   String reason,
                                   Exception error) {
        long deliveryCount = context.getMessage().getDeliveryCount();
        if (deliveryCount >= properties.getMaxDeliveryAttempts()) {
            deadLetter(context, reason, error);
            return;
        }
        log.warn(
            "Abandoning Service Bus message {} after delivery count {}: {}",
            context.getMessage().getMessageId(), deliveryCount, safeMessage(error)
        );
        context.abandon();
    }

    private void deadLetter(ServiceBusReceivedMessageContext context,
                            String reason,
                            Exception error) {
        log.error(
            "Dead-lettering Service Bus message {}: {} - {}",
            context.getMessage().getMessageId(), reason, safeMessage(error)
        );
        context.deadLetter(new DeadLetterOptions()
            .setDeadLetterReason(reason)
            .setDeadLetterErrorDescription(safeMessage(error)));
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    @PreDestroy
    void close() {
        chefAcceptedProcessor.close();
        commandProcessor.close();
    }
}

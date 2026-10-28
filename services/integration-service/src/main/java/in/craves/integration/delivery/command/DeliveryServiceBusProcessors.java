package in.craves.integration.delivery.command;

import com.azure.messaging.servicebus.ServiceBusMessage;
import com.azure.messaging.servicebus.ServiceBusProcessorClient;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.azure.messaging.servicebus.models.ServiceBusReceiveMode;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderHandedOverData;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderReadyForPickupData;
import in.craves.integration.delivery.command.DeliveryCommandScheduler.DeliveryMessageValidationException;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandNonRetryableException;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandTransientException;
import in.craves.integration.delivery.command.DeliveryServiceBusConfiguration.DeliveryServiceBusClientFactory;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
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
    private final ServiceBusSenderClient commandRetrySender;
    private final ServiceBusProcessorClient chefAcceptedProcessor;
    private final ServiceBusProcessorClient commandProcessor;
    private final FleetStage fleetStage;

    public DeliveryServiceBusProcessors(DeliveryServiceBusClientFactory factory,
                                        DeliveryCommandScheduler scheduler,
                                        DeliveryCommandWorker worker,
                                        DeliveryCommandProperties properties,
                                        ObjectMapper objectMapper,
                                        @Qualifier("deliveryCommandSender")
                                        ServiceBusSenderClient commandRetrySender,
                                        java.util.Optional<FleetStage> fleetStage) {
        this.fleetStage = fleetStage.orElse(null);
        this.scheduler = scheduler;
        this.worker = worker;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.commandRetrySender = commandRetrySender;

        this.chefAcceptedProcessor = factory.newBuilder()
            .processor()
            .topicName(properties.getTopicName())
            .subscriptionName(properties.getChefAcceptedSubscriptionName())
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .disableAutoComplete()
            .maxConcurrentCalls(properties.getMaxConcurrentMessages())
            .prefetchCount(properties.getPrefetchCount())
            .maxAutoLockRenewDuration(properties.maxAutoLockRenewDuration())
            .processMessage(this::processDeliveryDomainEvent)
            .processError(context -> log.error(
                "Service Bus delivery-domain processor error from {} / {}",
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

    private void processDeliveryDomainEvent(ServiceBusReceivedMessageContext context) {
        try {
            String rawBody = context.getMessage().getBody().toString();
            Object property = context.getMessage().getApplicationProperties().get("event_type");
            String eventType = property == null ? context.getMessage().getSubject() : property.toString();

            if (DeliveryCommandModels.ORDER_READY_FOR_PICKUP.equals(eventType)) {
                JavaType readyType = objectMapper.getTypeFactory().constructParametricType(
                    EventEnvelope.class, OrderReadyForPickupData.class
                );
                EventEnvelope<OrderReadyForPickupData> event = objectMapper.readValue(rawBody, readyType);
                recordChefReady(event);
                scheduler.accelerateReadyForPickup(event);
                context.complete();
                return;
            }
            if (DeliveryCommandModels.ORDER_HANDED_OVER.equals(eventType)) {
                JavaType handedOverType = objectMapper.getTypeFactory().constructParametricType(
                    EventEnvelope.class, OrderHandedOverData.class
                );
                recordHandedOver(objectMapper.readValue(rawBody, handedOverType));
                context.complete();
                return;
            }

            JavaType acceptedType = objectMapper.getTypeFactory().constructParametricType(
                EventEnvelope.class, ChefAcceptedOrderData.class
            );
            EventEnvelope<ChefAcceptedOrderData> event = objectMapper.readValue(rawBody, acceptedType);
            scheduler.schedule(event);
            context.complete();
        } catch (DeliveryMessageValidationException | IllegalArgumentException ex) {
            deadLetter(context, "INVALID_DELIVERY_DOMAIN_EVENT", ex);
        } catch (Exception ex) {
            retryOrDeadLetter(context, "DELIVERY_DOMAIN_EVENT_PROCESSING_FAILED", ex);
        }
    }

    // The rider's free wait starts at the chef's ready time; a fleet failure here never holds up the courier.
    private void recordChefReady(EventEnvelope<OrderReadyForPickupData> event) {
        if (fleetStage == null || event == null || event.data() == null || event.data().chefSubOrderId() == null) {
            return;
        }
        try {
            fleetStage.chefReady(event.data().chefSubOrderId(),
                event.data().readyAt() != null ? event.data().readyAt() : event.occurredAt());
        } catch (RuntimeException ex) {
            log.warn("Craves rider chef-ready time not recorded chefSubOrderId={}", event.data().chefSubOrderId(), ex);
        }
    }

    // The rider holds the food once the chef hands it over, so the fleet watchdog keeps the trip with them (P2-05). A
    // failure retries the message (the caller's catch): nothing else rides on it.
    private void recordHandedOver(EventEnvelope<OrderHandedOverData> event) {
        if (fleetStage == null || event == null || event.data() == null || event.data().chefSubOrderId() == null) {
            return;
        }
        fleetStage.chefHandedOver(event.data().chefSubOrderId(),
            event.data().handedOverAt() != null ? event.data().handedOverAt() : event.occurredAt());
    }

    private void processDeliveryCommand(ServiceBusReceivedMessageContext context) {
        String rawBody = context.getMessage().getBody().toString();
        try {
            DeliveryCommandMessage message = objectMapper.readValue(rawBody, DeliveryCommandMessage.class);
            worker.process(message);
            context.complete();
        } catch (DeliveryCommandNonRetryableException | IllegalArgumentException ex) {
            deadLetter(context, "DELIVERY_COMMAND_NON_RETRYABLE", ex);
        } catch (DeliveryCommandTransientException ex) {
            scheduleDeliveryRetry(context, rawBody, ex);
        } catch (Exception ex) {
            retryOrDeadLetter(context, "DELIVERY_COMMAND_UNEXPECTED_FAILURE", ex);
        }
    }

    private void scheduleDeliveryRetry(ServiceBusReceivedMessageContext context,
                                       String rawBody,
                                       DeliveryCommandTransientException error) {
        Instant retryAt = error.retryAt();
        if (retryAt == null || !retryAt.isAfter(Instant.now())) {
            retryAt = Instant.now().plusSeconds(1);
        }

        String retryKey = error.retryKey();
        if (retryKey == null || retryKey.isBlank()) {
            retryKey = context.getMessage().getMessageId() + "-retry";
        }

        ServiceBusMessage retryMessage = new ServiceBusMessage(rawBody)
            .setContentType("application/json")
            .setMessageId("delivery-retry:" + retryKey);

        try {
            long sequenceNumber = commandRetrySender.scheduleMessage(
                retryMessage,
                retryAt.atOffset(ZoneOffset.UTC)
            );
            log.warn(
                "Scheduled delivery-command retry messageId={} retryAt={} sequenceNumber={} reason={}",
                retryMessage.getMessageId(), retryAt, sequenceNumber, safeMessage(error)
            );
            context.complete();
        } catch (Exception scheduleError) {
            log.error(
                "Failed to schedule delivery-command retry for messageId={} retryAt={}; abandoning original message",
                context.getMessage().getMessageId(), retryAt, scheduleError
            );
            context.abandon();
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

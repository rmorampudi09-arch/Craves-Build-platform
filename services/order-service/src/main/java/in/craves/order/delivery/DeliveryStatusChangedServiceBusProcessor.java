package in.craves.order.delivery;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.messaging.servicebus.ServiceBusClientBuilder;
import com.azure.messaging.servicebus.ServiceBusProcessorClient;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.azure.messaging.servicebus.models.ServiceBusReceiveMode;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.config.DeliveryStatusConsumerProperties;
import in.craves.order.delivery.DeliveryStatusEventValidator.DeliveryStatusValidationException;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.delivery.DeliveryStatusUpdateService.DeliveryStatusRetryableException;
import in.craves.order.delivery.DeliveryTelemetryEventValidator.DeliveryTelemetryValidationException;
import in.craves.order.delivery.DeliveryTelemetryModels.DeliveryTelemetryUpdatedData;
import in.craves.order.delivery.DeliveryTelemetryUpdateService.DeliveryTelemetryRetryableException;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConditionalOnProperty(
    prefix = "craves.delivery-status-consumer",
    name = "enabled",
    havingValue = "true"
)
public class DeliveryStatusChangedServiceBusProcessor {
    private static final Logger LOGGER = LoggerFactory.getLogger(
        DeliveryStatusChangedServiceBusProcessor.class
    );
    private static final String STATUS_EVENT = "DELIVERY_STATUS_CHANGED";
    private static final String TELEMETRY_EVENT = "DELIVERY_TELEMETRY_UPDATED";

    private final DeliveryStatusUpdateService updateService;
    private final DeliveryTelemetryUpdateService telemetryUpdateService;
    private final DeliveryStatusConsumerProperties properties;
    private final ObjectMapper objectMapper;
    private final ServiceBusProcessorClient processorClient;

    public DeliveryStatusChangedServiceBusProcessor(
        DeliveryStatusUpdateService updateService,
        DeliveryTelemetryUpdateService telemetryUpdateService,
        DeliveryStatusConsumerProperties properties,
        ObjectMapper objectMapper
    ) {
        this.updateService = updateService;
        this.telemetryUpdateService = telemetryUpdateService;
        this.properties = properties;
        this.objectMapper = objectMapper;
        validateConfiguration(properties);

        ServiceBusClientBuilder builder = new ServiceBusClientBuilder();
        if (StringUtils.hasText(properties.getConnectionString())) {
            builder.connectionString(properties.getConnectionString());
        } else {
            builder.credential(
                properties.getFullyQualifiedNamespace(),
                new DefaultAzureCredentialBuilder().build()
            );
        }

        this.processorClient = builder
            .processor()
            .topicName(properties.getTopicName())
            .subscriptionName(properties.getSubscriptionName())
            .receiveMode(ServiceBusReceiveMode.PEEK_LOCK)
            .disableAutoComplete()
            .maxConcurrentCalls(properties.validatedMaxConcurrentMessages())
            .prefetchCount(properties.validatedPrefetchCount())
            .maxAutoLockRenewDuration(properties.maxAutoLockRenewDuration())
            .processMessage(this::processMessage)
            .processError(context -> LOGGER.error(
                "Delivery status/telemetry Service Bus processor error entityPath={}",
                context.getEntityPath(),
                context.getException()
            ))
            .buildProcessorClient();
    }

    @PostConstruct
    void start() {
        processorClient.start();
        LOGGER.info(
            "Delivery status/telemetry processor started topic={} subscription={}",
            properties.getTopicName(),
            properties.getSubscriptionName()
        );
    }

    private void processMessage(ServiceBusReceivedMessageContext context) {
        try {
            String rawPayload = context.getMessage().getBody().toString();
            JsonNode root = objectMapper.readTree(rawPayload);
            String eventName = root.path("eventType").asText(null);
            if (!StringUtils.hasText(eventName)) {
                eventName = root.path("event_type").asText(null);
            }

            if (STATUS_EVENT.equals(eventName)) {
                processStatus(context, rawPayload);
                return;
            }
            if (TELEMETRY_EVENT.equals(eventName)) {
                processTelemetry(context, rawPayload);
                return;
            }
            deadLetter(
                context,
                "INVALID_DELIVERY_EVENT_TYPE",
                new DeliveryStatusValidationException("Unexpected delivery event type")
            );
        } catch (DeliveryStatusValidationException | DeliveryTelemetryValidationException exception) {
            deadLetter(context, "INVALID_DELIVERY_EVENT", exception);
        } catch (DeliveryStatusRetryableException | DeliveryTelemetryRetryableException exception) {
            retryOrDeadLetter(context, "DELIVERY_PROJECTION_NOT_READY", exception);
        } catch (Exception exception) {
            retryOrDeadLetter(context, "DELIVERY_EVENT_PROCESSING_FAILED", exception);
        }
    }

    private void processStatus(ServiceBusReceivedMessageContext context, String rawPayload) throws Exception {
        JavaType eventType = objectMapper.getTypeFactory().constructParametricType(
            EventEnvelope.class,
            DeliveryStatusChangedData.class
        );
        EventEnvelope<DeliveryStatusChangedData> event = objectMapper.readValue(
            rawPayload,
            eventType
        );
        DeliveryStatusUpdateService.ProcessingResult result = updateService.accept(
            event,
            rawPayload
        );
        context.complete();
        LOGGER.info(
            "DELIVERY_STATUS_CHANGED completed messageId={} eventId={} result={}",
            context.getMessage().getMessageId(),
            event.eventId(),
            result.result()
        );
    }

    private void processTelemetry(ServiceBusReceivedMessageContext context, String rawPayload) throws Exception {
        JavaType eventType = objectMapper.getTypeFactory().constructParametricType(
            DeliveryTelemetryModels.EventEnvelope.class,
            DeliveryTelemetryUpdatedData.class
        );
        DeliveryTelemetryModels.EventEnvelope<DeliveryTelemetryUpdatedData> event = objectMapper.readValue(
            rawPayload,
            eventType
        );
        DeliveryTelemetryUpdateService.ProcessingResult result = telemetryUpdateService.accept(event);
        context.complete();
        LOGGER.info(
            "DELIVERY_TELEMETRY_UPDATED completed messageId={} eventId={} result={}",
            context.getMessage().getMessageId(),
            event.eventId(),
            result.result()
        );
    }

    private void retryOrDeadLetter(
        ServiceBusReceivedMessageContext context,
        String reason,
        Exception exception
    ) {
        long deliveryCount = context.getMessage().getDeliveryCount();
        if (deliveryCount >= properties.validatedMaxDeliveryAttempts()) {
            deadLetter(context, reason, exception);
            return;
        }
        LOGGER.warn(
            "Delivery event will be retried messageId={} deliveryCount={} reason={}",
            context.getMessage().getMessageId(),
            deliveryCount,
            safeMessage(exception)
        );
        context.abandon();
    }

    private void deadLetter(
        ServiceBusReceivedMessageContext context,
        String reason,
        Exception exception
    ) {
        LOGGER.error(
            "Delivery event dead-lettered messageId={} reason={} error={}",
            context.getMessage().getMessageId(),
            reason,
            safeMessage(exception)
        );
        context.deadLetter(new DeadLetterOptions()
            .setDeadLetterReason(reason)
            .setDeadLetterErrorDescription(safeMessage(exception)));
    }

    private static void validateConfiguration(DeliveryStatusConsumerProperties properties) {
        if (!StringUtils.hasText(properties.getConnectionString())
            && !StringUtils.hasText(properties.getFullyQualifiedNamespace())) {
            throw new IllegalStateException(
                "CRAVES_SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE is required when the delivery status consumer is enabled"
            );
        }
        if (!StringUtils.hasText(properties.getTopicName())
            || !StringUtils.hasText(properties.getSubscriptionName())) {
            throw new IllegalStateException("Delivery status topic and subscription are required");
        }
    }

    private static String safeMessage(Throwable exception) {
        String message = exception.getMessage();
        if (!StringUtils.hasText(message)) {
            return exception.getClass().getSimpleName();
        }
        String normalized = message.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 1000 ? normalized.substring(0, 1000) : normalized;
    }

    @PreDestroy
    void close() {
        processorClient.close();
    }
}

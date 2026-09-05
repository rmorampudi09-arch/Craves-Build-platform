package in.craves.supportassistant.service;

import in.craves.supportassistant.ai.AzureFoundryResponsesClient;
import in.craves.supportassistant.ai.SupportPromptBuilder;
import in.craves.supportassistant.config.SupportAssistantProperties;
import in.craves.supportassistant.context.SupportContextGateway;
import in.craves.supportassistant.context.SupportContextGateway.SupportContext;
import in.craves.supportassistant.knowledge.KnowledgeRepository;
import in.craves.supportassistant.knowledge.KnowledgeRepository.KnowledgeDocument;
import in.craves.supportassistant.safety.SensitiveDataRedactor;
import in.craves.supportassistant.safety.SupportSafetyPolicy;
import in.craves.supportassistant.security.CurrentUser;
import in.craves.supportassistant.web.SupportDtos.AskRequest;
import in.craves.supportassistant.web.SupportDtos.AskResponse;
import in.craves.supportassistant.web.SupportDtos.Audience;
import in.craves.supportassistant.web.SupportDtos.SourceReference;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SupportAssistantService {
    private static final Logger log = LoggerFactory.getLogger(SupportAssistantService.class);

    private final KnowledgeRepository knowledgeRepository;
    private final SupportContextGateway contextGateway;
    private final SensitiveDataRedactor redactor;
    private final SupportSafetyPolicy safetyPolicy;
    private final SupportPromptBuilder promptBuilder;
    private final AzureFoundryResponsesClient aiClient;
    private final SupportAssistantProperties properties;

    public SupportAssistantService(
        KnowledgeRepository knowledgeRepository,
        SupportContextGateway contextGateway,
        SensitiveDataRedactor redactor,
        SupportSafetyPolicy safetyPolicy,
        SupportPromptBuilder promptBuilder,
        AzureFoundryResponsesClient aiClient,
        SupportAssistantProperties properties
    ) {
        this.knowledgeRepository = knowledgeRepository;
        this.contextGateway = contextGateway;
        this.redactor = redactor;
        this.safetyPolicy = safetyPolicy;
        this.promptBuilder = promptBuilder;
        this.aiClient = aiClient;
        this.properties = properties;
    }

    public AskResponse ask(
        CurrentUser user,
        AskRequest request,
        String authorization,
        String correlationId
    ) {
        authorizeAudience(user, request.audience());
        String safeQuestion = redactor.redactForModel(request.message());
        if (!StringUtils.hasText(safeQuestion)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Support question is empty after safety filtering");
        }

        if (safetyPolicy.isRestrictedRequest(request.message())) {
            audit(user, request.audience(), request.message(), "RESTRICTED", false, "", correlationId);
            return new AskResponse(
                safetyPolicy.restrictedAnswer(),
                false,
                false,
                List.of(),
                null,
                correlationId
            );
        }

        List<KnowledgeDocument> knowledge = knowledgeRepository.search(
            request.audience(),
            safeQuestion,
            properties.getKnowledge().getMaxResults()
        );
        if (knowledge.isEmpty()) {
            knowledge = knowledgeRepository.fallback(request.audience(), Math.min(2, properties.getKnowledge().getMaxResults()));
        }

        SupportContext context = contextGateway.load(
            request.audience(), request.orderId(), request.supportCaseId(), authorization, correlationId
        );
        boolean aiInvoked = false;
        String outcome;
        String answer;

        if (aiClient.configured()) {
            try {
                aiInvoked = true;
                answer = aiClient.answer(
                    promptBuilder.instructions(),
                    promptBuilder.input(request.audience(), safeQuestion, context, knowledge)
                );
                answer = redactor.sanitizeModelOutput(answer);
                if (!StringUtils.hasText(answer)) {
                    throw new IllegalStateException("Model output was empty after safety filtering");
                }
                outcome = "AI_ANSWERED";
            } catch (RuntimeException ex) {
                log.warn("Support AI unavailable; using safe fallback correlationId={} cause={}", correlationId, ex.getClass().getSimpleName());
                answer = fallback(context, knowledge);
                outcome = "AI_UNAVAILABLE_FALLBACK";
            }
        } else {
            answer = fallback(context, knowledge);
            outcome = "SAFE_FALLBACK";
        }

        boolean escalationSuggested = shouldEscalate(request, context, knowledge, outcome);
        List<SourceReference> sources = knowledge.stream()
            .map(document -> new SourceReference(document.title(), document.sourceType(), document.sourceRef()))
            .toList();
        audit(
            user,
            request.audience(),
            request.message(),
            outcome,
            aiInvoked,
            context == null ? "" : context.contextTypes(),
            correlationId
        );
        return new AskResponse(
            answer,
            "AI_ANSWERED".equals(outcome),
            escalationSuggested,
            sources,
            context == null ? null : context.toDto(),
            correlationId
        );
    }

    private String fallback(SupportContext context, List<KnowledgeDocument> knowledge) {
        if (context != null && context.order() != null && context.order().available()) {
            StringBuilder answer = new StringBuilder("Your order is currently ")
                .append(context.order().status() == null ? "available in your account" : context.order().status().replace('_', ' ').toLowerCase());
            if (context.order().prepTimeMinutes() != null) {
                answer.append(". The recorded preparation estimate is ")
                    .append(context.order().prepTimeMinutes()).append(" minutes");
            }
            answer.append(". If this does not match what you see in Craves, use your support case option so the team can investigate.");
            return redactor.sanitizeModelOutput(answer.toString());
        }
        if (context != null && context.supportCase() != null && context.supportCase().available()) {
            return "Your Craves support case is currently "
                + String.valueOf(context.supportCase().status()).replace('_', ' ').toLowerCase()
                + ". You can continue the case from the Support section in your account.";
        }
        if (knowledge != null && !knowledge.isEmpty()) {
            KnowledgeDocument first = knowledge.getFirst();
            String content = first.content() == null ? "" : first.content().trim();
            int end = Math.min(content.length(), 420);
            String summary = content.substring(0, end);
            if (end < content.length()) summary += "…";
            return redactor.sanitizeModelOutput(summary);
        }
        return "I can’t confirm that from the support information currently available. Please open a Craves support case from your account so the team can check it safely.";
    }

    private static boolean shouldEscalate(
        AskRequest request,
        SupportContext context,
        List<KnowledgeDocument> knowledge,
        String outcome
    ) {
        if ("AI_UNAVAILABLE_FALLBACK".equals(outcome)) return true;
        if (knowledge == null || knowledge.isEmpty()) return true;
        if (request.orderId() != null && (context == null || context.order() == null || !context.order().available())) return true;
        return request.supportCaseId() != null
            && (context == null || context.supportCase() == null || !context.supportCase().available());
    }

    private static void authorizeAudience(CurrentUser user, Audience audience) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required");
        }
        if (audience == Audience.CHEF && !user.hasRole("CHEF")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef support requires an approved chef identity");
        }
    }

    private void audit(
        CurrentUser user,
        Audience audience,
        String question,
        String outcome,
        boolean aiInvoked,
        String contextTypes,
        String correlationId
    ) {
        try {
            knowledgeRepository.audit(
                user.identityId(),
                audience,
                sha256(question),
                outcome,
                aiInvoked,
                contextTypes,
                correlationId
            );
        } catch (DataAccessException ex) {
            log.warn("Support assistant audit write failed correlationId={}", correlationId);
        }
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}

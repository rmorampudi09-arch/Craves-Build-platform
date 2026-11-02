package in.craves.advanced.aisearch;

import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import java.util.List;
import java.util.Optional;

/** The AI chat provider the owner chooses. Implementations never log or keep the conversation. */
public interface AiSearchProvider {
    /** False until the owner has set the provider (address, model and key). */
    boolean configured();

    /** The assistant's raw answer; empty when the provider failed, timed out or was busy. */
    Optional<String> complete(String systemPrompt, List<AiChatMessage> messages);
}

package in.craves.advanced.aisearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.PlannedSearch;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

final class AiSearchRules {
    static final int MAX_CHAT_CHARS = 3000;
    static final int MAX_REPLY = 300;
    /** Semantic search accepts queries up to 120 characters. */
    static final int MAX_SEARCH_TEXT = 120;
    private static final Set<String> FOOD_TYPES = Set.of("VEG", "NON_VEG", "EGG");
    private static final Set<String> SPICE_LEVELS = Set.of("MILD", "MEDIUM", "SPICY");

    static final String SYSTEM_PROMPT = """
            You are the food-search helper in the Craves app in India. Craves lists home-cooked dishes from home kitchens near \
            the person. Read the conversation and decide what to search the menu for.
            Answer with one JSON object and nothing else, exactly these keys:
            {"reply": "...", "searchText": "...", "foodType": null, "spiceLevel": null}
            - reply: one or two short, friendly sentences in the language the person writes in, at most 200 characters. Say what \
            you are looking for, or ask one short question when you cannot tell what they want.
            - searchText: up to 6 words naming dishes, ingredients or cuisines to search for, for example "paneer butter masala" \
            or "ragi dosa". Use "" when you need to ask a question first.
            - foodType: "VEG", "NON_VEG" or "EGG" only when the person asked for it, otherwise null.
            - spiceLevel: "MILD", "MEDIUM" or "SPICY" only when the person asked for it, otherwise null.
            Never invent dishes, prices, availability, delivery times, offers or kitchens: the app shows what kitchens really \
            offer. Give no medical or allergy advice; for allergies, tell the person to check each dish's food facts. Never ask \
            for personal details.""";

    /** What the model suggested, already checked; an empty searchText with no filters means it asked a question back. */
    record Suggestion(String reply, String searchText, String foodType, String spiceLevel) {
        boolean searches() {
            return !searchText.isEmpty() || foodType != null || spiceLevel != null;
        }
    }

    private AiSearchRules() { }

    /** The newest message must be the person's; control characters go; the whole chat stays small enough for one cheap call. */
    static List<AiChatMessage> checkedChat(List<AiChatMessage> messages) {
        if (!"USER".equals(messages.getLast().role())) {
            throw ApiProblem.badRequest("INVALID_CHAT", "The last message must be the person's (role USER)");
        }
        List<AiChatMessage> out = new ArrayList<>();
        int total = 0;
        for (AiChatMessage message : messages) {
            String text = oneLine(message.text());
            if (text.isEmpty()) throw ApiProblem.badRequest("INVALID_CHAT", "Every message needs some text");
            total += text.length();
            out.add(new AiChatMessage(message.role(), text));
        }
        if (total > MAX_CHAT_CHARS) throw ApiProblem.badRequest("INVALID_CHAT", "The chat is too long; send at most " + MAX_CHAT_CHARS + " characters");
        return List.copyOf(out);
    }

    /** The first {...} in the answer (models sometimes wrap it in prose or a code fence); null when nothing usable came back. */
    static Suggestion parse(String content, ObjectMapper json) {
        if (content == null) return null;
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        JsonNode node;
        try {
            node = json.readTree(content.substring(start, end + 1));
        } catch (Exception ex) {
            return null;
        }
        if (!node.isObject()) return null;
        String reply = cut(oneLine(text(node, "reply")), MAX_REPLY);
        String searchText = cut(oneLine(text(node, "searchText")), MAX_SEARCH_TEXT);
        String foodType = choice(node, "foodType", FOOD_TYPES);
        String spiceLevel = choice(node, "spiceLevel", SPICE_LEVELS);
        if (reply.isEmpty() && searchText.isEmpty() && foodType == null && spiceLevel == null) return null;
        return new Suggestion(reply.isEmpty() ? null : reply, searchText, foodType, spiceLevel);
    }

    /** The model's filters only fill what staff concepts left open: a curated concept wins over a guess. */
    static SearchPlan withFilters(SearchPlan plan, Suggestion suggestion) {
        return new SearchPlan(plan.query(), plan.normalized(), plan.matchedPhrases(), plan.searches(),
                plan.foodType() != null ? plan.foodType() : suggestion.foodType(),
                plan.spiceLevel() != null ? plan.spiceLevel() : suggestion.spiceLevel(), plan.category());
    }

    /** "Something spicy and veg": no words to search, only filters (as semantic search does for "veg"). */
    static SearchPlan filtersOnly(Suggestion suggestion) {
        return new SearchPlan("", "", List.of(), List.of(new PlannedSearch(null, false)), suggestion.foodType(), suggestion.spiceLevel(), null);
    }

    static String cut(String text, int maxCodePoints) {
        if (text.codePointCount(0, text.length()) <= maxCodePoints) return text;
        return text.substring(0, text.offsetByCodePoints(0, maxCodePoints)).strip();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() ? value.asText() : "";
    }

    private static String choice(JsonNode node, String field, Set<String> allowed) {
        String value = text(node, field).strip();
        return allowed.contains(value) ? value : null;
    }

    /** Control and line characters become single spaces. */
    static String oneLine(String text) {
        if (text == null) return "";
        StringBuilder out = new StringBuilder();
        text.codePoints().forEach(c -> out.appendCodePoint(Character.isISOControl(c) || Character.isWhitespace(c) ? ' ' : c));
        return out.toString().strip().replaceAll(" {2,}", " ");
    }
}

package in.craves.advanced.support;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.advanced.platform.clients.AccountDataGateway;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Answers set per path; anything else answers 404. Records which paths were read with which token. */
public class FakeAccountData implements AccountDataGateway {
    public final Map<String, AccountDataAnswer> answers = new HashMap<>();
    public final List<String> reads = new ArrayList<>();

    public void answer(String path, int status, JsonNode body) {
        answers.put(path, new AccountDataAnswer(status, body));
    }

    public void reset() {
        answers.clear();
        reads.clear();
    }

    @Override
    public synchronized AccountDataAnswer read(String bearerToken, String path) {
        reads.add(path + " " + (bearerToken == null ? "-" : "token"));
        return answers.getOrDefault(path, new AccountDataAnswer(404, null));
    }
}

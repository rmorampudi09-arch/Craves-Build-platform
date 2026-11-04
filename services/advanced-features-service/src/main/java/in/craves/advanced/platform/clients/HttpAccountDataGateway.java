package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.web.ApiProblem;
import org.springframework.stereotype.Component;

@Component
public class HttpAccountDataGateway implements AccountDataGateway {
    private final GatewayHttp http;

    public HttpAccountDataGateway(ObjectMapper json, AdvancedSettings settings) {
        this.http = new GatewayHttp(json, settings.apiOrigin(), "ACCOUNT_DATA_UNAVAILABLE");
    }

    @Override
    public AccountDataAnswer read(String bearerToken, String path) {
        try {
            GatewayHttp.Reply reply = http.send("GET", path, bearerToken, null);
            return new AccountDataAnswer(reply.status(), reply.body());
        } catch (ApiProblem noAnswer) {
            return new AccountDataAnswer(0, null);
        }
    }
}

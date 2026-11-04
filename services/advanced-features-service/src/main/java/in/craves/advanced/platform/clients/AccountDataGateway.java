package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;

/** The caller's own records in other Craves services, read with their token through the public gateway and passed on as those services answer. */
public interface AccountDataGateway {
    /** status: the service's HTTP status, or 0 when it did not answer in time or answered something unreadable; body: its JSON, or null. */
    record AccountDataAnswer(int status, JsonNode body) { }

    AccountDataAnswer read(String bearerToken, String path);
}

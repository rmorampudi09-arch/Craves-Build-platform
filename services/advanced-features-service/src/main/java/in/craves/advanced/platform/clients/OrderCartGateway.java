package in.craves.advanced.platform.clients;

import java.util.UUID;

/** The customer's real cart in Order service, used only on that customer's behalf with their own token. */
public interface OrderCartGateway {
    int itemCount(String bearerToken);

    void clear(String bearerToken);

    void add(String bearerToken, UUID menuItemId, int quantity);
}

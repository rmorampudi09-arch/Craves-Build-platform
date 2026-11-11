package in.craves.userchef.supportchat;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Who may name a guest-chat visitor. The web server hashes each browser's address into {@code X-Craves-Visitor}
 * so visitors get separate limits; anyone else who reaches the API directly could send a fresh hash per request
 * and so take the whole shared guest budget. When CRAVES_SUPPORT_GUEST_FORWARDER_HEADER names a header the edge
 * sets itself (X-Azure-SocketIP behind Front Door, the connection's address; a caller can write X-Azure-ClientIP)
 * and CRAVES_SUPPORT_GUEST_FORWARDER_IPS lists the web server's outbound addresses, only their visitor hashes
 * count and everyone else shares the "unknown" bucket. Unset, every caller is trusted as before.
 */
@Component
public class GuestVisitorForwarders {
    private static final Pattern IPV4 = Pattern.compile(
            "((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])");
    // A hex digit or ':' first and a ':' in it: InetAddress then parses an IPv6 literal or fails, and never asks DNS.
    private static final Pattern IPV6 = Pattern.compile("(?=.*:)[0-9A-Fa-f:][0-9A-Fa-f:.]{1,44}");
    private final String header;
    private final Set<InetAddress> forwarders;

    public GuestVisitorForwarders(@Value("${CRAVES_SUPPORT_GUEST_FORWARDER_HEADER:}") String header,
            @Value("${CRAVES_SUPPORT_GUEST_FORWARDER_IPS:}") String forwarders) {
        this.header = header.strip();
        if (!this.header.isEmpty() && !this.header.matches("[A-Za-z0-9-]{1,64}")) {
            throw new IllegalArgumentException("CRAVES_SUPPORT_GUEST_FORWARDER_HEADER must be one header name");
        }
        this.forwarders = Arrays.stream(forwarders.split(",")).map(String::strip).filter(ip -> !ip.isEmpty())
                .map(ip -> {
                    InetAddress address = literal(ip);
                    if (address == null) {
                        throw new IllegalArgumentException("CRAVES_SUPPORT_GUEST_FORWARDER_IPS must list IP addresses");
                    }
                    return address;
                }).collect(Collectors.toUnmodifiableSet());
        // The header without the list would put every website visitor in one bucket: refuse to start instead.
        if (!this.header.isEmpty() && this.forwarders.isEmpty()) {
            throw new IllegalStateException("CRAVES_SUPPORT_GUEST_FORWARDER_HEADER needs CRAVES_SUPPORT_GUEST_FORWARDER_IPS, "
                    + "the web server's outbound addresses");
        }
    }

    /** True when this request's visitor header may be believed. */
    boolean trusts(HttpServletRequest request) {
        if (header.isEmpty()) { return true; }
        InetAddress address = literal(request.getHeader(header));
        return address != null && forwarders.contains(address);
    }

    /** A literal IPv4 or IPv6 address, else null; a name is never looked up. */
    static InetAddress literal(String value) {
        if (value == null || !(IPV4.matcher(value).matches() || IPV6.matcher(value).matches())) { return null; }
        try { return InetAddress.getByName(value); }
        catch (UnknownHostException invalid) { return null; }
    }
}

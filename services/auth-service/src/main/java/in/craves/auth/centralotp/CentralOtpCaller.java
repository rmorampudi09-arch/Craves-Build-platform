package in.craves.auth.centralotp;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Who asks for or checks a code, for the per-IP and per-install limits (CentralOtpStore). The IP is known only when
 * CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER names a header the edge sets itself (X-Azure-ClientIP behind Front Door). A
 * request from the web server's own addresses (CRAVES_CENTRAL_OTP_FORWARDING_IPS) is a browser's, whose IP the web
 * server sends as X-Craves-Client-Ip; anyone else's X-Craves-Client-Ip is ignored.
 */
@Component
public class CentralOtpCaller {
    /** ip: an IPv4 address or an IPv6 /64, as hex, null when unknown; install: the app install, null when not sent. */
    record Caller(String ip, boolean viaForwarder, String install) {
        @Override public String toString() { return "Caller[redacted]"; }
    }
    private static final Pattern IPV4 = Pattern.compile(
            "((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])");
    // A hex digit or ':' first and a ':' in it: InetAddress then parses an IPv6 literal or fails, and never asks DNS.
    private static final Pattern IPV6 = Pattern.compile("(?=.*:)[0-9A-Fa-f:][0-9A-Fa-f:.]{1,44}");
    private static final Pattern INSTALL = Pattern.compile("[A-Za-z0-9._-]{8,128}");
    private final String header;
    private final Set<InetAddress> forwarders;

    public CentralOtpCaller(@Value("${CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER:}") String header,
            @Value("${CRAVES_CENTRAL_OTP_FORWARDING_IPS:}") String forwarders) {
        this.header = header.strip();
        if (!this.header.isEmpty() && !this.header.matches("[A-Za-z0-9-]{1,64}")) {
            throw new IllegalArgumentException("CRAVES_CENTRAL_OTP_CLIENT_IP_HEADER must be one header name");
        }
        // A typo would put every web sign-in in the web server's one bucket: refuse to start instead.
        this.forwarders = Arrays.stream(forwarders.split(",")).map(String::strip).filter(ip -> !ip.isEmpty())
                .map(ip -> {
                    InetAddress address = literal(ip);
                    if (address == null) {
                        throw new IllegalArgumentException("CRAVES_CENTRAL_OTP_FORWARDING_IPS must list IP addresses");
                    }
                    return address;
                }).collect(Collectors.toUnmodifiableSet());
    }

    Caller of(HttpServletRequest request) {
        String install = request.getHeader("X-Craves-Installation-Id");
        if (install != null && !INSTALL.matcher(install).matches()) { install = null; }
        if (header.isEmpty()) { return new Caller(null, false, install); }
        InetAddress address = literal(request.getHeader(header));
        boolean viaForwarder = address != null && forwarders.contains(address);
        // Never the web server's own address: that one bucket would hold every web sign-in.
        if (viaForwarder) { address = literal(request.getHeader("X-Craves-Client-Ip")); }
        return new Caller(address == null ? null : key(address), viaForwarder, install);
    }

    /** A literal IPv4 or IPv6 address, else null; a name is never looked up. */
    static InetAddress literal(String value) {
        if (value == null || !(IPV4.matcher(value).matches() || IPV6.matcher(value).matches())) { return null; }
        try { return InetAddress.getByName(value); }
        catch (UnknownHostException invalid) { return null; }
    }

    /** One bucket per IPv4 address and per IPv6 /64: a phone or a home gets a whole /64 to pick addresses from. */
    private static String key(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length == 16) { Arrays.fill(bytes, 8, 16, (byte) 0); }
        return HexFormat.of().formatHex(bytes);
    }
}

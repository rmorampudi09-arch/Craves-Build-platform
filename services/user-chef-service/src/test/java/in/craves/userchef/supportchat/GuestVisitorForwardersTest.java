package in.craves.userchef.supportchat;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class GuestVisitorForwardersTest {
    private static MockHttpServletRequest from(String header, String value) {
        var request = new MockHttpServletRequest();
        if (value != null) { request.addHeader(header, value); }
        return request;
    }

    @Test
    void trustsEveryCallerWhenNotConfigured() {
        var forwarders = new GuestVisitorForwarders("", "");
        assertTrue(forwarders.trusts(from("X-Azure-SocketIP", "203.0.113.9")));
        assertTrue(forwarders.trusts(from("X-Azure-SocketIP", null)));
    }

    @Test
    void trustsOnlyTheWebServersAddresses() {
        var forwarders = new GuestVisitorForwarders("X-Azure-SocketIP", "198.51.100.10, 2001:db8::10");
        assertTrue(forwarders.trusts(from("X-Azure-SocketIP", "198.51.100.10")));
        assertTrue(forwarders.trusts(from("X-Azure-SocketIP", "2001:DB8:0:0:0:0:0:10")));
        assertFalse(forwarders.trusts(from("X-Azure-SocketIP", "203.0.113.9")));
        assertFalse(forwarders.trusts(from("X-Azure-SocketIP", null)));
        assertFalse(forwarders.trusts(from("X-Azure-SocketIP", "web.example")));
        // The caller-written header is never consulted.
        assertFalse(forwarders.trusts(from("X-Azure-ClientIP", "198.51.100.10")));
    }

    @Test
    void refusesAHeaderWithoutAddressesOrAnAddressThatIsNotOne() {
        assertThrows(IllegalStateException.class, () -> new GuestVisitorForwarders("X-Azure-SocketIP", ""));
        assertThrows(IllegalArgumentException.class, () -> new GuestVisitorForwarders("X-Azure-SocketIP", "web.example"));
        assertThrows(IllegalArgumentException.class, () -> new GuestVisitorForwarders("X Azure", "198.51.100.10"));
    }
}

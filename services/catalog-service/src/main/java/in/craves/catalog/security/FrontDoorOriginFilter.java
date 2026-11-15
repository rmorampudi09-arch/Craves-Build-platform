package in.craves.catalog.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Answer only our Azure Front Door (docs/runbooks/production-environment.md, "Catalog: straight from Front Door").
 * <p>
 * Public catalog reads come straight from Front Door, so catalog accepts Front Door's shared address ranges and another
 * company's Front Door profile could reach it and skip our WAF. Every Front Door request carries {@code X-Azure-FDID}
 * with its profile's id; Front Door overwrites any value a client sends and no Front Door rule can change or remove it.
 * A different id therefore means someone else's profile. No id means no Front Door at all: only APIM and our own apps'
 * addresses reach catalog that way, so those requests are answered as before.
 * <p>
 * {@code CRAVES_FRONT_DOOR_ID} is the expected id; {@code CRAVES_FRONT_DOOR_CHECK} is {@code report} or
 * {@code enforce}, and unset or any other value means off.
 */
public final class FrontDoorOriginFilter extends OncePerRequestFilter {
    static final String HEADER = "X-Azure-FDID";
    private static final Logger LOGGER = LoggerFactory.getLogger(FrontDoorOriginFilter.class);

    private final String mode;
    private final String id;

    FrontDoorOriginFilter(String mode, String id) {
        this.mode = "report".equals(mode) || "enforce".equals(mode) ? mode : "off";
        // Whitespace around the setting is dropped, so a pasted newline cannot turn enforce into "deny every Front Door request".
        this.id = id == null ? "" : id.trim();
        if (!"off".equals(this.mode) && this.id.isEmpty()) {
            // Fail open: a missing setting must never take catalog down.
            LOGGER.error("ORIGIN_CHECK_MISCONFIGURED CRAVES_FRONT_DOOR_CHECK is set but CRAVES_FRONT_DOOR_ID is empty; allowing every request");
        }
    }

    public static FrontDoorOriginFilter fromEnvironment(Environment environment) {
        return new FrontDoorOriginFilter(environment.getProperty("CRAVES_FRONT_DOOR_CHECK"), environment.getProperty("CRAVES_FRONT_DOOR_ID"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String fdid = request.getHeader(HEADER);
        if ("off".equals(mode) || id.isEmpty() || fdid == null || fdid.equals(id)) {
            chain.doFilter(request, response);
            return;
        }
        if ("enforce".equals(mode)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setHeader("Cache-Control", "no-store");
            return;
        }
        // Path only: no address, header value or query string.
        LOGGER.warn("ORIGIN_CHECK_MISMATCH mode=report path={}", request.getRequestURI());
        chain.doFilter(request, response);
    }
}

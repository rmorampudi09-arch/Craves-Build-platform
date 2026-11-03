package in.craves.userchef.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Handbook 099: every request gets one correlation id, the caller's X-Correlation-ID when it is a UUID, else a new one.
 * It is echoed once on the response, written on every log line (MDC key correlationId, see logging.pattern.correlation),
 * and sent on RestClient calls to other Craves services made while the request runs (never to outside providers).
 * When the caller sent no id, controllers that read X-Correlation-ID (the audited admin reads) see the same new id, so
 * their audit rows match the logs; an id that is not a UUID still reaches them unchanged, so they keep answering 400.
 * On by default; CRAVES_CORRELATION_ID_ENABLED=false switches it off.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "CRAVES_CORRELATION_ID_ENABLED", havingValue = "true", matchIfMissing = true)
public class CorrelationIdConfiguration {
    public static final String HEADER = "X-Correlation-ID";
    public static final String MDC_KEY = "correlationId";
    private static final Pattern UUID_TEXT =
        Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    @Bean
    FilterRegistrationBean<CorrelationIdFilter> correlationIdFilter() {
        FilterRegistrationBean<CorrelationIdFilter> registration = new FilterRegistrationBean<>(new CorrelationIdFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    /** A header the caller set itself wins; calls made outside a request (workers, schedulers) carry none. */
    @Bean
    RestClientCustomizer correlationIdPropagation() {
        return builder -> builder.requestInterceptor((request, body, execution) -> {
            String id = MDC.get(MDC_KEY);
            if (id != null && !request.getHeaders().containsKey(HEADER) && cravesHost(request.getURI().getHost())) {
                request.getHeaders().set(HEADER, id);
            }
            return execution.execute(request, body);
        });
    }

    /** api.craves.in and other craves.in hosts, Container Apps names and local addresses; payment and delivery providers are not. */
    static boolean cravesHost(String host) {
        if (host == null || host.isBlank()) {
            return false;
        }
        String name = host.toLowerCase(Locale.ROOT);
        return name.equals("craves.in") || name.endsWith(".craves.in") || name.endsWith(".azurecontainerapps.io")
            || name.equals("localhost") || name.equals("127.0.0.1") || !name.contains(".");
    }

    static final class CorrelationIdFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String supplied = request.getHeader(HEADER);
            String id = supplied != null && UUID_TEXT.matcher(supplied).matches()
                ? supplied.toLowerCase(Locale.ROOT) : UUID.randomUUID().toString();
            response.setHeader(HEADER, id);
            MDC.put(MDC_KEY, id);
            try {
                chain.doFilter(supplied == null ? withId(request, id) : request, oneId(response));
            } finally {
                MDC.remove(MDC_KEY);
            }
        }

        private static HttpServletRequest withId(HttpServletRequest request, String id) {
            return new HttpServletRequestWrapper(request) {
                @Override
                public String getHeader(String name) {
                    return HEADER.equalsIgnoreCase(name) ? id : super.getHeader(name);
                }

                @Override
                public Enumeration<String> getHeaders(String name) {
                    return HEADER.equalsIgnoreCase(name) ? Collections.enumeration(List.of(id)) : super.getHeaders(name);
                }

                @Override
                public Enumeration<String> getHeaderNames() {
                    List<String> names = Collections.list(super.getHeaderNames());
                    names.add(HEADER);
                    return Collections.enumeration(names);
                }
            };
        }

        /** A controller that writes its own X-Correlation-ID replaces this one instead of adding a second header. */
        private static HttpServletResponse oneId(HttpServletResponse response) {
            return new HttpServletResponseWrapper(response) {
                @Override
                public void addHeader(String name, String value) {
                    if (HEADER.equalsIgnoreCase(name)) {
                        super.setHeader(name, value);
                    } else {
                        super.addHeader(name, value);
                    }
                }
            };
        }
    }
}

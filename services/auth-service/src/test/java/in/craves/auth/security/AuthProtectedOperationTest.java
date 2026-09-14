package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class AuthProtectedOperationTest {
    @Test void decodedServletPathProtectsEncodedEquivalentRoutes() {
        var refresh=new MockHttpServletRequest("POST","/api/v1/auth/re%66resh");refresh.setServletPath("/api/v1/auth/refresh");
        assertEquals("refresh",AuthProtectedOperation.operation(refresh));
        var exchange=new MockHttpServletRequest("POST","/api/v1/auth/firebase/%65xchange");exchange.setServletPath("/api/v1/auth/firebase/exchange");
        assertEquals("exchange",AuthProtectedOperation.operation(exchange));
    }
    @Test void decodedServletPathHandlesContextAndContainerNormalizedPath() {
        var request=new MockHttpServletRequest("POST","/app/api/v1/auth/./re%66resh");request.setContextPath("/app");request.setServletPath("/api/v1/auth/refresh");
        assertEquals("refresh",AuthProtectedOperation.operation(request));
    }
    @Test void decodedServletPathIsAuthoritativeEvenWhenRawUriLooksProtected() {
        var request=new MockHttpServletRequest("POST","/api/v1/auth/refresh");request.setServletPath("/api/v1/auth/logout");
        assertNull(AuthProtectedOperation.operation(request));
    }
    @Test void pathInfoWorksForPrefixAndRootServletMappings() {
        var prefixed=new MockHttpServletRequest("POST","/api/v1/auth/refresh");prefixed.setServletPath("/api");prefixed.setPathInfo("/v1/auth/refresh");
        assertEquals("refresh",AuthProtectedOperation.operation(prefixed));
        var root=new MockHttpServletRequest("POST","/api/v1/auth/refresh");root.setServletPath("");root.setPathInfo("/api/v1/auth/refresh");
        assertEquals("refresh",AuthProtectedOperation.operation(root));
    }
    @Test void fallbackSupportsLegacyMocksAndStripsOnlyTheActualContextBoundary() {
        assertEquals("refresh",AuthProtectedOperation.operation(new MockHttpServletRequest("POST","/api/v1/auth/refresh")));
        var context=new MockHttpServletRequest("POST","/app/api/v1/auth/firebase/exchange");context.setContextPath("/app");
        assertEquals("exchange",AuthProtectedOperation.operation(context));
        context.setRequestURI("/application/api/v1/auth/firebase/exchange");assertNull(AuthProtectedOperation.operation(context));
    }
    @Test void onlyExactPostRoutesAreProtected() {
        for(String path:new String[]{"/api/v1/auth/logout","/api/v1/auth/refresh/extra","/api/v1/auth/refresh/","/api/v1/auth/firebase/exchange-old"}) {
            var request=new MockHttpServletRequest("POST",path);request.setServletPath(path);assertNull(AuthProtectedOperation.operation(request));
        }
        var get=new MockHttpServletRequest("GET","/api/v1/auth/refresh");get.setServletPath("/api/v1/auth/refresh");assertNull(AuthProtectedOperation.operation(get));
    }
}

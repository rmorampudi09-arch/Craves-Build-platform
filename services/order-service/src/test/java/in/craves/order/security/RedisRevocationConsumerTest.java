package in.craves.order.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RedisRevocationConsumerTest {
    static class Registry extends InterceptorRegistry { List<Object> items(){return getInterceptors();} }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    HandlerInterceptor interceptor(String projection, boolean outage) {
        var redis=mock(StringRedisTemplate.class);
        ValueOperations<String,String> values=mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        if(outage)when(values.get(anyString())).thenThrow(new IllegalStateException("Private connection details"));
        else when(values.get(anyString())).thenReturn(projection);
        var config=new RedisTokenRevocationWebConfiguration(redis,new ObjectMapper(),true,true,"test:revocation");
        var registry=new Registry();config.addInterceptors(registry);
        return (HandlerInterceptor)registry.items().getFirst();
    }
    MockHttpServletRequest request(String version){
        var request=new MockHttpServletRequest("GET","/api/v1/test");
        String payload="{\"sub\":\""+UUID.randomUUID()+"\",\"token_version\":"+version+"}";
        request.addHeader("Authorization","Bearer e30."+Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8))+".signature");
        // The interceptor runs after signature authentication; this is not a JWT signature test.
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("synthetic",null,List.of()));
        return request;
    }
    @Test void activeMatchingVersionPasses() throws Exception {
        assertTrue(interceptor("ACTIVE|2",false).preHandle(request("2"),new MockHttpServletResponse(),new Object()));
    }
    @Test void missingProjectionPassesOnlyTheAlreadyAuthenticatedToken() throws Exception {
        assertTrue(interceptor(null,false).preHandle(request("2"),new MockHttpServletResponse(),new Object()));
    }
    @Test void suspendedAndOlderTokensAreRejected() {
        for(String projection:List.of("SUSPENDED|2","ACTIVE|3")){
            var error=assertThrows(ResponseStatusException.class,()->interceptor(projection,false).preHandle(request("2"),new MockHttpServletResponse(),new Object()));
            assertEquals(401,error.getStatusCode().value());
        }
    }
    @Test void malformedProjectionFailsClosed() {
        for(String projection:List.of("","UNKNOWN|2","ACTIVE|-1","ACTIVE|0","ACTIVE|02","ACTIVE|1.5","ACTIVE|9223372036854775808","ACTIVE|2|EXTRA")){
            var error=assertThrows(ResponseStatusException.class,()->interceptor(projection,false).preHandle(request("2"),new MockHttpServletResponse(),new Object()));
            assertEquals(503,error.getStatusCode().value(),projection);
        }
    }
    @Test void unavailableStoreFailsClosed() {
        var error=assertThrows(ResponseStatusException.class,()->interceptor(null,true).preHandle(request("2"),new MockHttpServletResponse(),new Object()));
        assertEquals(503,error.getStatusCode().value());
    }
    @Test void nonIntegerOrNonpositiveTokenVersionIsRejected(){
        for(String version:List.of("0","-1","1.5","\"2\"","9223372036854775808")){
            var error=assertThrows(ResponseStatusException.class,()->interceptor("ACTIVE|2",false).preHandle(request(version),new MockHttpServletResponse(),new Object()));
            assertEquals(401,error.getStatusCode().value());
        }
    }
}


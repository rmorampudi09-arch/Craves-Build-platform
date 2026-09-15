package in.craves.referral.security;

import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ReferralAuthStateClientTest {
    String origin="https://auth.example.test"; UUID id=UUID.randomUUID();
    Jwt jwt=Jwt.withTokenValue("TEST_ONLY_BEARER").header("alg","RS256").subject(id.toString()).claim("token_version",2L).claim("roles",List.of("ADMIN","CUSTOMER")).build();
    RestClient.Builder builder=RestClient.builder();
    MockRestServiceServer server=MockRestServiceServer.bindTo(builder).build();
    ReferralAuthStateClient client=new ReferralAuthStateClient(origin,builder);
    String body(){return "{\"userId\":\""+id+"\",\"tokenVersion\":2,\"status\":\"ACTIVE\",\"roles\":[\"CUSTOMER\"]}";}
    void responds(String value){server.expect(requestTo(origin+"/api/v1/auth/referrals/access")).andExpect(header("Authorization","Bearer TEST_ONLY_BEARER")).andRespond(withSuccess(value,MediaType.APPLICATION_JSON));}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @Test void verifiesOriginalBearerAndReturnsCurrentRoles(){responds(body());assertEquals(Set.of("ROLE_CUSTOMER"),client.verify(jwt));server.verify();}
    @Test void noPositiveCacheAndRevocationTakesEffectOnNextRequest(){responds(body());server.expect(anything()).andRespond(withStatus(HttpStatus.UNAUTHORIZED));client.verify(jwt);var ex=assertThrows(ReferralProblem.class,()->client.verify(jwt));assertEquals(401,ex.status());server.verify();}
    @Test void outagesAndRedirectsFailClosed(){for(HttpStatus status:List.of(HttpStatus.SERVICE_UNAVAILABLE,HttpStatus.FOUND,HttpStatus.NOT_FOUND)){server.reset();server.expect(anything()).andRespond(withStatus(status));assertEquals(503,assertThrows(ReferralProblem.class,()->client.verify(jwt)).status());}}
    @Test void wrongSubjectVersionStatusAndRoleCannotAuthorize(){for(String invalid:List.of(body().replace(id.toString(),UUID.randomUUID().toString()),body().replace(":2",":1"),body().replace("ACTIVE","SUSPENDED"),body().replace("CUSTOMER","PLATFORM_ADMIN"),"null","{}")){server.reset();responds(invalid);assertEquals(503,assertThrows(ReferralProblem.class,()->client.verify(jwt)).status());}}
    @Test void oversizedAndMalformedBodiesAreRejected(){responds(" ".repeat(16385));assertThrows(ReferralProblem.class,()->client.verify(jwt));server.reset();responds("not json");assertThrows(ReferralProblem.class,()->client.verify(jwt));}
    @Test void networkFailureDoesNotAuthorize(){server.expect(anything()).andRespond(withException(new IOException("TEST outage")));assertEquals(503,assertThrows(ReferralProblem.class,()->client.verify(jwt)).status());}
    @Test void configuredOriginMustBeHttpsWithoutRedirectablePathOrCredentials(){for(String url:List.of("http://auth.test","https://user:password@auth.test","https://auth.test/api","https://auth.test?x=1","https://auth.test#fragment"))assertThrows(IllegalArgumentException.class,()->new ReferralAuthStateClient(url,builder));}
    @Test void filterDropsRemovedAdminAuthorityBeforeAuthorizationWithoutRedis()throws Exception{
        responds(body());var settings=mock(ReferralSettings.class);var redis=mock(org.springframework.data.redis.core.StringRedisTemplate.class);
        var filter=new ReferralRevocationFilter(settings,redis,true,false,client);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"),new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        var request=new MockHttpServletRequest("GET","/api/v1/referrals/admin/policy");
        filter.doFilter(request,new MockHttpServletResponse(),(req,res)->assertEquals(List.of("ROLE_CUSTOMER"),SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().map(a->a.getAuthority()).toList()));
        verifyNoInteractions(redis);server.verify();
    }
    @Test void failureStopsFilterChainAndDoesNotFallBackToRedis()throws Exception{
        server.expect(anything()).andRespond(withStatus(HttpStatus.UNAUTHORIZED));var redis=mock(org.springframework.data.redis.core.StringRedisTemplate.class);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of()));var response=new MockHttpServletResponse();
        new ReferralRevocationFilter(mock(ReferralSettings.class),redis,true,true,client).doFilter(new MockHttpServletRequest("GET","/api/v1/referrals/me"),response,(req,res)->fail("Revoked request reached handler"));
        assertEquals(401,response.getStatus());verifyNoInteractions(redis);
    }
}

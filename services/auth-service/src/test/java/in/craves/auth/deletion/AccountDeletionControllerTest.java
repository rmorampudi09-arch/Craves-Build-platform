package in.craves.auth.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.deletion.AccountDeletionService.Created;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;

class AccountDeletionControllerTest {
    final AccountDeletionService service = mock(AccountDeletionService.class);
    final AccountDeletionController controller = new AccountDeletionController(service, new ObjectMapper());
    final CurrentUser user = new CurrentUser(UUID.randomUUID(), "synthetic", "+10000000000", List.of("CUSTOMER"), 1L);
    final UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(user, null);
    final DeletionView view = new DeletionView(UUID.randomUUID(), "CUSTOMER", "SCHEDULED", Instant.parse("2026-11-04T10:00:00Z"),
        Instant.parse("2026-12-04T10:00:00Z"), null);

    @Test
    void aNewRequestIs201AndTheIdentityComesOnlyFromAuthentication() {
        when(service.request(user, Scope.ALL, Via.WEB)).thenReturn(new Created(view, true));

        var response = controller.request(authentication, body("{\"scope\":\"ALL\",\"via\":\"WEB\"}"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isEqualTo(view);
    }

    @Test
    void theOpenRequestAskedAgainIs200() {
        when(service.request(user, Scope.CUSTOMER, Via.APP)).thenReturn(new Created(view, false));

        var response = controller.request(authentication, body("{\"scope\":\"CUSTOMER\"}"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(view);
    }

    @Test
    void viaDefaultsToApp() {
        when(service.request(user, Scope.CHEF, Via.APP)).thenReturn(new Created(view, true));

        controller.request(authentication, body("{\"scope\":\"CHEF\"}"));

        verify(service).request(user, Scope.CHEF, Via.APP);
    }

    @Test
    void refusesUnknownDuplicateOversizeTrailingAndMistypedBodyFields() {
        String id = UUID.randomUUID().toString();
        for (String bad : List.of(
            "{}",
            "{\"via\":\"APP\"}",
            "{\"scope\":\"CUSTOMER\",\"identityId\":\"" + id + "\"}",
            "{\"scope\":\"CUSTOMER\",\"scope\":\"ALL\"}",
            "{\"scope\":true}",
            "{\"scope\":\"EVERYTHING\"}",
            "{\"scope\":\"customer\"}",
            "{\"scope\":\"CUSTOMER\",\"via\":\"FAX\"}",
            "{\"scope\":\"CUSTOMER\",\"via\":null}",
            "{}{}", "[1,2]", " ".repeat(4097)))
            assertThatThrownBy(() -> controller.request(authentication, body(bad)))
                .as(bad).isInstanceOfSatisfying(AuthException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(error.getCode()).isEqualTo("ACCOUNT_DELETION_REQUEST_INVALID");
                });
        verify(service, never()).request(any(), any(), any());
    }

    @Test
    void viewAndKeepUseTheAuthenticatedIdentity() {
        when(service.current(user.identityId())).thenReturn(view);
        when(service.keep(user)).thenReturn(view);

        assertThat(controller.current(authentication)).isEqualTo(view);
        assertThat(controller.keep(authentication)).isEqualTo(view);
    }

    @Test
    void everyRouteNeedsASignedInPerson() {
        assertThatThrownBy(() -> controller.request(null, body("{\"scope\":\"CUSTOMER\"}")))
            .isInstanceOfSatisfying(AuthException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> controller.current(null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> controller.keep(null)).isInstanceOf(AuthException.class);
    }

    @Test
    void switchedOffAnswers503BeforeTheBodyIsRead() {
        var off = new AccountDeletionController(new AccountDeletionService(mock(AccountDeletionRepository.class),
            mock(AuthIdentityRepository.class), mock(AuthIdentityRoleRepository.class), mock(DeletionNotices.class),
            mock(AccountErasureClient.class), new AccountDeletionProperties(), mock(PlatformTransactionManager.class), Clock.systemUTC(), Runnable::run),
            new ObjectMapper());

        for (var call : List.<Runnable>of(
            () -> off.request(authentication, body("not json")),
            () -> off.current(authentication),
            () -> off.keep(authentication)))
            assertThatThrownBy(call::run).isInstanceOfSatisfying(AuthException.class, error -> {
                assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(error.getCode()).isEqualTo("ACCOUNT_DELETION_NOT_ENABLED");
            });
    }

    private static MockHttpServletRequest body(String json) {
        var request = new MockHttpServletRequest();
        request.setContentType("application/json");
        request.setContent(json.getBytes(StandardCharsets.UTF_8));
        return request;
    }
}

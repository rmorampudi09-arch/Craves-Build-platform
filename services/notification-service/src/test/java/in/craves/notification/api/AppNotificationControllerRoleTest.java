package in.craves.notification.api;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.notification.repository.NotificationRepository;
import in.craves.notification.security.CravesPrincipal;
import in.craves.notification.service.ImportantEmailPolicyProperties;
import in.craves.notification.service.NotificationService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Wire level: the optional {@code role} query parameter reaches the repository normalised, or is a 400. */
class AppNotificationControllerRoleTest {
    private final UUID identity = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    private NotificationRepository repository;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        repository = mock(NotificationRepository.class);
        NotificationService service = new NotificationService(repository, mock(ImportantEmailPolicyProperties.class));
        mvc = MockMvcBuilders.standaloneSetup(new AppNotificationController(service)).build();
    }

    private RequestPostProcessor signedIn() {
        var auth = new UsernamePasswordAuthenticationToken(
            new CravesPrincipal(identity, null, Set.of("CHEF")), null, List.of());
        return request -> {
            request.setUserPrincipal(auth);
            return request;
        };
    }

    @Test
    void listPassesRoleUpperCasedAndNullWhenAbsent() throws Exception {
        mvc.perform(get("/api/v1/notifications/in-app").param("role", "chef").with(signedIn()))
            .andExpect(status().isOk());
        verify(repository).findAppNotices(identity, 50, "CHEF");

        mvc.perform(get("/api/v1/notifications/in-app").with(signedIn())).andExpect(status().isOk());
        verify(repository).findAppNotices(identity, 50, null);
    }

    @Test
    void pagePassesRole() throws Exception {
        mvc.perform(get("/api/v1/notifications/in-app/page").param("role", "CUSTOMER").with(signedIn()))
            .andExpect(status().isOk());
        verify(repository).findAppNoticesPage(eq(identity), eq(51), isNull(), eq(false), eq("CUSTOMER"));

        mvc.perform(get("/api/v1/notifications/in-app/page").with(signedIn())).andExpect(status().isOk());
        verify(repository).findAppNoticesPage(eq(identity), eq(51), isNull(), eq(false), isNull());
    }

    @Test
    void unreadCountPassesRole() throws Exception {
        when(repository.countUnreadAppNotices(identity, "CHEF")).thenReturn(3L);

        mvc.perform(get("/api/v1/notifications/in-app/unread-count").param("role", "CHEF").with(signedIn()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unreadCount").value(3));
        mvc.perform(get("/api/v1/notifications/in-app/unread-count").with(signedIn()))
            .andExpect(status().isOk());
        verify(repository).countUnreadAppNotices(identity, null);
    }

    @Test
    void readAllPassesRole() throws Exception {
        mvc.perform(patch("/api/v1/notifications/in-app/read-all").param("role", "CHEF").with(signedIn()))
            .andExpect(status().isNoContent());
        verify(repository).markAllRead(identity, "CHEF");

        mvc.perform(patch("/api/v1/notifications/in-app/read-all").with(signedIn()))
            .andExpect(status().isNoContent());
        verify(repository).markAllRead(identity, null);
    }

    @Test
    void anUnknownRoleIsABadRequestOnEveryEndpointAndNeverReachesTheRepository() throws Exception {
        for (String bad : List.of("ADMIN", "", "CHEF,CUSTOMER")) {
            mvc.perform(get("/api/v1/notifications/in-app").param("role", bad).with(signedIn()))
                .andExpect(status().isBadRequest());
            mvc.perform(get("/api/v1/notifications/in-app/page").param("role", bad).with(signedIn()))
                .andExpect(status().isBadRequest());
            mvc.perform(get("/api/v1/notifications/in-app/unread-count").param("role", bad).with(signedIn()))
                .andExpect(status().isBadRequest());
            mvc.perform(patch("/api/v1/notifications/in-app/read-all").param("role", bad).with(signedIn()))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(repository);
    }
}

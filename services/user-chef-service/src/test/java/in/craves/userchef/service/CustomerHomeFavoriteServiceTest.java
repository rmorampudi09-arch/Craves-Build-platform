package in.craves.userchef.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteEntityType;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchChannel;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class CustomerHomeFavoriteServiceTest {
    private JdbcTemplate jdbcTemplate;
    private CustomerHomeFavoriteService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new CustomerHomeFavoriteService(jdbcTemplate);
    }

    @Test
    void rejectsNonCustomerBeforeDatabaseAccess() {
        CurrentUser chef = new CurrentUser(UUID.randomUUID(), "chef", "+910000000000", List.of("CHEF"));

        assertThatThrownBy(() -> service.listFavoriteChefs(chef, 50, null))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("CUSTOMER_ROLE_REQUIRED"));

        verify(jdbcTemplate, never()).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void rejectsSelfFavoriteBeforeApprovalLookup() {
        UUID identityId = UUID.randomUUID();
        CurrentUser customer = customer(identityId);

        assertThatThrownBy(() -> service.saveFavoriteChef(customer, identityId))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("CANNOT_FAVORITE_SELF"));

        verify(jdbcTemplate, never()).queryForObject(anyString(), eq(Boolean.class), any());
    }

    @Test
    void rejectsChefThatIsNotCurrentlyApproved() {
        UUID chefIdentityId = UUID.randomUUID();
        when(jdbcTemplate.queryForObject(anyString(), eq(Boolean.class), eq(chefIdentityId))).thenReturn(false);

        assertThatThrownBy(() -> service.saveFavoriteChef(customer(UUID.randomUUID()), chefIdentityId))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("APPROVED_CHEF_NOT_FOUND"));
    }

    @Test
    void watchRequiresExplicitEntityTypeAndChannel() {
        CurrentUser customer = customer(UUID.randomUUID());

        assertThatThrownBy(() -> service.upsertWatch(
            customer,
            null,
            UUID.randomUUID(),
            FavoriteWatchChannel.IN_APP,
            true
        )).isInstanceOf(ApiException.class);

        assertThatThrownBy(() -> service.upsertWatch(
            customer,
            FavoriteEntityType.MENU_ITEM,
            UUID.randomUUID(),
            null,
            true
        )).isInstanceOf(ApiException.class);
    }

    @Test
    void invalidPageSizeFailsClosed() {
        assertThatThrownBy(() -> service.listFavoriteKitchens(customer(UUID.randomUUID()), 101, null))
            .isInstanceOf(ApiException.class)
            .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("INVALID_PAGE_SIZE"));
    }

    private static CurrentUser customer(UUID identityId) {
        return new CurrentUser(identityId, "customer", "+919876543210", List.of("CUSTOMER"));
    }
}

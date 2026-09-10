package in.craves.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class PublicMenuBatchResolveServiceValidationTest {
    private NamedParameterJdbcTemplate jdbc;
    private PublicMenuBatchResolveService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        service = new PublicMenuBatchResolveService(jdbc);
    }

    @Test
    void rejectsEmptyBatchBeforeDatabaseAccess() {
        ApiException error = catchThrowableOfType(
            () -> service.resolve(new ResolveMenuItemsRequest(List.of())),
            ApiException.class
        );

        assertThat(error.getStatus()).isEqualTo(400);
        assertThat(error.getCode()).isEqualTo("MENU_ITEM_IDS_REQUIRED");
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsMoreThanOneHundredItemsBeforeDatabaseAccess() {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            ids.add(UUID.randomUUID());
        }

        ApiException error = catchThrowableOfType(
            () -> service.resolve(new ResolveMenuItemsRequest(ids)),
            ApiException.class
        );

        assertThat(error.getStatus()).isEqualTo(400);
        assertThat(error.getCode()).isEqualTo("TOO_MANY_MENU_ITEMS");
        verifyNoInteractions(jdbc);
    }
}

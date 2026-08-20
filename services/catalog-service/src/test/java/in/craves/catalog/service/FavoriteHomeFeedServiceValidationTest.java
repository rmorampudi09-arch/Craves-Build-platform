package in.craves.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class FavoriteHomeFeedServiceValidationTest {
    private NamedParameterJdbcTemplate jdbc;
    private FavoriteHomeFeedService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        service = new FavoriteHomeFeedService(jdbc);
    }

    @Test
    void rejectsEmptyRelationshipBatchBeforeDatabaseAccess() {
        ApiException error = catchThrowableOfType(
            () -> service.resolve(new ResolveFavoriteHomeRequest(List.of(), List.of())),
            ApiException.class
        );
        assertThat(error.getCode()).isEqualTo("FAVORITE_RELATIONSHIPS_REQUIRED");
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsMoreThanOneHundredRelationshipsBeforeDatabaseAccess() {
        List<UUID> chefs = new ArrayList<>();
        for (int i = 0; i < 101; i++) chefs.add(UUID.randomUUID());
        ApiException error = catchThrowableOfType(
            () -> service.resolve(new ResolveFavoriteHomeRequest(chefs, List.of())),
            ApiException.class
        );
        assertThat(error.getCode()).isEqualTo("TOO_MANY_FAVORITE_RELATIONSHIPS");
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsNullRelationshipIdsBeforeDatabaseAccess() {
        ApiException error = catchThrowableOfType(
            () -> service.resolve(new ResolveFavoriteHomeRequest(java.util.Arrays.asList(UUID.randomUUID(), null), List.of())),
            ApiException.class
        );
        assertThat(error.getCode()).isEqualTo("CHEF_ID_REQUIRED");
        verifyNoInteractions(jdbc);
    }
}

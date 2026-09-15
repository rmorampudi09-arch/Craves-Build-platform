package in.craves.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.KitchenScheduleService;
import in.craves.catalog.web.KitchenScheduleDtos.DateWindowRequest;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenDateOverrideRequest;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenScheduleUpdateRequest;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KitchenScheduleControllerValidationTest {
    private KitchenScheduleService service;
    private DiscoveryCacheService cache;
    private KitchenScheduleController controller;

    @BeforeEach
    void setUp() {
        service = mock(KitchenScheduleService.class);
        cache = mock(DiscoveryCacheService.class);
        controller = new KitchenScheduleController(service, cache);
    }

    @Test
    void rejectsNullWeeklyWindowBeforeServiceExecution() {
        ApiException exception = catchThrowableOfType(
            () -> controller.replace(
                null,
                new KitchenScheduleUpdateRequest(true, null, null, java.util.Arrays.asList((KitchenScheduleDtos.ServiceWindowRequest) null))
            ),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_SERVICE_WINDOW");
        verifyNoInteractions(service, cache);
    }

    @Test
    void rejectsNullDateOverrideWindowBeforeServiceExecution() {
        ApiException exception = catchThrowableOfType(
            () -> controller.putOverride(
                null,
                LocalDate.of(2026, 8, 20),
                new KitchenDateOverrideRequest(false, null, java.util.Arrays.asList((DateWindowRequest) null))
            ),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_SERVICE_WINDOW");
        verifyNoInteractions(service, cache);
    }
}

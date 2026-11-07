package in.craves.advanced.corporatemeals;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import in.craves.advanced.platform.web.ApiProblem;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** M24d: while checkout applies company shares, the person can neither confirm nor release a checkout's charge themselves. */
class CorporateMealsCheckoutSwitchTest {
    @Test
    void confirmAndReleaseAreLeftToCheckoutWhileTheSwitchIsOn() {
        var controller = new CorporateMealsController(null, null, true); // never reaches the service
        UUID charge = UUID.randomUUID();
        var release = assertThrows(ApiProblem.class, () -> controller.releaseCompanyMeal(charge));
        assertEquals(409, release.status());
        assertEquals("COMPANY_SHARE_RELEASED_BY_CHECKOUT", release.code());
        var confirm = assertThrows(ApiProblem.class,
                () -> controller.confirmCompanyMeal(charge, new CorporateMealsDtos.CompanyChargeConfirm(UUID.randomUUID())));
        assertEquals("COMPANY_SHARE_CONFIRMED_BY_CHECKOUT", confirm.code());
    }
}

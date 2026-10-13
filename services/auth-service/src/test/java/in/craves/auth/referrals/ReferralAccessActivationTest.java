package in.craves.auth.referrals;

import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ReferralAccessActivationTest {
    private final ApplicationContextRunner context=new ApplicationContextRunner()
        .withUserConfiguration(ReferralAccessController.class)
        .withBean(AuthIdentityRepository.class,()->mock(AuthIdentityRepository.class))
        .withBean(AuthIdentityRoleRepository.class,()->mock(AuthIdentityRoleRepository.class));

    @Test void disabledByDefault() {
        context.run(result->assertThat(result).doesNotHaveBean(ReferralAccessController.class));
    }

    @Test void readOnlyGateDoesNotActivateEnrollmentOrTransport() {
        context.withUserConfiguration(ReferralEnrollment.class,
                in.craves.auth.referrals.transport.ReferralTransportConfiguration.class)
            .withPropertyValues("CRAVES_REFERRAL_MEMBER_READ_ENABLED=true",
                "CRAVES_REFERRAL_SOURCE_ENABLED=false").run(result->{
            assertThat(result).hasSingleBean(ReferralAccessController.class);
            assertThat(result).doesNotHaveBean(ReferralEnrollment.class);
            assertThat(result).doesNotHaveBean(in.craves.auth.referrals.transport.ReferralTransportConfiguration.class);
        });
    }

    @Test void existingSourceGateKeepsAccessAvailable() {
        context.withPropertyValues("CRAVES_REFERRAL_SOURCE_ENABLED=true").run(
            result->assertThat(result).hasSingleBean(ReferralAccessController.class));
    }

    @Test void explicitOffKeepsEndpointUnavailable() {
        context.withPropertyValues("CRAVES_REFERRAL_SOURCE_ENABLED=false",
                "CRAVES_REFERRAL_MEMBER_READ_ENABLED=false").run(
            result->assertThat(result).doesNotHaveBean(ReferralAccessController.class));
    }
}

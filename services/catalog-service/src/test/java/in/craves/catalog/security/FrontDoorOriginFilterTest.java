package in.craves.catalog.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class FrontDoorOriginFilterTest {
    private static final String OURS = "59117d14-1c4f-402e-a98b-0fa1009de276";
    private static final String THEIRS = "0f0f0f0f-1c4f-402e-a98b-0fa1009de276";

    private MockHttpServletResponse response;

    /** True when the request was passed on to catalog. */
    private boolean passes(String mode, String id, String fdid) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/catalog/kitchens");
        if (fdid != null) request.addHeader(FrontDoorOriginFilter.HEADER, fdid);
        response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        new FrontDoorOriginFilter(mode, id).doFilter(request, response, chain);
        return chain.getRequest() != null;
    }

    @Test
    void enforceRefusesAnotherCompanysFrontDoor() throws Exception {
        assertThat(passes("enforce", OURS, THEIRS)).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
    }

    @Test
    void enforceAnswersOurFrontDoorAndCallersThatUseNoFrontDoor() throws Exception {
        assertThat(passes("enforce", OURS, OURS)).isTrue();
        assertThat(passes("enforce", " " + OURS + "\n", OURS)).isTrue();
        // APIM and our own apps reach catalog without Front Door, so without the header.
        assertThat(passes("enforce", OURS, null)).isTrue();
    }

    @Test
    void reportAndOffNeverRefuse() throws Exception {
        assertThat(passes("report", OURS, THEIRS)).isTrue();
        assertThat(passes(null, OURS, THEIRS)).isTrue();
        assertThat(passes("ENFORCE", OURS, THEIRS)).isTrue();
    }

    @Test
    void enforceWithoutAnIdFailsOpen() throws Exception {
        assertThat(passes("enforce", "", THEIRS)).isTrue();
        assertThat(passes("enforce", null, THEIRS)).isTrue();
    }
}

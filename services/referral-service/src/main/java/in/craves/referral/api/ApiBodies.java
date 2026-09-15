package in.craves.referral.api;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralProblem;
import in.craves.referral.infra.Json;
import in.craves.referral.security.SourceAuthenticationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import static in.craves.referral.ReferralProblem.require;

public final class ApiBodies {
    private ApiBodies() { }
    public static JsonNode read(HttpServletRequest request) {
        try {
            byte[] signed=(byte[])request.getAttribute(SourceAuthenticationFilter.BODY_ATTRIBUTE);
            byte[] bytes;
            if(signed!=null) bytes=signed;
            else {
                require(request.getContentType()!=null && request.getContentType().matches("(?i)application/json(?:;\\s*charset=utf-8)?"),415,"JSON_REQUIRED");
                require(request.getContentLengthLong()<=16384,413,"REQUEST_BODY_TOO_LARGE");
                bytes=request.getInputStream().readNBytes(16385);
                require(bytes.length<=16384,413,"REQUEST_BODY_TOO_LARGE");
            }
            String value=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            return Json.parse(value);
        } catch(ReferralProblem ex) { throw ex; }
        catch(Exception ex) { throw new ReferralProblem(422,"INVALID_REQUEST_BODY"); }
    }
}

package in.craves.referral.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import in.craves.referral.domain.CashoutService;
import in.craves.referral.domain.ProgramService;
import in.craves.referral.infra.Json;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/referrals/me")
public class MemberController {
    private final MemberQueries queries;
    private final ProgramService program;
    private final CashoutService cashouts;
    public MemberController(MemberQueries queries,ProgramService program,CashoutService cashouts) {
        this.queries=queries; this.program=program; this.cashouts=cashouts;
    }
    private static UUID user(Authentication auth) { return UUID.fromString(auth.getName()); }
    @GetMapping public Object overview(Authentication auth) { return queries.overview(user(auth)); }
    @GetMapping("/chef-earnings") public Object chefEarnings(Authentication auth) { return queries.chefEarnings(user(auth)); }
    @GetMapping("/code") public Object code(Authentication auth) { return program.code(user(auth)); }
    @GetMapping("/code/qr") public ResponseEntity<String> qr(Authentication auth) throws Exception {
        String link=program.code(user(auth)).get("link").toString();
        var matrix=new MultiFormatWriter().encode(link,BarcodeFormat.QR_CODE,256,256,Map.of(EncodeHintType.ERROR_CORRECTION,ErrorCorrectionLevel.M,EncodeHintType.MARGIN,4));
        StringBuilder paths=new StringBuilder();
        for(int y=0;y<matrix.getHeight();y++) for(int x=0;x<matrix.getWidth();x++) if(matrix.get(x,y)) paths.append('M').append(x).append(' ').append(y).append("h1v1h-1z");
        String svg="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Your Craves referral QR code\"><rect width=\"256\" height=\"256\" fill=\"white\"/><path d=\""+paths+"\" fill=\"black\"/></svg>";
        return ResponseEntity.ok().contentType(MediaType.valueOf("image/svg+xml"))
            .header("Content-Security-Policy","default-src 'none'; sandbox").header("Cache-Control","private, no-store, max-age=0").body(svg);
    }
    @GetMapping("/rewards") public Object rewards(Authentication auth,@RequestParam(defaultValue="25") int limit,@RequestParam(required=false) String cursor) {
        return queries.rewards(user(auth),limit,cursor);
    }
    @GetMapping("/cashouts") public Object cashouts(Authentication auth,@RequestParam(defaultValue="25") int limit,@RequestParam(required=false) String cursor) {
        return queries.cashouts(user(auth),limit,cursor);
    }
    @PostMapping("/cashouts") public Object requestCashout(Authentication auth,HttpServletRequest request) {
        JsonNode body=ApiBodies.read(request); Json.fields(body,"requestId","amountPaise");
        return cashouts.request(user(auth),Json.uuid(body,"requestId"),Json.money(body,"amountPaise"));
    }
    @PostMapping("/cashouts/{id}/cancel") public ResponseEntity<Void> cancel(Authentication auth,@PathVariable UUID id,HttpServletRequest request) {
        Json.fields(ApiBodies.read(request)); cashouts.cancel(user(auth),id); return ResponseEntity.noContent().build();
    }
}

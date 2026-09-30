package in.craves.integration.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.CartBillPreviewFinanceService;
import in.craves.integration.finance.source.FinancialJson;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class InternalCartBillPreviewController {
    private final CartBillPreviewFinanceService previews;
    private final ObjectMapper json;
    private final String key;

    public InternalCartBillPreviewController(CartBillPreviewFinanceService previews, ObjectMapper json,
        @Value("${CRAVES_FINANCE_INTERNAL_KEY:}") String key) {
        this.previews = previews;
        this.json = json;
        this.key = key;
    }

    @PostMapping("/internal/v1/finance/cart-preview")
    public CartBillPreviewFinanceService.Response preview(HttpServletRequest request) throws IOException {
        byte[] body = request.getInputStream().readNBytes(524289);
        if (!FinancialJson.authentic(body, request.getHeader("X-Craves-Finance-Signature"), key))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid finance service authentication");
        try { return previews.preview(json.readValue(body, CartBillPreviewFinanceService.Request.class)); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage()); }
        catch (IllegalStateException ex) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Bill calculation is unavailable"); }
    }
}

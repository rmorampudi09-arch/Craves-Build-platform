package in.craves.integration.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.finance.source.OrderFinancialQuoteService;
import in.craves.integration.finance.source.OrderFinancialFinalizationService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/v1/finance")
public class InternalOrderFinanceController {
    private final ObjectMapper json;private final OrderFinancialQuoteService quotes;private final OrderFinancialFinalizationService events;private final String key;
    public InternalOrderFinanceController(ObjectMapper json,OrderFinancialQuoteService quotes,OrderFinancialFinalizationService events,
        @Value("${CRAVES_FINANCE_INTERNAL_KEY:}") String key){this.json=json;this.quotes=quotes;this.events=events;this.key=key;}
    @PostMapping("/quotes") public OrderFinancialQuoteService.Response quote(HttpServletRequest request)throws IOException {
        byte[] body=verified(request);return quotes.quote(json.readValue(body,OrderFinancialQuoteService.Request.class));
    }
    @PostMapping("/events") public OrderFinancialFinalizationService.Receipt accept(HttpServletRequest request)throws IOException {
        return events.accept(json.readTree(verified(request)));
    }
    private byte[] verified(HttpServletRequest request)throws IOException {
        byte[] body=request.getInputStream().readNBytes(524289);
        if(body.length>524288)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        if(!FinancialJson.authentic(body,request.getHeader("X-Craves-Finance-Signature"),key))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Invalid finance service authentication");
        return body;
    }
}

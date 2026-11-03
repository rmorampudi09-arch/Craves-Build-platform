package in.craves.order.advanced;

import in.craves.order.advanced.KitchenLoad.KitchenLoadResponse;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Any signed-in person can ask how busy a kitchen is (extra minutes, never the order count). Reached through the customer order API. */
@RestController
@RequestMapping("/api/v1/orders/kitchen-load")
public class KitchenLoadController {
    private final KitchenLoad load;

    public KitchenLoadController(KitchenLoad load) {
        this.load = load;
    }

    @GetMapping
    public ResponseEntity<KitchenLoadResponse> kitchenLoad(@RequestParam UUID kitchenId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(load.load(kitchenId));
    }
}

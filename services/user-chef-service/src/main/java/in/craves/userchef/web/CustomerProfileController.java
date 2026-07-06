package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.CustomerProfileService;
import in.craves.userchef.web.ApiDtos.CustomerAddressRequest;
import in.craves.userchef.web.ApiDtos.CustomerAddressResponse;
import in.craves.userchef.web.ApiDtos.CustomerProfileRequest;
import in.craves.userchef.web.ApiDtos.CustomerProfileResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer")
public class CustomerProfileController {
    private final CustomerProfileService service;

    public CustomerProfileController(CustomerProfileService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public CustomerProfileResponse getProfile(@AuthenticationPrincipal CurrentUser user) {
        return service.getProfile(user);
    }

    @PutMapping("/profile")
    public CustomerProfileResponse upsertProfile(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody CustomerProfileRequest request
    ) {
        return service.upsertProfile(user, request);
    }

    @GetMapping("/addresses")
    public List<CustomerAddressResponse> listAddresses(@AuthenticationPrincipal CurrentUser user) {
        return service.listAddresses(user);
    }

    @PostMapping("/addresses")
    public CustomerAddressResponse addAddress(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody CustomerAddressRequest request
    ) {
        return service.addAddress(user, request);
    }

    @PutMapping("/addresses/{addressId}")
    public CustomerAddressResponse updateAddress(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID addressId,
        @Valid @RequestBody CustomerAddressRequest request
    ) {
        return service.updateAddress(user, addressId, request);
    }

    @DeleteMapping("/addresses/{addressId}")
    public void deleteAddress(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID addressId) {
        service.deleteAddress(user, addressId);
    }
}

package in.craves.integration.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Verification state for partner-gated hyperlocal delivery contracts.
 *
 * <p>This deliberately stores no guessed endpoint, auth-header or payload semantics. Shadowfax,
 * Porter and Delhivery publish enough product information to identify the required product family,
 * but Craves must receive and review the actual partner API contract before an executable adapter
 * can be enabled. Every flag therefore defaults to false.</p>
 */
@Component
@ConfigurationProperties(prefix = "craves.delivery-provider-contracts")
public class DeliveryProviderContractProperties {
    private Contract shadowfax = new Contract();
    private Contract porter = new Contract();
    private Contract delhivery = new Contract();

    public Contract getShadowfax() {
        return shadowfax;
    }

    public void setShadowfax(Contract shadowfax) {
        this.shadowfax = shadowfax == null ? new Contract() : shadowfax;
    }

    public Contract getPorter() {
        return porter;
    }

    public void setPorter(Contract porter) {
        this.porter = porter == null ? new Contract() : porter;
    }

    public Contract getDelhivery() {
        return delhivery;
    }

    public void setDelhivery(Contract delhivery) {
        this.delhivery = delhivery == null ? new Contract() : delhivery;
    }

    public static class Contract {
        private boolean contractVerified;
        private boolean credentialModelVerified;
        private boolean serviceabilitySchemaVerified;
        private boolean quoteSchemaVerified;
        private boolean createSchemaVerified;
        private boolean cancelSchemaVerified;
        private boolean trackSchemaVerified;
        private boolean webhookSchemaVerified;
        private boolean createReconciliationVerified;
        private boolean hyderabadServiceabilityVerified;
        private String contractVersion = "";

        /**
         * Minimum contract evidence required before a provider may be treated as executable by
         * Craves. This does not activate the provider: a real DeliveryProviderAdapter and the
         * database/runtime activation gates are still independently required.
         */
        public boolean executableContractReady() {
            return contractVerified
                && credentialModelVerified
                && serviceabilitySchemaVerified
                && quoteSchemaVerified
                && createSchemaVerified
                && cancelSchemaVerified
                && trackSchemaVerified
                && webhookSchemaVerified
                && createReconciliationVerified
                && hyderabadServiceabilityVerified
                && StringUtils.hasText(contractVersion);
        }

        public boolean isContractVerified() {
            return contractVerified;
        }

        public void setContractVerified(boolean contractVerified) {
            this.contractVerified = contractVerified;
        }

        public boolean isCredentialModelVerified() {
            return credentialModelVerified;
        }

        public void setCredentialModelVerified(boolean credentialModelVerified) {
            this.credentialModelVerified = credentialModelVerified;
        }

        public boolean isServiceabilitySchemaVerified() {
            return serviceabilitySchemaVerified;
        }

        public void setServiceabilitySchemaVerified(boolean serviceabilitySchemaVerified) {
            this.serviceabilitySchemaVerified = serviceabilitySchemaVerified;
        }

        public boolean isQuoteSchemaVerified() {
            return quoteSchemaVerified;
        }

        public void setQuoteSchemaVerified(boolean quoteSchemaVerified) {
            this.quoteSchemaVerified = quoteSchemaVerified;
        }

        public boolean isCreateSchemaVerified() {
            return createSchemaVerified;
        }

        public void setCreateSchemaVerified(boolean createSchemaVerified) {
            this.createSchemaVerified = createSchemaVerified;
        }

        public boolean isCancelSchemaVerified() {
            return cancelSchemaVerified;
        }

        public void setCancelSchemaVerified(boolean cancelSchemaVerified) {
            this.cancelSchemaVerified = cancelSchemaVerified;
        }

        public boolean isTrackSchemaVerified() {
            return trackSchemaVerified;
        }

        public void setTrackSchemaVerified(boolean trackSchemaVerified) {
            this.trackSchemaVerified = trackSchemaVerified;
        }

        public boolean isWebhookSchemaVerified() {
            return webhookSchemaVerified;
        }

        public void setWebhookSchemaVerified(boolean webhookSchemaVerified) {
            this.webhookSchemaVerified = webhookSchemaVerified;
        }

        public boolean isCreateReconciliationVerified() {
            return createReconciliationVerified;
        }

        public void setCreateReconciliationVerified(boolean createReconciliationVerified) {
            this.createReconciliationVerified = createReconciliationVerified;
        }

        public boolean isHyderabadServiceabilityVerified() {
            return hyderabadServiceabilityVerified;
        }

        public void setHyderabadServiceabilityVerified(boolean hyderabadServiceabilityVerified) {
            this.hyderabadServiceabilityVerified = hyderabadServiceabilityVerified;
        }

        public String getContractVersion() {
            return contractVersion;
        }

        public void setContractVersion(String contractVersion) {
            this.contractVersion = contractVersion == null ? "" : contractVersion.trim();
        }
    }
}

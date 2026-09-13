package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Registration assessment and fee-tax treatment are separate from ECO restaurant GST liability. */
@Service
public class ChefTaxProfileService {
    public record Profile(String stateCode,String supplyRegime,String registrationStatus,String gstin,
        String declaredAggregateTurnover,String financialYear,LocalDate declarationDate,
        String withholdingRate,String withholdingEvidence,String classificationEvidence,String feeTermsEvidence) {
        public Profile {
            if(!"36".equals(stateCode) || !"RESTAURANT_ECO_9_5".equals(supplyRegime))
                throw new IllegalArgumentException("Automatic launch accounting supports reviewed Telangana restaurant supplies only");
            if(!java.util.Set.of("UNREGISTERED","REGISTERED").contains(registrationStatus))throw new IllegalArgumentException("Registration status is required");
            if("REGISTERED".equals(registrationStatus)) {
                if(gstin==null || !gstin.matches("36[0-9A-Z]{13}"))throw new IllegalArgumentException("A matching Telangana GSTIN is required");
            } else if(gstin!=null && !gstin.isBlank())throw new IllegalArgumentException("Unregistered chef cannot carry a GSTIN");
            declaredAggregateTurnover=LedgerMoney.text(LedgerMoney.parse(declaredAggregateTurnover));
            if(financialYear==null || !financialYear.matches("20[0-9]{2}-[0-9]{2}") || declarationDate==null)throw new IllegalArgumentException("Dated turnover declaration required");
            withholdingRate=FinancePolicy.rate(withholdingRate);
            for(String evidence:java.util.List.of(withholdingEvidence,classificationEvidence,feeTermsEvidence))
                if(evidence.isBlank() || evidence.length()>240)throw new IllegalArgumentException("Bounded classification, withholding and fee terms evidence are required");
        }
    }
    public record Version(UUID id,UUID chefIdentityId,Profile profile,String registrationReview,String foodGstDeduction,String gstTcsDeduction) {}
    private final JdbcTemplate jdbc;private final ObjectMapper json;
    public ChefTaxProfileService(JdbcTemplate jdbc,ObjectMapper json){this.jdbc=jdbc;this.json=json;}
    @Transactional
    public Version save(CravesPrincipal actor,UUID chef,Profile profile,String reason) {
        FinancePolicyService.operator(actor);reason=FinancePolicyService.reason(reason);
        if(chef==null || profile==null)throw new IllegalArgumentException("Chef and tax profile are required");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_chef_tax_version(id,chef_identity_id,payload,approved_by,reason) VALUES (?,?,CAST(? AS jsonb),?,?)",id,chef,encode(profile),actor.identityId(),reason);
        jdbc.update("INSERT INTO payment_schema.finance_chef_tax_head(chef_identity_id,version_id) VALUES (?,?) ON CONFLICT(chef_identity_id) DO UPDATE SET version_id=EXCLUDED.version_id",chef,id);
        return read(actor,chef);
    }
    public Version read(CravesPrincipal actor,UUID chef){FinancePolicyService.reader(actor);return resolved(chef);}
    public Version resolved(UUID chef) {
        var rows=jdbc.query("SELECT v.id,v.payload::text FROM payment_schema.finance_chef_tax_head h JOIN payment_schema.finance_chef_tax_version v ON v.id=h.version_id WHERE h.chef_identity_id=?",(rs,n)->view(rs.getObject(1,UUID.class),chef,decode(rs.getString(2))),chef);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Reviewed chef tax and fee terms profile is missing");
        return rows.getFirst();
    }
    private Version view(UUID id,UUID chef,Profile profile) {
        String review="UNREGISTERED".equals(profile.registrationStatus()) && new BigDecimal(profile.declaredAggregateTurnover()).compareTo(new BigDecimal("2000000.00"))>0
            ?"REGISTRATION_REVIEW_REQUIRED":"DECLARATION_RECORDED_NOT_GOVERNMENT_VERIFICATION";
        return new Version(id,chef,profile,review,"0.00","0.00");
    }
    private String encode(Profile profile){try{return json.writeValueAsString(profile);}catch(Exception e){throw new IllegalArgumentException("Invalid tax profile",e);}}
    private Profile decode(String value){try{return json.readValue(value,Profile.class);}catch(Exception e){throw new IllegalStateException("Stored tax profile is invalid",e);}}
}

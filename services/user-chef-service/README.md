# Craves User & Chef Service

Spring Boot service for customer profiles, customer delivery addresses, chef applications, chef KYC file upload, and backoffice chef approval or rejection.

## Responsibilities

- Customer profile create/update/read.
- Customer address CRUD.
- Separate delivery contact phone number per address.
- Chef application submission with mandatory phone number from Craves JWT and mandatory email from request.
- Chef KYC proof file upload to Azure Blob Storage.
- Chef application status workflow: `NOT_SUBMITTED -> PENDING -> APPROVED / REJECTED`.
- Backoffice review APIs protected by `ADMIN` role.

## Database

Uses `craves_business_db`.

Flyway creates:

```text
customer_profile
customer_address
chef_application
chef_kyc_document
admin_chef_decision_audit
```

The actual proof files are stored in Azure Blob Storage. PostgreSQL stores only metadata such as blob container, blob name, content type, file size, and timestamps.

## Local run

```bash
cd services/user-chef-service
mvn spring-boot:run
```

Required environment variables for full local testing:

```env
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/craves_business_db
SPRING_DATASOURCE_USERNAME=cravesadmin
SPRING_DATASOURCE_PASSWORD=
CRAVES_JWT_VERIFICATION_PEM_BASE64=
CRAVES_STORAGE_ENDPOINT_VALUE=
CRAVES_STORAGE_DOCUMENTS_CONTAINER=documents
```

`CRAVES_JWT_VERIFICATION_PEM_BASE64` must be the Base64 value of the RSA public PEM that matches the Auth Service signing key.

Generate the public PEM from the private PEM used by Auth Service:

```bash
openssl rsa -in craves-jwt-private.pem -pubout -out craves-jwt-public.pem
base64 -w 0 craves-jwt-public.pem
```

## Main APIs

### Customer

```text
GET    /api/v1/customer/profile
PUT    /api/v1/customer/profile
GET    /api/v1/customer/addresses
POST   /api/v1/customer/addresses
PUT    /api/v1/customer/addresses/{addressId}
DELETE /api/v1/customer/addresses/{addressId}
```

### Chef

```text
GET    /api/v1/chef/application
POST   /api/v1/chef/application
POST   /api/v1/chef/application/proof-files
```

`proof-files` is multipart form-data:

```text
documentType = AADHAAR_CARD or PAN_CARD
file = PDF, JPG, or PNG
```

### Backoffice

```text
GET  /api/v1/backoffice/chef-reviews?status=PENDING
GET  /api/v1/backoffice/chef-reviews/{applicationId}
POST /api/v1/backoffice/chef-reviews/{applicationId}/approve
POST /api/v1/backoffice/chef-reviews/{applicationId}/reject
```

Backoffice endpoints require `ADMIN` role in the Craves access token.

## Deployment pipeline

Pipeline file:

```text
azure-pipelines-user-chef-service.yml
```

Required Azure DevOps variables:

```text
AZURE_SERVICE_CONNECTION
POSTGRES_BUSINESS_DB_URL
POSTGRES_BUSINESS_DB_USER
POSTGRES_BUSINESS_DB_PASSWORD
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_STORAGE_ENDPOINT_VALUE
```

Use secret variable type for password, JWT verification PEM value, and storage access value.

## Important next step after approval

This service marks a chef application as `APPROVED` in `craves_business_db`. The next hardening step is to add a secure internal Auth Service endpoint that assigns the `CHEF` role in `craves_auth_db` after admin approval.

targetScope = 'resourceGroup'

// Only a dormant NEW referral app. No dependency or current Craves app is updated.
// First run verify-release-plan.py against fresh inventory and review Azure what-if.
@minLength(3)
@maxLength(32)
param appName string
param location string
param managedEnvironmentId string
param userAssignedIdentityId string
param registryServer string
@description('Pin the scanned image to registry/repository@sha256:<64 lowercase hex>.')
param image string
@allowed(['REDIS', 'AUTH_HTTP'])
param authVerificationMode string = 'REDIS'
param authBaseUrl string = ''
param redisHost string = ''
param redisPort int = 6380
param redisUsername string = 'default'
param jwtIssuer string = 'https://api.craves.in/auth'
param jwtAudience string = 'craves-api'
param secretReferences object

var bindings = concat([
  {
    name: 'referral-db-url'
    env: 'REFERRAL_DB_URL'
    url: secretReferences.dbUrl
  }
  {
    name: 'referral-db-user'
    env: 'REFERRAL_DB_USER'
    url: secretReferences.dbUser
  }
  {
    name: 'referral-db-password'
    env: 'REFERRAL_DB_PASSWORD'
    url: secretReferences.dbPassword
  }
  {
    name: 'referral-jwt-public-pem'
    env: 'CRAVES_JWT_VERIFICATION_PEM_BASE64'
    url: secretReferences.jwtVerificationPem
  }
  {
    name: 'referral-auth-hmac'
    env: 'CRAVES_REFERRALS_AUTH_HMAC_BASE64'
    url: secretReferences.authHmac
  }
  {
    name: 'referral-order-hmac'
    env: 'CRAVES_REFERRALS_ORDER_HMAC_BASE64'
    url: secretReferences.orderHmac
  }
  {
    name: 'referral-finance-hmac'
    env: 'CRAVES_REFERRALS_FINANCE_HMAC_BASE64'
    url: secretReferences.financeHmac
  }
], authVerificationMode == 'REDIS' ? [
  {
    name: 'referral-redis-password'
    env: 'SPRING_DATA_REDIS_PASSWORD'
    url: secretReferences.redisPassword
  }
] : [])
var secureEnvironment = [for binding in bindings: {
  name: binding.env
  secretRef: binding.name
}]
var dormantEnvironment = [
  {
    name: 'CRAVES_REFERRALS_AUTH_VERIFICATION_MODE'
    value: authVerificationMode
  }
  {
    name: 'CRAVES_REFERRALS_AUTH_BASE_URL'
    value: authBaseUrl
  }
  {
    name: 'MANAGEMENT_HEALTH_REDIS_ENABLED'
    value: authVerificationMode == 'REDIS' ? 'true' : 'false'
  }
  {
    name: 'CRAVES_REFERRALS_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_WORKERS_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_AWARDS_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_SETTLEMENT_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_WITHDRAWALS_ENABLED'
    value: 'false'
  }
  {
    name: 'CRAVES_REFERRALS_SPENDING_ENABLED'
    value: 'false'
  }
  {
    name: 'REFERRAL_DB_POOL_SIZE'
    value: '8'
  }
  {
    name: 'CRAVES_JWT_ISSUER'
    value: jwtIssuer
  }
  {
    name: 'CRAVES_JWT_AUDIENCE'
    value: jwtAudience
  }
  {
    name: 'MANAGEMENT_ENDPOINT_HEALTH_GROUP_READINESS_INCLUDE'
    value: authVerificationMode == 'REDIS' ? 'readinessState,db,redis' : 'readinessState,db'
  }
]

// AUTH_HTTP never uses Redis. Do not bind an empty host: Spring still creates
// its lazy Redis template, and validates host syntax before serving requests.
var redisEnvironment = authVerificationMode == 'REDIS' ? [
  {
    name: 'SPRING_DATA_REDIS_HOST'
    value: redisHost
  }
  {
    name: 'SPRING_DATA_REDIS_PORT'
    value: string(redisPort)
  }
  {
    name: 'SPRING_DATA_REDIS_USERNAME'
    value: redisUsername
  }
  {
    name: 'SPRING_DATA_REDIS_SSL_ENABLED'
    value: 'true'
  }
] : []

resource referral 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  tags: {
    workload: 'craves-referral-v2'
    activation: 'disabled'
    changeScope: 'isolated-addition'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 5
      ingress: {
        external: false
        allowInsecure: false
        targetPort: 8080
        transport: 'http'
      }
      registries: [
        {
          server: registryServer
          identity: userAssignedIdentityId
        }
      ]
      secrets: [for binding in bindings: {
        name: binding.name
        keyVaultUrl: binding.url
        identity: userAssignedIdentityId
      }]
    }
    template: {
      containers: [
        {
          name: 'referral-service'
          image: image
          env: concat(secureEnvironment, dormantEnvironment, redisEnvironment)
          resources: {
            cpu: 1
            memory: '2Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/actuator/health/liveness'
                port: 8080
                scheme: 'HTTP'
              }
              periodSeconds: 5
              timeoutSeconds: 2
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/actuator/health/liveness'
                port: 8080
                scheme: 'HTTP'
              }
              periodSeconds: 15
              timeoutSeconds: 2
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/actuator/health/readiness'
                port: 8080
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output referralResourceId string = referral.id

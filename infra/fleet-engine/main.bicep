targetScope = 'resourceGroup'

// The fleet engine (services/fleet-engine, Java 21 and Spring Boot; docs/riders/SCALE.md): one new container app in the
// existing Container Apps environment, and nothing else. Nothing is created unless a person sets deployEngine=true. The
// app has no ingress (it only reaches out to Redis) and stays idle until integration-service writes to its streams, which
// needs CRAVES_FLEET_ENGINE_MODE=shadow or live there. No app that runs today changes. Steps and rollback: README.md here.

@description('Safety gate: nothing is created unless this is true.')
param deployEngine bool = false

@description('The container app. Only this name: a typo naming another app would replace that app.')
@allowed([
  'ca-craves-fleet-engine-prodlow'
])
param appName string = 'ca-craves-fleet-engine-prodlow'

param location string = resourceGroup().location

@description('Resource id of the existing Container Apps environment, cae-craves-prodlow-kmqgfy.')
param managedEnvironmentId string

@description('Resource id of an existing user-assigned identity with AcrPull on the registry and Key Vault Secrets User on the secret below (README.md, "Before you start").')
param userAssignedIdentityId string

param registryServer string = 'cravesrm09prodlow6bf632.azurecr.io'

@description('The image built from GitHub main, pinned by digest: <registry>/craves/fleet-engine@sha256:<64 lowercase hex>. Anything else creates nothing.')
param image string

@description('Key Vault secret URL whose value is the Redis URL integration-service uses: rediss://:<access key>@<host>:10000. Versionless, so a rotated key reaches the app (README.md, "After a Redis key rotation").')
param redisUrlSecretUrl string

@description('Must equal integration-service CRAVES_FLEET_ENGINE_RIDER_PARTITIONS.')
@minValue(1)
@maxValue(1024)
param riderPartitions int = 16

@description('Must equal integration-service CRAVES_FLEET_ENGINE_DISPATCH_PARTITIONS.')
@minValue(1)
@maxValue(1024)
param dispatchPartitions int = 16

@description('Instances share the partitions through leases. One serves thousands of riders (SCALE.md, "Capacity").')
@minValue(1)
@maxValue(4)
param replicas int = 1

// Pinned: this registry's craves/fleet-engine repository, by a digest of exactly 64 lowercase hex characters.
var repository = '${registryServer}/craves/fleet-engine@sha256:'
var digest = last(split(image, '@sha256:'))
var pinned = startsWith(image, repository) && length(image) == length(repository) + 64 && empty(filter(range(0, length(digest)),
  i => !contains('0123456789abcdef', substring(digest, i, 1))))
var create = deployEngine && pinned

resource engine 'Microsoft.App/containerApps@2024-03-01' = if (create) {
  name: appName
  location: location
  tags: {
    workload: 'craves-fleet-engine'
    activation: 'idle-until-integration-service-mode-is-set'
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
      registries: [
        {
          server: registryServer
          identity: userAssignedIdentityId
        }
      ]
      secrets: [
        {
          name: 'redis-url'
          keyVaultUrl: redisUrlSecretUrl
          identity: userAssignedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'fleet-engine'
          image: image
          env: [
            {
              name: 'FLEET_ENGINE_REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'FLEET_ENGINE_RIDER_PARTITIONS'
              value: string(riderPartitions)
            }
            {
              name: 'FLEET_ENGINE_DISPATCH_PARTITIONS'
              value: string(dispatchPartitions)
            }
            {
              // Production: the Redis URL must be rediss:// (TLS), and the live runtime lock is enforced.
              name: 'CRAVES_ENVIRONMENT'
              value: 'prodlow'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          // Spring Boot's probes (services/fleet-engine application.yml). The JVM's heap is 70% of the memory (the image's
          // JAVA_TOOL_OPTIONS), as for the other Craves services.
          probes: [
            {
              // A JVM on half a vCPU takes tens of seconds to start: up to 2 minutes before liveness counts.
              type: 'Startup'
              httpGet: {
                path: '/actuator/health/liveness'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 22
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/actuator/health/liveness'
                port: 8080
                scheme: 'HTTP'
              }
              periodSeconds: 15
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              // Not ready while Redis doesn't answer; the engine keeps retrying and serves again on its own.
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
        minReplicas: replicas
        maxReplicas: replicas
      }
    }
  }
}

output created bool = create
output imagePinnedByDigest bool = pinned

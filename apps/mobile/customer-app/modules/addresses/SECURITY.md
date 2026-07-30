# Security boundaries

- The bearer token is read only from the secure mobile session.
- Customer ownership remains enforced by User/Chef Service.
- Address identity IDs are excluded from the mobile contract.
- Coordinates are validated before every write or recommendation request.
- No device geolocation dependency is included until Android/iOS permission manifests are reviewed.

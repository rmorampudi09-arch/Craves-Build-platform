-- Granted and revoked only by the fleet backend through /internal/v1/roles/rider/{grant,revoke}.
INSERT INTO auth_role (code, description)
VALUES ('RIDER', 'Active Craves delivery partner role')
ON CONFLICT (code) DO NOTHING;

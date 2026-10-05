# Database CA bundle

`database-ca.crt` contains the public production CA certificates shipped by the official [Supabase CLI](https://github.com/supabase/cli/tree/develop/apps/cli-go/internal/gen/types/templates). Downloaded over verified HTTPS on October 4, 2026:

- `prod-ca-2021.crt`, SHA-256 certificate fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- `prod-ca-2025.crt`, SHA-256 certificate fingerprint `5F:9B:77:95:1A:7A:A1:30:3F:9B:58:EE:A9:BF:A8:9E:35:8C:FD:C1:5F:97:86:FF:10:D4:93:0A:72:2C:9A:E2`.

The migration runner uses this bundle by default and verifies the endpoint hostname. `DATABASE_CA_CERT_PATH` overrides the bundle when a project needs a different trusted CA. These are public certificates, not keys or credentials. Replace the bundle from an authenticated official source if Supabase rotates its roots; do not disable certificate verification.

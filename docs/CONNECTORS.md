# Connectors Reference & Operations Guide

`bi-kit` features an extensible, secure connector architecture supporting SQL databases (PostgreSQL, MySQL/MariaDB, SQL Server), NoSQL document databases (MongoDB), and file-based data sources (CSV, Excel, SQLite files).

---

## 1. Supported Connectors & Configuration Fields

### PostgreSQL (`postgres`)
- **Host**: Server IP address or hostname (e.g. `postgres.example.com`, `localhost`).
- **Port**: Default `5432`.
- **Database**: Database name.
- **Username**: Database user (recommended: read-only role).
- **Password**: Encrypted at rest via AES-256-GCM.
- **SSL Mode**: `disable` (plaintext / local dev), `require` (encrypted), `verify-full` (validates server certificate).
- **CA Certificate**: Optional PEM-encoded CA certificate for custom or internal root certificates.
- **Timeouts**: `connectTimeoutMs` (default 10,000 ms), `queryTimeoutMs` (default 30,000 ms).

### MySQL / MariaDB (`mysql`)
- **Host**: Server IP address or hostname.
- **Port**: Default `3306`.
- **Database**: Database schema name.
- **Username**: Database user.
- **Password**: Encrypted at rest via AES-256-GCM.
- **SSL Mode**: `disable`, `require`, `verify-full`.
- **CA Certificate**: Optional PEM-encoded CA certificate.
- **Timeouts**: `connectTimeoutMs` (default 10,000 ms), `queryTimeoutMs` (default 30,000 ms).

### Microsoft SQL Server (`mssql`)
- **Host**: Server hostname or IP address.
- **Port**: Default `1433`.
- **Database**: Initial catalog / database name.
- **Username**: SQL login (e.g. `sa` or `bi_readonly`).
- **Password**: Encrypted at rest.
- **Encryption**: TLS encrypted transport; `trustServerCertificate` enabled by default in local dev.
- **Timeouts**: Connection and request timeouts enforced at driver level.

### MongoDB (`mongodb`)
- **Modes**:
  - **Host Mode**: Host, port (`27017`), database, username, password, `authSource` (default `admin`), replica set, TLS toggle.
  - **Connection String Mode**: `mongodb://` or `mongodb+srv://` (parsed locally in browser into individual fields).
- **Read Preference**: `secondaryPreferred` (default), `primary`, `primaryPreferred`, `secondary`, `nearest`.
- **Schema Sampling Size**: Number of sampled documents to infer collection fields (default `1000`, range `10`–`10000`).

### File Connectors (`sqlite`, `csv`, `excel`)
- Files are stored in managed server-side directories under `DATA_DIR/files/{dataSourceId}/`.
- **SQLite**: Managed database copy with `PRAGMA query_only = ON` and `PRAGMA quick_check` verification.
- **CSV**: Automatic delimiter detection (`,`, `;`, `\t`, `|`), UTF-8 encoding (BOM stripped), schema type inference, and column overrides.
- **Excel**: `.xlsx` and `.xlsm` formats with worksheet tabs, custom header row selector, and column type overrides.

---

## 2. Read-Only Setup Snippets

Production deployments should always use dedicated read-only users.

### PostgreSQL
```sql
-- 1. Create dedicated user
CREATE USER bi_readonly WITH PASSWORD 'StrongPassword123!';

-- 2. Grant connection and schema access
GRANT CONNECT ON DATABASE analytics TO bi_readonly;
\c analytics
GRANT USAGE ON SCHEMA public TO bi_readonly;

-- 3. Grant SELECT on existing tables and views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_readonly;

-- 4. Automatically grant SELECT on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bi_readonly;
```

### MySQL / MariaDB
```sql
-- 1. Create dedicated user
CREATE USER 'bi_readonly'@'%' IDENTIFIED BY 'StrongPassword123!';

-- 2. Grant SELECT and SHOW VIEW privileges
GRANT SELECT, SHOW VIEW ON analytics.* TO 'bi_readonly'@'%';

-- 3. Flush privileges
FLUSH PRIVILEGES;
```

### Microsoft SQL Server
```sql
-- 1. Create server login
CREATE LOGIN bi_readonly WITH PASSWORD = 'StrongPassword123!';

-- 2. Switch to target database and create user
USE analytics;
CREATE USER bi_readonly FOR LOGIN bi_readonly;

-- 3. Add to read-only database role
ALTER ROLE db_datareader ADD MEMBER bi_readonly;
```

### MongoDB
```javascript
// Switch to admin database and create read-only user
use admin;
db.createUser({
  user: "bi_readonly",
  pwd: "StrongPassword123!",
  roles: [
    { role: "read", db: "analytics" }
  ]
});
```

---

## 3. Local Development Database Containers

A `docker-compose.dev.yml` file is included in the project root:

```bash
# Start all external test databases
docker compose -f docker-compose.dev.yml up -d

# Check health status
docker compose -f docker-compose.dev.yml ps

# Seed external databases with deterministic demo dataset
pnpm db:seed:external

# Stop containers
docker compose -f docker-compose.dev.yml down
```

| Database | Local Port | Database | Username | Password |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | `5433` | `bikit_dev` | `postgres` | `bi_password_123!` |
| **MySQL 8.0** | `3307` | `bikit_dev` | `mysql` | `bi_password_123!` |
| **SQL Server 2022**| `1434` | `bikit_dev` | `sa` | `Bi_Strong_Password_123!` |
| **MongoDB 7.0** | `27018` | `bikit_dev` | `mongoadmin` | `bi_password_123!` |

---

## 4. Environment Variables Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `CONNECTOR_SECRET_KEY` | auto-generated dev key | 32-byte base64 AES key for encrypting connection credentials. |
| `CONNECTOR_NETWORK_POLICY` | `allow-private` | Network guard policy (`allow-private` for local/intranet, `public-only` for cloud). |
| `CONNECTOR_HOST_ALLOWLIST`| *(empty)* | Optional comma-separated hosts or CIDR ranges permitted. |
| `CONNECTOR_HOST_DENYLIST` | *(empty)* | Optional comma-separated hosts or CIDR ranges explicitly blocked. |
| `CONNECTOR_MAX_CONCURRENCY`| `4` | Maximum concurrent queries allowed per data source. |
| `CONNECTOR_MAX_QUEUE` | `50` | Maximum queries waiting in queue per data source before rejecting. |
| `CONNECTOR_CACHE_TTL_MS` | `60000` | In-memory query result cache time-to-live in milliseconds. |
| `FILE_MAX_MB` | `100` | Maximum upload size for CSV, Excel, and SQLite files. |
| `SEED_EXTERNAL` | `false` | When set to `true`, `pnpm db:seed:workbook` seeds external demo sources and queries. |

---

## 5. Security & Read-Only Enforcement

- **Strict Read-Only Execution**: Mutation statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `ATTACH`, `EXEC`, `CALL`) are rejected by the query engine tokenizer before driver invocation.
- **Transaction Rollbacks**:
  - PostgreSQL connections run inside `BEGIN READ ONLY; ...; ROLLBACK;`.
  - MySQL connections run with `SET SESSION TRANSACTION READ ONLY`.
  - SQLite connections run with `PRAGMA query_only = ON`.
- **SSRF and Metadata Guarding**: The network guard resolves hostnames and unconditionally denies cloud instance metadata addresses (`169.254.169.254`, `fd00:ec2::254`, `fe80::/10`).
- **Credential Protection**: Passwords, connection strings, and certificates are redacted from all error messages and API DTOs using sentinel masking (`••••••••`).

---

## 6. Limitations & Hard Bounds

- **Single Statement Enforcement**: Multi-statement SQL strings (`query; DROP TABLE...`) are rejected.
- **Maximum Row Cap**: Queries are capped at 10,000 rows. When reached, a truncation banner is displayed.
- **Execution Timeout**: Queries default to a 30-second execution timeout. If exceeded, driver operations are cancelled/aborted.
- **Rate Limiting**: The unsaved connection test endpoint is limited to 10 requests per minute per user.

---

## 7. Troubleshooting Common Issues

### "Host unreachable / ECONNREFUSED"
- Verify that your database is running and accepting network connections.
- When running in Docker on macOS/Windows, connect using `host.docker.internal` instead of `localhost` if the container needs to access host services.
- Check firewall settings and ensure the port is open and bound to `0.0.0.0` or `127.0.0.1`.

### "Private host access blocked by security policy"
- If connecting to an internal network database and receiving a network guard error, verify `CONNECTOR_NETWORK_POLICY` is set to `allow-private`.

### "Too many concurrent queries for data source / Queue limit reached"
- The concurrency limiter caps active executions at `CONNECTOR_MAX_CONCURRENCY`. Dashboards automatically queue requests and display `Waiting for connection...`. Increase `CONNECTOR_MAX_CONCURRENCY` if needed.

### "Legacy .xls format is not supported"
- Convert legacy binary `.xls` files to modern XML `.xlsx` or `.xlsm` before uploading.

---

## 8. Checklist for Adding a New Connector

When implementing a new connector driver:
1. Create driver directory: `src/lib/connectors/drivers/<type>/`
2. Define configuration schema and fields: `definition.ts`
3. Implement driver interface: `connector.ts` (`test()`, `introspect()`, `run()`, `close()`)
4. Implement SQL dialect (if SQL): `src/lib/connectors/dialects/<type>.ts`
5. Register connector in `src/lib/connectors/registry.ts`
6. Add unit tests for config validation and read-only execution
7. Update `docs/CONNECTORS.md` with connection parameters and read-only setup

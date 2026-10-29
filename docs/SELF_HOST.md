# Self-Hosting BI Kit on macOS

This guide covers running BI Kit locally on macOS using **Docker Desktop** or **OrbStack** with production-grade data safety, automated backups, encrypted access modes, and zero-downtime updates.

---

## 1. Prerequisites & Storage Architecture

### Docker Engine
- Install **[OrbStack](https://orbstack.dev)** (recommended for speed and low battery drain) or **Docker Desktop for Mac**.
- Open Settings and enable **Start at login** to guarantee your financial dashboard and automated scheduled tasks (recurring transactions, daily valuation snapshots, and backups) run continuously in the background.

> [!CAUTION]
> **Time Machine & Docker VM Disks:**
> macOS Time Machine by default **excludes** virtual machine storage files (such as `Docker.raw` and OrbStack disk images). If your Mac experiences hardware failure or disk corruption, container volume files will NOT be recoverable from standard Time Machine snapshots.
> 
> To safeguard your financial records, BI Kit automatically dumps verified snapshots to the host filesystem at `./backups` every night at 01:30. Time Machine **does** back up host directory files in `./backups`.

---

## 2. First-Run Setup

### Step 1: Initialize Production Configuration
Run the interactive setup script. This script automatically generates cryptographically strong random secrets for PostgreSQL, connector encryption, and cron jobs:

```bash
./scripts/init-env.sh
```

You will be prompted for:
- **Admin Email**: Your login identifier (e.g., `you@example.com`)
- **Admin Name**: Display name (e.g., `Your Name`)
- **Admin Password**: Initial master password
- **Timezone**: Default is `Asia/Kolkata`
- **Host Port**: Default is `3100` (avoids clashes with port 3000)
- **APP_URL**: `http://localhost:3100`

The script writes `.env.production` and applies strict file permissions (`chmod 600`) so other users on your Mac cannot read your secrets.

### Step 2: Start BI Kit
Launch all services using the provided `Makefile`:

```bash
make up
```

This starts:
1. `db`: PostgreSQL 16 Alpine with `--data-checksums` and modest memory limits.
2. `app`: Sandboxed Next.js production container (non-root `nextjs` user, read-only root filesystem, tmpfs cache, memory capped at 512MB).
3. `scheduler`: Multi-arch Supercronic daemon triggering daily transactions and valuations at 02:00.
4. `backup`: Automated daily backup service running at 01:30 with grandfather-father-son retention.

### Step 3: Verify Health
Check container health:

```bash
make status
```

Once `bikit-app` reports `(healthy)`, open your browser:
- **URL:** [http://localhost:3100](http://localhost:3100)
- Log in with your configured admin credentials.
- Complete the onboarding setup wizard to initialize your personal accounts and tracking start date.

---

## 3. Network & Access Modes

Never expose raw ports to the public internet through router port forwarding. BI Kit supports three secure access modes:

### Mode A: Localhost Only (Default)
The application binds strictly to loopback interface `127.0.0.1:3100`. Only applications running locally on your Mac can connect.

### Mode B: Local Area Network (LAN) & Mobile Access via Caddy
Access BI Kit from your phone or tablet on the same Wi-Fi network using internal TLS and a local hostname (e.g., `finance.local`).

1. Ensure `APP_EXTRA_ORIGINS` in `.env.production` includes `https://finance.local`.
2. Start the internal TLS proxy:
   ```bash
   docker compose --profile lan up -d
   ```
3. Export Caddy's internal root certificate:
   ```bash
   docker compose exec proxy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
   ```
4. Transfer `caddy-root.crt` to your phone via AirDrop, iCloud Drive, or email.
5. **Install and trust the CA:**
   - **iOS:**
     1. Open the downloaded certificate -> Tap **Install**.
     2. Open **Settings** -> **General** -> **About** -> **Certificate Trust Settings**.
     3. Under "Enable full trust for root certificates", toggle ON the trust for Caddy Local Authority.
   - **Android:**
     1. Open **Settings** -> **Security** -> **Encryption & credentials** -> **Install a certificate** -> **CA certificate**.
     2. Select `caddy-root.crt` and confirm installation.
6. Open Safari or Chrome on your phone and navigate to `https://finance.local`.

### Mode C: Remote Access via Tailscale
For remote access outside your home without exposing ports:
1. Install [Tailscale](https://tailscale.com) on your Mac and mobile devices.
2. Share the port securely through your private Tailnet:
   ```bash
   tailscale serve --bg 3100
   ```
3. Update `APP_EXTRA_ORIGINS` in `.env.production` to trust your Tailscale MagicDNS name:
   ```env
   APP_EXTRA_ORIGINS=https://your-mac.tailnet-xyz.ts.net
   ```
4. Restart the app: `docker compose restart app`.
5. Access your dashboard remotely via end-to-end encrypted HTTPS at `https://your-mac.tailnet-xyz.ts.net`.

---

## 4. Backups & Data Protection (Critical)

### Automated Daily Snapshots
Every day at 01:30:
1. `pg_dump -Fc` creates a compressed custom-format snapshot in `./backups/db_YYYYMMDD_HHMMSS.dump`.
2. `pg_restore --list` verifies the archive structure.
3. The `app_data` volume is archived to `app_data_YYYYMMDD_HHMMSS.tar.gz`.
4. GFS retention automatically prunes older backups:
   - **14 Daily** backups (most recent 14 days)
   - **8 Weekly** backups (one per Sunday for the last 8 weeks)
   - **12 Monthly** backups (one per 1st of the month for the last 12 months)
5. A `heartbeat.json` status file is written. The web UI at **Settings -> General** alerts you if the last backup is older than 36 hours.

### Immediate On-Demand Backup
Run an immediate backup at any time:

```bash
make backup
```

### Monthly Backup Integrity Drill
Regularly verify that backups can actually be restored:

```bash
make verify-backup
```

This restores the latest dump into an isolated scratch database, checks the migration ledger, inspects table row counts, and drops the scratch database.

### Restoring from Backup
To restore data following corruption or accidental deletion:

```bash
make restore FILE=backups/db_YYYYMMDD_HHMMSS.dump
```

1. The restore script unpacks the dump into a scratch database first.
2. It prints row counts for all tables so you can verify the content.
3. It asks for typed confirmation: `RESTORE`.
4. It swaps the scratch database into production, unpacks the matching `app_data` file archive, and restarts the app.

---

## 5. Upgrades & Rollbacks

### Updating BI Kit
When new updates are available in Git:

```bash
make update
```

This automated update pipeline:
1. Pulls the latest code from Git.
2. Creates an immediate safety backup of your database.
3. **Rehearses migrations** against a temporary database copy of your real data. If any migration fails, the update aborts before modifying production!
4. Tags the current running Docker image as `bikit-app:previous`.
5. Builds the new Next.js standalone container.
6. Deploys the container and waits for `/api/health` to confirm success.

### Rolling Back
If an update causes unforeseen issues:
1. Restore previous Docker image:
   ```bash
   docker tag bikit-app:previous bikit-app:latest
   docker compose up -d
   ```
2. If migrations modified data structures unexpectedly, restore the pre-update backup:
   ```bash
   make restore FILE=backups/db_xxx.dump
   ```

---

## 6. Troubleshooting

### Port in use
If port `3100` is already in use by another application:
1. Edit `APP_PORT=3101` in `.env.production`.
2. Update `APP_URL=http://localhost:3101`.
3. Restart: `make down && make up`.

### Health check failure
If `bikit-app` does not become healthy:
```bash
make logs
```
Test the health endpoint directly from the host:
```bash
curl -i http://localhost:3100/api/health
```

### PostgreSQL Advisory Lock Stuck
Database migrations execute under an advisory lock (`71829103`). If an unexpected crash leaves an active lock:
```bash
make psql
# In psql:
SELECT pg_advisory_unlock(71829103);
\q
```

### Login Loops Over HTTP
Session cookies derive their `Secure` attribute from the `APP_URL` protocol:
- If `APP_URL` starts with `http://`, the cookie is sent without `Secure`, allowing login over plain `http://localhost:3100`.
- If `APP_URL` starts with `https://`, browsers reject cookies sent over HTTP. Ensure `APP_URL` matches your access method.

---

## 7. Data Export & Uninstall

### Exporting Your Data
Before decommissioning:
1. **Full Database Dump:**
   ```bash
   make backup
   ```
2. **Export Transactions to CSV:**
   ```bash
   docker compose exec db psql -U postgres -d bikit_prod -c "\copy (SELECT * FROM fin_transactions ORDER BY date DESC) TO STDOUT WITH CSV HEADER" > transactions_export.csv
   ```

### Uninstalling
To stop containers and remove Docker volumes:
```bash
docker compose --profile lan down -v
```
Your `./backups` directory on your Mac host remains intact.


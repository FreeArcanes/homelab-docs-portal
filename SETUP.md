# Homelab Glue Setup Guide

This beginner-friendly guide walks through a first installation of Homelab Glue. UniFi and all other integrations are optional.

## Before you begin

You need:

- A Linux server, or Windows/macOS with Docker Desktop
- Docker Engine and Docker Compose v2
- A browser that can reach the Docker server
- Roughly 1 GB of free disk space to begin

Verify Docker:

```bash
docker --version
docker compose version
```

If either command fails, install Docker Desktop on Windows/macOS or Docker Engine with the Compose plugin on Linux.

## 1. Download the project

```bash
git clone https://github.com/FreeArcanes/Homelab-Glue.git
cd Homelab-Glue
```

Alternatively, download the repository ZIP from GitHub, extract it, and open a terminal in that folder.

## 2. Create the initial environment file

Linux or macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The defaults leave authentication, monitoring, and UniFi disabled for the initial launch. Setup Center will generate the finished configuration.

Never commit `.env`. It will eventually contain passwords and possibly connector credentials.

## 3. Choose the host port

The default [`docker-compose.yml`](docker-compose.yml) publishes port `8110`:

```yaml
ports:
  - "8110:8110"
```

The left number is the port users open on the server. The right number is the internal container port.

If `8110` is already occupied, change only the left number. For example:

```yaml
ports:
  - "8120:8110"
```

You would then open `http://SERVER-IP:8120`.

## 4. Build and start Homelab Glue

```bash
docker compose up -d --build
```

The first build may take several minutes. Check it:

```bash
docker compose ps
docker compose logs --tail=100
```

The container should become `healthy`. Test the API using the selected host port:

```bash
curl http://127.0.0.1:8110/api/health
```

## 5. Open Setup Center

In a browser, open:

```text
http://SERVER-IP:8110
```

Replace `SERVER-IP` and the port as needed. A fresh database opens Setup Center automatically.

The wizard guides you through:

1. Database and upload-directory checks
2. Host and container ports
3. Browser origins and optional reverse-proxy mode
4. Administrator, read-only, and API-key credentials
5. Monitoring, uploads, backups, and webhooks
6. Optional UniFi connectivity
7. Configuration download and launch

## 6. Configure access safely

Enable **Require sign-in** for any deployment containing real infrastructure information.

The administrator password must contain at least 12 characters. The Generate button produces a stronger random value. Save generated credentials in your password manager before leaving the page.

Read-only access and the automation API key are optional.

Basic authentication controls access but does not encrypt traffic. Use an HTTPS reverse proxy such as Caddy, Nginx, or Traefik before exposing Homelab Glue outside a trusted private network.

Enable **Behind a trusted reverse proxy** only when that proxy connects directly to this container.

## 7. Configure operations

Leave monitoring disabled until all demonstration URLs have been replaced with real private endpoints. Once enabled, Homelab Glue records service availability, HTTP status, response time, and certificate expiration.

Choose a backup retention value appropriate for your available storage. Configure a webhook only if you already have a compatible notification endpoint.

## 8. Skip or configure UniFi

UniFi is completely optional. Select **Skip UniFi and continue** if you do not use it or want to configure it later. Every non-UniFi feature remains available.

If you enable it, provide:

- The local console URL beginning with `https://`
- A local UniFi username and password
- The site name, normally `default`
- Self-signed TLS only when your trusted local console requires it

Prefer a dedicated read-only local account. Test Connection uses the credentials for one request; the wizard does not store them in SQLite.

## 9. Apply the generated configuration

The final wizard step downloads:

- `.env`
- `docker-compose.generated.yml`

Save both in the repository root on the server. Inspect them, then run:

```bash
docker compose -f docker-compose.generated.yml up -d --build
```

The browser cannot safely replace its own container environment, so environment changes require this rebuild or restart.

## 10. Verify the installation

```bash
docker compose -f docker-compose.generated.yml ps
docker logs homelab-glue --tail=100
curl http://127.0.0.1:8110/api/health
```

Use your configured host port in the health command. Confirm these pages in the browser:

- Dashboard
- Assets and Services
- Documents and Runbooks
- Operations → Health Monitoring
- Operations → Backup & Restore
- Setup Center

## Persistent private data

Runtime data is stored under:

```text
backend/data/
backend/uploads/
```

The SQLite database, uploads, and backups are excluded from Git. Preserve these directories during updates. Create a portable export from **Operations → Backup & Restore** before major changes.

## Updating

Back up first, then update:

```bash
git pull
docker compose -f docker-compose.generated.yml up -d --build
```

If you still use the default Compose file, omit `-f docker-compose.generated.yml`.

## Stopping

```bash
docker compose -f docker-compose.generated.yml down
```

This preserves mounted data. Do not add `--volumes` unless you intentionally want to remove Docker-managed volumes.

## Troubleshooting

### Port already allocated

Change only the host side of the mapping, such as `8120:8110`, then start again.

### Browser cannot connect

```bash
docker compose ps
docker compose logs --tail=200
```

Confirm the server firewall allows the selected host port.

### Setup reports an invalid origin

Use the exact origin with protocol and port but no path:

```env
CORS_ORIGINS=http://192.168.1.50:8120
```

Separate multiple origins with commas.

### Authentication repeatedly prompts

Verify the credentials in `.env`, then recreate the container:

```bash
docker compose -f docker-compose.generated.yml up -d --force-recreate
```

### UniFi cannot connect

Skip it and finish the installation. Configure it later after confirming the console URL, local credentials, site, certificate setting, and container-to-controller network access.

### Database or uploads are not writable

Check ownership and permissions for `backend/data` and `backend/uploads`. The Docker process must be able to create and modify files in both mounted directories.

## Asking for help

Collect:

```bash
docker compose ps
docker compose logs --tail=200
docker version
docker compose version
```

Remove passwords, tokens, private hostnames, and infrastructure details before sharing logs publicly.

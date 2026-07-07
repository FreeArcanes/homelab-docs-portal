# Startup Guide

This guide walks through installing, running, updating, and safely configuring the **Homelab Docs Portal**. It also explains how to enable the optional UniFi live topology/feed connector.

> **Public repository rule:** keep this repository generic. Do not commit real infrastructure data, screenshots, credentials, domains, private IPs, client names, backup exports, or `.env` files.

---

## 1. What This App Does

Homelab Docs Portal is a self-hosted documentation dashboard for tracking:

- assets and inventory
- services and ports
- runbooks and operational procedures
- documents and notes
- network records
- projects and security work
- secret references, not secret values
- optional UniFi live device/client/topology views

The project is designed to be safe as a public template while allowing private deployments to store real data locally.

---

## 2. Repository Layout

```text
homelab-docs-public/
├── backend/
│   ├── data/
│   │   └── data.json              # demo/local JSON database
│   ├── uploads/                   # private upload storage, ignored by Git
│   ├── package.json
│   └── server.js                  # Express API + UniFi connector
├── frontend/
│   ├── public/
│   │   └── interactive-topology.html
│   ├── src/
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.js
├── .dockerignore
├── .env.example                   # safe example env file
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── README.md
├── SECURITY.md
├── PUBLIC_RELEASE_AUDIT.md
└── STARTUP.md
```

---

## 3. Prerequisites

### Required for Docker deployment

- Git
- Docker Engine / Docker Desktop
- Docker Compose v2

Check versions:

```bash
git --version
docker --version
docker compose version
```

### Required for local development

- Node.js 20 LTS or newer
- npm

Check versions:

```bash
node --version
npm --version
```

---

## 4. First-Time Setup With Docker Compose

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/homelab-docs-portal.git
cd homelab-docs-portal
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the app:

```bash
docker compose up -d --build
```

Open the portal:

```text
http://localhost:8110
```

Check the API health endpoint:

```bash
curl http://localhost:8110/api/health
```

Expected result:

```json
{
  "ok": true
}
```

View logs:

```bash
docker logs homelab-docs --tail=100
```

Stop the app:

```bash
docker compose down
```

Restart the app:

```bash
docker compose up -d
```

---

## 5. Docker Compose Notes

The default Compose file exposes the app on host port `8110`:

```yaml
ports:
  - "8110:8110"
```

To run it on a different host port, change only the left side:

```yaml
ports:
  - "8080:8110"
```

Then restart:

```bash
docker compose up -d --force-recreate
```

The app persists local data through these mounted folders:

```yaml
volumes:
  - ./backend/data:/app/backend/data
  - ./backend/uploads:/app/backend/uploads
```

These folders are intended for private runtime data and should not be committed to Git with real content.

---

## 6. Local Development Setup

Use this mode when editing the frontend/backend code.

Install backend dependencies:

```bash
cd backend
npm install
npm run dev
```

In a second terminal, install frontend dependencies:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server usually starts on:

```text
http://localhost:5173
```

The backend usually runs on:

```text
http://localhost:8110
```

For production behavior, use Docker Compose because the backend serves the built frontend.

---

## 7. Build Frontend Manually

From the repository root:

```bash
cd frontend
npm install
npm run build
```

The production frontend output is created at:

```text
frontend/dist/
```

The Dockerfile builds the frontend automatically during normal Docker builds. Manual builds are useful for validation and local testing.

---

## 8. Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Default example:

```env
PORT=8110

UNIFI_ENABLED=false
UNIFI_HOST=https://10.0.0.1
UNIFI_USERNAME=
UNIFI_PASSWORD=
UNIFI_SITE=default
UNIFI_INSECURE_TLS=true
```

### Important environment rules

- Commit `.env.example` only.
- Never commit `.env`.
- Never commit real passwords, API tokens, controller URLs, screenshots, or exports.
- Use placeholder values in public repos.
- Store production secrets in your password manager or deployment secret store.

---

## 9. Data Storage

The app uses JSON-file storage by default:

```text
backend/data/data.json
```

This is simple and portable for homelab use. For private deployments, back it up before major changes.

Backup example:

```bash
mkdir -p backups
cp backend/data/data.json "backups/data-$(date +%F-%H%M%S).json"
```

Restore example:

```bash
cp backups/data-YYYY-MM-DD-HHMMSS.json backend/data/data.json
docker compose restart
```

Reset back to demo data by replacing `backend/data/data.json` with the clean demo seed from the repository.

---

## 10. Public Repository Safety Checklist

Before pushing changes to a public repository, run these checks from the repo root.

Search for possible secrets:

```bash
grep -RInE "BEGIN .*PRIVATE KEY|AKIA|password=|token=|api[_-]?key|client_secret|ssh-rsa|ed25519" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist || true
```

Search for IP-like values:

```bash
grep -RInE "([0-9]{1,3}\.){3}[0-9]{1,3}" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist || true
```

Search for local/private naming:

```bash
grep -RInE "\.local|your-real-domain\.com|real-company|real-client|real-hostname" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist || true
```

Review any results manually.

Files and folders that should not contain public real data:

```text
.env
backend/data/
backend/uploads/
backups/
*.zip
*.tar
*.tar.gz
*.bak
*.old
*.key
*.pem
*.pfx
*.p12
```

---

# UniFi Live Topology / Live Feed Setup

The portal includes an optional UniFi connector that lets the backend pull live controller data and display it in the UI.

When enabled, the frontend calls:

```text
/api/unifi/topology-v2
```

The backend logs into the UniFi console/controller locally, pulls device/client/network/WLAN data, normalizes it, and returns a safe JSON payload to the frontend.

The live UniFi pages are available from the Networking section:

- Topology Map
- UniFi Devices
- Clients
- Wireless
- Networks / VLANs
- Raw Data

The live pages include a **Reload** button. The current template refreshes on page load and on manual reload.

---

## 11. UniFi Connector Requirements

You need:

- A reachable UniFi OS console or controller from the machine/container running this app.
- A UniFi user that can access the Network application.
- The local controller URL.
- The UniFi site ID, usually `default` for simple single-site setups.
- Firewall rules that allow the app host/container to reach the UniFi controller over HTTPS.

Recommended security posture:

- Create a dedicated local UniFi user for the portal.
- Use least privilege where possible.
- Do not use your personal owner/admin account.
- Do not commit the UniFi username/password.
- Restrict network access so only the app host can reach the controller management interface.
- Rotate the connector password periodically.

---

## 12. Create a Dedicated UniFi User

The exact menu names can vary by UniFi version, but the goal is the same: create a dedicated user for the connector.

General flow:

1. Log in to the UniFi console/controller web UI.
2. Open console or system settings.
3. Go to the admin/user management area.
4. Add a new local/admin user.
5. Give the user access to the Network application.
6. Use the lowest role that can read devices, clients, networks, and WLANs.
7. Save the username and password in a password manager.

Recommended example naming:

```text
homelab-docs-reader
```

Do not use this in the public repo. Only place it in your private `.env` file.

---

## 13. Identify Your UniFi Host URL

Use the URL that the app server can reach directly.

Examples:

```env
UNIFI_HOST=https://10.0.0.1
UNIFI_HOST=https://unifi.example.internal
UNIFI_HOST=https://controller.example.internal:8443
```

Rules:

- Include `https://`.
- Do not include a trailing slash.
- Use an IP or DNS name reachable from the Docker host/container.
- Prefer an internal management DNS name in private deployments.

Good:

```env
UNIFI_HOST=https://10.0.0.1
```

Bad:

```env
UNIFI_HOST=10.0.0.1
UNIFI_HOST=https://10.0.0.1/
```

---

## 14. Identify the UniFi Site ID

For most single-site UniFi deployments, the site ID is:

```env
UNIFI_SITE=default
```

If you use multiple sites, the site ID may be different. In that case, check your UniFi controller URL or controller API output.

Example site values:

```env
UNIFI_SITE=default
UNIFI_SITE=site_a
UNIFI_SITE=lab
```

If the connector logs in successfully but returns no devices/networks, the site value is one of the first things to verify.

---

## 15. Configure `.env` For UniFi

Edit your private `.env` file:

```bash
nano .env
```

Example private deployment config:

```env
PORT=8110

UNIFI_ENABLED=true
UNIFI_HOST=https://10.0.0.1
UNIFI_USERNAME=homelab-docs-reader
UNIFI_PASSWORD=REPLACE_WITH_PRIVATE_PASSWORD
UNIFI_SITE=default
UNIFI_INSECURE_TLS=true
```

### `UNIFI_INSECURE_TLS`

Use this when your UniFi console uses a self-signed or privately issued certificate:

```env
UNIFI_INSECURE_TLS=true
```

Use this when your UniFi console has a trusted certificate:

```env
UNIFI_INSECURE_TLS=false
```

Security note: `UNIFI_INSECURE_TLS=true` disables certificate validation for the backend-to-UniFi request. This is common in homelabs with self-signed controller certificates, but it is less secure than using a trusted certificate.

---

## 16. Restart After Changing UniFi Settings

Docker Compose does not automatically reload `.env` changes into an already-running container. Restart the app:

```bash
docker compose up -d --force-recreate
```

Then check logs:

```bash
docker logs homelab-docs --tail=100
```

---

## 17. Test UniFi From the App Host

First confirm the app is healthy:

```bash
curl http://localhost:8110/api/health
```

Then test the UniFi summary endpoint:

```bash
curl http://localhost:8110/api/unifi/summary
```

Then test the full topology endpoint:

```bash
curl http://localhost:8110/api/unifi/topology-v2
```

Pretty-print with `jq` if installed:

```bash
curl -s http://localhost:8110/api/unifi/topology-v2 | jq .
```

Expected high-level payload when enabled:

```json
{
  "enabled": true,
  "source": "v2-local-unifi",
  "counts": {
    "devices": 3,
    "clients": 42,
    "wiredClients": 20,
    "wirelessClients": 22,
    "networks": 4,
    "wlans": 3
  },
  "devices": [],
  "clients": [],
  "networks": [],
  "wlans": [],
  "topology": {
    "nodes": [],
    "edges": []
  }
}
```

If `enabled` is `false`, the connector is disabled or the container did not reload the updated `.env` file.

---

## 18. Test UniFi Reachability From Inside Docker

If the app cannot reach UniFi, test from inside a temporary container on the same Docker host:

```bash
docker run --rm curlimages/curl:latest -k -I https://10.0.0.1
```

Replace `https://10.0.0.1` with your private `UNIFI_HOST` value.

If this fails, troubleshoot routing, DNS, firewall rules, VLAN rules, or certificate settings before troubleshooting the app.

---

## 19. What The UniFi Connector Pulls

The backend normalizes these categories:

### Devices

Includes controller-reported infrastructure devices such as gateways, switches, and access points.

Example normalized fields:

```text
name
type
model
mac
ip
state
version
uptime
numSta
uplink
```

### Clients

Includes wired and wireless clients known to the controller.

Example normalized fields:

```text
name
hostname
mac
ip
network
ssid
vlan
isWired
signal
rxBytes
txBytes
lastSeen
```

### Networks / VLANs

Includes configured network objects.

Example normalized fields:

```text
name
purpose
subnet
vlan
dhcpEnabled
domainName
gateway
```

### WLANs

Includes configured wireless networks.

Example normalized fields:

```text
name
enabled
security
networkId
```

### Topology

The app builds a simplified topology payload:

```text
nodes = devices + clients
edges = parent relationships reported by UniFi
```

If UniFi does not report a parent AP/switch for a client, that client may show as a node without an edge.

---

## 20. UniFi UI Pages In The Portal

After enabling UniFi, open the portal and go to the Networking section.

### Interactive Topology

A static demo/visual topology page:

```text
/interactive-topology.html
```

Use this for public-safe demo topology or manually documented diagrams.

### Topology Map

Live topology nodes and edges from:

```text
/api/unifi/topology-v2
```

### UniFi Devices

Live infrastructure device table.

### Clients

Live client table.

### Wireless

Live WLAN table.

### Networks / VLANs

Live network/VLAN table.

### Raw Data

Full JSON payload from the connector. This is useful for debugging but may expose internal metadata in private deployments. Do not screenshot or publish real raw output.

---

## 21. Troubleshooting UniFi

### Problem: UI says UniFi integration is disabled

Check `.env`:

```env
UNIFI_ENABLED=true
```

Restart the container:

```bash
docker compose up -d --force-recreate
```

Check the endpoint:

```bash
curl http://localhost:8110/api/unifi/topology-v2
```

---

### Problem: Login fails with 401 or 403

Likely causes:

- wrong username/password
- user does not have Network application access
- using a cloud-only account instead of a local/controller account
- account requires interactive authentication
- account permissions are too restrictive

Fix:

1. Log into the UniFi UI with the dedicated connector account.
2. Confirm it can open the Network application.
3. Reset the password if needed.
4. Update `.env`.
5. Restart the container.

---

### Problem: TLS or certificate error

If using a self-signed certificate, set:

```env
UNIFI_INSECURE_TLS=true
```

Then recreate the container:

```bash
docker compose up -d --force-recreate
```

For stronger security, install a trusted certificate on the controller and set:

```env
UNIFI_INSECURE_TLS=false
```

---

### Problem: Timeout or connection refused

Test from the Docker host:

```bash
curl -k -I https://10.0.0.1
```

Test from inside Docker:

```bash
docker run --rm curlimages/curl:latest -k -I https://10.0.0.1
```

Likely causes:

- wrong controller IP/DNS name
- firewall rule blocking the Docker host
- VLAN isolation blocking management access
- controller management interface not listening on the expected port
- DNS not resolving inside Docker

---

### Problem: Login works but no devices/networks appear

Likely causes:

- wrong `UNIFI_SITE`
- user account does not have access to the target site
- UniFi Network application is unavailable
- controller returned empty data

Try:

```env
UNIFI_SITE=default
```

Then restart and test again.

---

### Problem: Devices show but topology edges are missing

The simplified topology depends on parent/uplink fields reported by the controller. Some clients may not include parent AP or switch metadata.

This does not always mean the connector is broken. Confirm the Raw Data page contains device/client records, then inspect whether clients include AP/switch parent fields.

---

### Problem: Browser cannot load live pages

The browser does not talk directly to UniFi. It talks to the portal backend.

Check:

```bash
curl http://localhost:8110/api/unifi/topology-v2
```

If the API works but the browser does not, check browser console logs and reverse proxy settings.

---

## 22. Reverse Proxy Example

For a private deployment behind a reverse proxy, forward traffic to:

```text
http://homelab-docs:8110
```

Important headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Keep public demo deployments separate from private deployments that contain real topology data.

---

## 23. Safe Private Deployment Pattern

Recommended layout:

```text
Public GitHub repo
└── generic template, demo data, no secrets

Private server deployment
└── real .env, real data.json, uploads, backups, private screenshots
```

The public repo should remain generic. Private data should live only on the deployment host or in a private repository.

---

## 24. Update Workflow

Pull code updates:

```bash
git pull
```

Rebuild and restart:

```bash
docker compose up -d --build
```

Check status:

```bash
docker ps
curl http://localhost:8110/api/health
```

View logs:

```bash
docker logs homelab-docs --tail=100
```

---

## 25. Backup Workflow Before Updates

Before updating a private deployment:

```bash
mkdir -p backups
cp backend/data/data.json "backups/data-$(date +%F-%H%M%S).json"
```

Optional upload backup:

```bash
tar -czf "backups/uploads-$(date +%F-%H%M%S).tar.gz" backend/uploads
```

Then update:

```bash
git pull
docker compose up -d --build
```

Rollback data:

```bash
cp backups/data-YYYY-MM-DD-HHMMSS.json backend/data/data.json
docker compose restart
```

---

## 26. Common Commands

Start:

```bash
docker compose up -d
```

Start and rebuild:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

Restart:

```bash
docker compose restart
```

Logs:

```bash
docker logs homelab-docs --tail=100 -f
```

Health:

```bash
curl http://localhost:8110/api/health
```

UniFi topology:

```bash
curl http://localhost:8110/api/unifi/topology-v2
```

Shell into container:

```bash
docker exec -it homelab-docs sh
```

---

## 27. GitHub Publishing Notes

Before making a fork public:

1. Confirm `.env` is not tracked.
2. Confirm `backend/uploads/` has no private files.
3. Confirm `backend/data/data.json` contains demo data only.
4. Confirm screenshots and diagrams are generic.
5. Run the public safety grep checks.
6. Review GitHub after pushing while the repository is still private.
7. Enable secret scanning and push protection where available.
8. Make the repository public only after review.

Safe first push pattern:

```bash
git init
git branch -M main
git add -n .
git add .
git commit -m "Initial public homelab docs portal template"
gh repo create homelab-docs-portal --private --source . --remote origin --push
```

Review in the browser first, then change visibility to public when ready.

---

## 28. Final Validation Checklist

After setup, confirm:

- [ ] `docker compose up -d --build` completes successfully.
- [ ] `http://localhost:8110` loads.
- [ ] `/api/health` returns `ok: true`.
- [ ] Demo assets/services/runbooks render.
- [ ] `.env` exists locally but is not tracked by Git.
- [ ] Public repo contains no real secrets or private topology data.
- [ ] UniFi connector is disabled in public examples.
- [ ] UniFi connector works only in private deployment when configured.
- [ ] Raw UniFi output is never published publicly.

---

## 29. Security Reminder

The `secrets` section is for references only.

Good:

```text
Password manager item: Infrastructure / DNS Provider / API Token
Rotation: quarterly
Owner: platform team
```

Bad:

```text
sk_live_actualsecretvalue123
actual-password-here
private-key-material
```

Keep real secrets in a password manager or secret store, not in this app and not in Git.

# Homelab Docs Portal

A public-safe React + Express homelab documentation portal template for tracking assets, services, runbooks, network notes, project/security work, and secret references.

This repository intentionally ships with **demo data only**. It is designed to be safe to publish and fork. Replace the example inventory with your own private data only in a private deployment.

## Features

- Dark-mode React/Vite frontend
- Express backend with JSON-file storage
- CRUD flows for assets, services, documents, runbooks, networking, project/security notes, and secret references
- Optional network-controller connector placeholders
- File upload support for private deployments
- Demo topology and demo inventory
- Docker Compose deployment

## Public-safety notice

Do **not** commit production data into this repository. Keep the following out of Git:

- `.env` files
- real IP addresses, domains, hostnames, usernames, client names, and screenshots
- runbooks that reveal your real infrastructure or security process
- API tokens, passwords, SSH keys, cert private keys, tunnel credentials, backup archives, exports, uploads, and database dumps
- `backend/data/backups/` and `backend/uploads/`

The included `.gitignore` is intentionally strict, but you should still manually review before pushing.

## Quick start

```bash
cp .env.example .env

docker compose up -d --build
```

Open:

```text
http://localhost:8110
```

Health check:

```bash
curl http://localhost:8110/api/health
```

## Local development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend dev server expects the backend API at the same origin when built for production. For development, use your own proxy or run the production container.

## Data model

The demo seed file lives at:

```text
backend/data/data.json
```

Collections:

- `assets`
- `services`
- `docs`
- `runbooks`
- `secrets`
- `networking`
- `activity`
- `projects`
- `projectsSecurity`

## Secret references

The `secrets` collection is for **references only**. Store where a secret lives, rotation cadence, and ownership. Never store raw secret values.

Good example:

```text
Password manager item: Example / DNS Provider / API Token
```

Bad example:

```text
actual-token-value-goes-here
```

## Optional network controller connector

The app includes optional connector routes configured by environment variables:

```env
UNIFI_ENABLED=false
UNIFI_HOST=https://10.0.0.1
UNIFI_USERNAME=
UNIFI_PASSWORD=
UNIFI_SITE=default
UNIFI_INSECURE_TLS=true
```

These are placeholders. Do not commit real credentials.

## Before publishing your fork

Run the included public-safety grep checks from the repository root:

```bash
grep -RInE "BEGIN .*PRIVATE KEY|AKIA|password=|token=|api[_-]?key|client_secret|ssh-rsa|ed25519" . --exclude-dir=node_modules || true
grep -RInE "([0-9]{1,3}\.){3}[0-9]{1,3}" . --exclude-dir=node_modules || true
grep -RInE "@|\.local|your-real-domain\.com" . --exclude-dir=node_modules || true
```

Then manually review the results.

## License

Add your preferred license before publishing.

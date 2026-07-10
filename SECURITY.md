# Security and Privacy Guidance

This project is a documentation portal template. Documentation portals often accumulate sensitive details over time. Treat your private deployment as sensitive infrastructure.

## Deployment baseline

- Set `AUTH_MODE=basic` and replace both example credentials before exposing the portal beyond localhost.
- Put the app behind HTTPS and, where possible, an identity-aware reverse proxy.
- Set `CORS_ORIGINS` to the exact browser origins that may access the API.
- Keep connector credentials in environment variables or an external secret manager. Connector records should contain references, not raw secrets.
- Back up `backend/data/homelab-glue.sqlite`, test JSON exports, and protect the backup directory with the same care as the live database.

## Never commit

- `.env` files
- credentials, API tokens, cookies, SSH keys, private certificates, tunnel credentials
- production `backend/data/data.json` if it contains real infrastructure details
- `backend/data/backups/`
- `backend/uploads/`
- screenshots or archives from your actual environment
- incident response notes or security runbooks that expose real procedures



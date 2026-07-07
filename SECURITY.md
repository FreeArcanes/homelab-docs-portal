# Security and Privacy Guidance

This project is a documentation portal template. Documentation portals often accumulate sensitive details over time. Treat your private deployment as sensitive infrastructure.

## Never commit

- `.env` files
- credentials, API tokens, cookies, SSH keys, private certificates, tunnel credentials
- production `backend/data/data.json` if it contains real infrastructure details
- `backend/data/backups/`
- `backend/uploads/`
- screenshots or archives from your actual environment
- incident response notes or security runbooks that expose real procedures

## Recommended workflow

1. Keep this public repository as a clean template.
2. Deploy a private fork or private copy for real documentation.
3. Keep runtime data mounted as a volume and excluded from Git.
4. Review every export before sharing.
5. Rotate any credential that was ever committed by mistake.

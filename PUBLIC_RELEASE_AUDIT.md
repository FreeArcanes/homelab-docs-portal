# Public Release Sanitization Audit

This package was prepared as a GitHub-safe template.

## Removed

- Private backup folders
- Data backups
- Uploaded files and archives
- Built frontend bundle from the private copy
- Private deployment helper scripts
- Private runbooks, asset records, service records, project notes, secret references, and activity history

## Replaced with demo values

- App name: Homelab Docs Portal
- Hostnames: LAB-SERVER-01, LAB-DC-01, LAB-FILE-01, ADMIN-WS-01
- IP ranges: RFC1918 demo-style `10.0.x.x` examples
- Public DNS examples: `example.com` / `public.example.com`
- Secret references: placeholder password-manager locations only
- Runbooks: generic examples only

## Manual review still required

Before publishing, review every file and run your own secret scanner. Automated grep checks reduce risk but do not prove a repository is safe.
## Final packaging note

`package-lock.json` files are intentionally omitted from the public template so the repository does not inherit registry URLs from the build/sanitization environment. Generate fresh lockfiles locally with `npm install` before production use if desired.


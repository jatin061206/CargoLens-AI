# Deployment

## Local
- Node.js 20+
- `cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`)
- Set `JWT_SECRET` to a long random value. Optionally configure `OPENAI_API_KEY` and `OPENAI_MODEL`.
- `npm install`
- `npm start`
- Visit `http://localhost:3000`

## Hosting checklist
Deploy the Node service to an India-region host approved by the client. Attach a persistent encrypted disk for `data/` and `uploads/`; the prototype does not support ephemeral filesystem hosting. Set environment variables in the host dashboard, never commit `.env`. Enforce HTTPS, restrict access, configure backups and retention, and verify provider data processing terms before enabling AI for customer documents.

## Environment variables
- `PORT`: HTTP port (default 3000)
- `JWT_SECRET`: required strong signing secret in deployment
- `OPENAI_API_KEY`: optional server-side key; without it, uploads enter manual review
- `OPENAI_MODEL`: vision-capable model identifier (default gpt-4.1-mini)
- `DEMO_EXECUTIVE_PASSWORD`, `DEMO_MANAGER_PASSWORD`: override demo credentials

## Demo accounts
- executive@cargolens.demo
- manager@cargolens.demo

Set passwords via environment variables before deployment and share credentials privately with reviewers.

# CargoLens AI

AI-assisted customs document extraction and cross-check workspace for freight-forwarding documentation teams.

## What works
- Executive and manager demo sign-in with role-based access.
- Shipment dashboard, create shipment, and invoice / packing list / bill of lading upload (PDF and common image formats, 15 MB max).
- Optional vision extraction through the OpenAI Responses API. If no API key is configured or extraction fails, the document remains available for manual review.
- Field-level correction form and audit trail.
- Deterministic cross-checks: invoice quantity vs packing list, gross-weight comparison, invoice arithmetic, and available BOL comparisons.
- Manager-only approval. CSV export is blocked until all three documents are present, blocking checks are cleared, and a manager approves.

## Run locally
1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`.
3. Set a long random `JWT_SECRET`. Optionally add `OPENAI_API_KEY` and `OPENAI_MODEL`.
4. Run `npm install`, then `npm start`.
5. Open http://localhost:3000.

Demo logins:
- Executive: `executive@cargolens.demo` / `Executive123!`
- Manager: `manager@cargolens.demo` / `Manager123!`

Change demo passwords through environment variables before sharing a deployed demo. Do not use real customer documents in this prototype.

## Architecture
- Express API serves a responsive vanilla HTML/CSS/JS client.
- JSON file store under `data/store.json` holds shipment metadata and audit events; uploaded originals are stored under `uploads/`.
- JWT authentication, bcrypt password comparison, executive/manager authorization, Helmet headers, API rate limiting, upload size/type checks.
- AI extraction is isolated in `extractWithAI`; arithmetic and cross-document validation are deterministic server-side rules, not AI judgments.

## Data model
Shipment: id, supplier, origin, status, documents[3], createdAt, approvedBy, approvedAt.
Document: type, original name, stored filename, extracted fields, confidence, extraction status.
Audit event: id, timestamp, actor email, action, shipment ID, details.

## Known limitations / honest scope
- This is a compact prototype, not a production customs filing system.
- JSON persistence is suitable for a single-instance demo only; use PostgreSQL for multi-user production.
- Upload storage is local disk; configure private object storage and retention controls before production.
- AI provider availability, retention and data-residency requirements must be reviewed by the organization before sending any client data. Never upload sensitive live documents to this demo without approval.
- OCR quality varies for skewed, handwritten and bilingual scans. Low/failed extraction is explicitly sent to human review.
- The sample BOL is intentionally missing for SHP-24811; missing data is not fabricated.

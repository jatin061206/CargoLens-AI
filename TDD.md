# Technical Design Document — CargoLens AI

## Problem
Customs documentation teams receive invoices, packing lists and bills of lading in PDF, scan and photo formats. Manual re-entry creates avoidable transcription errors and slows shipment preparation.

## Product scope
A desktop-first responsive workspace to create shipments, upload three document types, extract structured fields, compare values, correct uncertain fields, obtain manager approval and export validated CSV data.

## User roles
- Documentation executive: sign in, create shipments, upload documents, inspect extraction, correct fields and view checks.
- Manager: all executive actions plus inspect activity log and approve validated shipments.

## User flow
1. User signs in.
2. User creates a shipment reference, supplier and origin.
3. User uploads invoice, packing list and BOL files.
4. Server stores the original and attempts AI extraction if configured.
5. User reviews and corrects extracted values. Every correction is audit logged.
6. Server recomputes deterministic checks.
7. Manager approves only when all required documents exist and no blocking check remains.
8. CSV export is available only after approval.

## AI design
The server sends one uploaded PDF or image to the configured vision-capable model with a constrained field request. The model returns structured JSON fields and a document-level confidence score. Missing values are omitted rather than guessed. If the provider is not configured, returns an error, or produces no valid structured output, the document remains in manual review. Production should use schema validation, per-field confidence, provider retention controls, and explicit client approval before transmitting documents.

## Validation rules
- Invoice quantity must match packing-list quantity.
- Invoice and packing-list gross weights must match within 0.01 kg.
- Invoice quantity × unit price must match invoice total within 0.02 currency units.
- Available BOL quantity and weight are compared with invoice / packing list.
- Missing required document slots and low extraction confidence block approval.
- No HSN classification, customs filing, duty calculation or customer tracking.

## Data model
JSON prototype store:
- Shipment(id, supplier, origin, status, createdAt, approvedBy, approvedAt)
- Document(type, originalName, storageName, fields, confidence, extractionStatus)
- AuditEvent(id, at, user, action, shipmentId, details)

Production migration target: PostgreSQL with users, shipments, documents, extracted_fields, validation_results, audit_events and correction_history tables.

## Security and privacy
Passwords are bcrypt hashed; sessions use signed JWTs; manager-only routes enforce role checks; upload type and size are constrained; Helmet headers and API rate limits are enabled. Secrets stay server-side. This prototype is not a compliance certification: production requires secure object storage, encryption at rest, retention/deletion policy, stronger session controls, backups, monitoring, DPDP review and provider data-processing assessment.

## UI screens
- Sign-in
- Shipment overview and status metrics
- Create shipment dialog
- Shipment document checklist and upload controls
- Extracted field review and correction forms
- Cross-check results and manager approval
- Activity log

## Deliberate cuts
Vanilla JS and JSON persistence keep the prototype installable and demonstrable within a short build window. A production system should add PostgreSQL, Prisma migrations, automated OCR preprocessing, per-field confidence, pagination, malware scanning, object storage, comprehensive tests and deployment monitoring.

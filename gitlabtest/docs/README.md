# Documentation Index

## Architecture

- [Architecture Overview](architecture.md) -- 3-layer design, data flow, deployment

## Features

- [Operations (Deal Pipelines)](features/operations/README.md) -- Deal creation, pipeline orchestration, betaalt-niet
- [Sales (Lead Ingestion)](features/sales/README.md) -- Trustoo, Offerte.nl, Ligo, Solvari lead flows
- [Wefact (Invoicing)](features/wefact/README.md) -- Debtor sync, outstanding amount reconciliation
- [Clockify (Time Tracking)](features/clockify/README.md) -- Client provisioning from HubSpot
- [Properties (Webhook Handlers)](features/properties/README.md) -- Dossier sync, stage assignment, IB/JR/VPB logic, machtiging actief
- [Portal (Bank Connections)](features/portal/README.md) -- Bank connection status updates

## Infrastructure

- [Rate Limiting](rate-limiting.md) -- HubSpot API rate limiter design
- [Authentication](authentication.md) -- API key validation
- [Scheduled Jobs](scheduled-jobs.md) -- APScheduler nightly sync

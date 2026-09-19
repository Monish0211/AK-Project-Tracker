# PMO Portal — Production Frontend Deployment Record

**Deployment date:** 2026-09-19
**Release ZIP:** `pmo-portal-production-release-20260918-180225.zip`
**Release ZIP SHA256:** `b59b166dfc95ecde9c96dd0a7dfcc9f53bc7d3ab4629890869ca3d9c6253ff49`

---

## What was deployed

A frontend-only production release consisting of 21 source files:

**Group 1 — EditProject P0 data-loss protection**
- `frontend/src/pages/Projects/EditProject.tsx`
- `frontend/src/pages/Projects/components/FormButtons.tsx`
- `frontend/src/pages/Projects/components/ProjectForm.tsx`

**Group 2 — API timeout + AbortController + heavy-operation overrides**
- `frontend/src/services/apiClient.ts`
- `frontend/src/services/pdfImportService.ts`
- `frontend/src/services/projectService.ts`
- `frontend/src/services/customerService.ts`
- `frontend/src/pages/Timesheets/Timesheets.tsx`
- `frontend/src/pages/Timesheets/components/TimesheetHistoricalResetModal.tsx`

**Group 3 — Manpower >200 pagination + stale-request protection**
- `frontend/src/services/employeeService.ts`
- `frontend/src/pages/Manpower/Manpower.tsx`

**Group 4 — Reports authoritative invoice detail-table fix**
- `frontend/src/pages/ReportsPage.tsx`
- `frontend/src/components/reports/useReportsData.ts`
- `frontend/src/components/reports/InvoiceAnalytics/InvoiceAnalytics.tsx`
- `frontend/src/components/reports/InvoiceAnalytics/MonthlyBillingChart.tsx`
- `frontend/src/components/reports/InvoiceAnalytics/InvoiceLedger.tsx`
- `frontend/src/components/reports/CollectionAnalytics/CollectionAnalytics.tsx`
- `frontend/src/components/reports/CollectionAnalytics/CollectionTrend.tsx`
- `frontend/src/components/reports/CollectionAnalytics/OverdueTable.tsx`

**Group 5 — Production-parity reconciliation (not a new feature)**
- `frontend/src/constants/projectStatus.ts` — restores the Project Status Workflow Expansion (14-value status list, `ACTIVE_PROJECT_STATUSES`, `isActiveProjectStatus()`) that was already confirmed live in production but missing from Git history.
- `frontend/src/services/dashboardService.ts` — consumes `isActiveProjectStatus()` for the Dashboard timeline-alert filter, matching already-live production behavior.

---

## Deployment process

1. **Pre-deployment backup** taken on the VPS before any change:
   `/home/ifluids-pmodashboard/pmo-pre-deploy-backup-20260919-031315/`
   — includes a verified PostgreSQL dump, a full copy of the pre-deployment live frontend (with checksum manifest), a full backend source backup, and PM2/Nginx state captures.
2. Release ZIP transferred to a staging path on the VPS and its SHA256 verified to match exactly.
3. ZIP extracted into a separate staging directory and fully validated (file count, referenced assets, embedded API URL, absence of `localhost:5000`/`5001`, production-parity status implementation) before touching the live directory.
4. Live frontend directory swapped via a same-filesystem rename (old frontend preserved as `frontend.pre-deploy-rollback-20260919-032521/`, never deleted).
5. Post-swap HTTP verification: homepage, all static assets (including every lazy-loaded Reports/Manpower/Dashboard chunk), and `/api/health` all returned HTTP 200. The publicly-served bundle was downloaded independently and its checksum matched the verified build at every stage of the pipeline (local build → ZIP → VPS staging → live).
6. Nginx access/error logs showed zero errors and zero non-200 responses in the period following deployment.

**No rollback was required.**

---

## What was explicitly NOT changed

- Backend source, dependencies, and configuration
- PostgreSQL database (no writes, no migrations)
- PM2 process configuration or state (PMO backend PID/restart count unchanged throughout)
- Nginx configuration (vhost and `nginx.conf` confirmed byte-identical to their pre-deployment backup copies)
- The CRM application and its separate PM2 process (unchanged throughout)

---

## Verification performed and limitations

- **Automated (this session):** HTTP-level checks (homepage, all JS/CSS/image assets, API health), bundle-content checks (production API URL present, `localhost` references absent, production-parity status data present), infrastructure stability checks (PM2/Nginx state unchanged), and Nginx log review (zero errors, zero non-200 responses).
- **Authenticated application flows (login, Dashboard, Project list, Reports drill-down, Manpower, Timesheets, navigation) were NOT automated-tested** — no browser automation tool was available in this environment, and authentication was deliberately not bypassed to test them synthetically.
- **The user manually tested the live portal in a real browser after deployment and confirmed it is working.** This is the basis for considering authenticated functionality verified — it was not independently re-verified by automated means in this session.

---

## Note on scope

This record covers only the 21 files listed above. A substantial amount of other local work (Backend `dashboard.*`/`project.*`/`resource.service.ts`/`timesheet.controller*.ts`, the `reminders` module, Prisma schema/migration additions, and various untracked test files and past deployment ZIPs) remains uncommitted in the working tree and was **not** part of this deployment or this commit. It should not be assumed approved, tested, or ready for release based on this record.

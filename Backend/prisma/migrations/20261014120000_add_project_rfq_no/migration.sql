-- RFQ No. (Oct 2026).
--
-- Project.rfqNo: the project's RFQ number, required by the API on every new
-- project (Add Project, Excel import, PR Request approval) and on any update
-- that sends it. Nullable on purpose: existing projects have no RFQ No. on
-- record and none is invented here — each stays NULL until it is entered on
-- that project's next General Information edit. A NOT NULL constraint needs
-- every existing row filled first and is a separate, later change.
--
-- PR Requests need no column: a request's form fields (RFQ No. included)
-- live in its existing "projectData" JSON, validated by the same schema.
--
-- Additive only (one nullable column, no default, no backfill).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "rfqNo" TEXT;

-- Editable public content: the site settings and pages, with every published
-- version kept for history and restore. Additive; an empty table renders the
-- site exactly as before, because every field falls back to its default.
ALTER TYPE "AuditAction" ADD VALUE 'CONTENT_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTENT_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_UPDATED';

CREATE TABLE "ContentDocument" (
    "key" TEXT NOT NULL,
    "draft" JSONB,
    "published" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDocument_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,
    "restoredFrom" INTEGER,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentVersion_documentKey_version_key" ON "ContentVersion"("documentKey", "version");

ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_documentKey_fkey" FOREIGN KEY ("documentKey") REFERENCES "ContentDocument"("key") ON DELETE CASCADE ON UPDATE CASCADE;

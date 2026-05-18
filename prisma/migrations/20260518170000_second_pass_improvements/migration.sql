ALTER TABLE "standards" ADD COLUMN "rationale" TEXT;
ALTER TABLE "standards" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "standards" ADD COLUMN "source_url" TEXT;
ALTER TABLE "standards" ADD COLUMN "created_by" TEXT;
ALTER TABLE "standards" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "standards" ADD COLUMN "approved_by" TEXT;

CREATE INDEX "standards_owner_idx" ON "standards"("owner");

WITH ranked_active AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "rule_key" ORDER BY "version" DESC, "updated_at" DESC) AS active_rank
  FROM "standards"
  WHERE "status" = 'active'
)
UPDATE "standards"
SET
  "status" = 'deprecated',
  "deprecated_at" = COALESCE("deprecated_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked_active
WHERE "standards"."id" = ranked_active."id"
  AND ranked_active.active_rank > 1;

CREATE UNIQUE INDEX "standards_one_active_rule_key_idx" ON "standards"("rule_key") WHERE "status" = 'active';

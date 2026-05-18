CREATE TYPE "StandardStatus" AS ENUM ('active', 'deprecated', 'draft');
CREATE TYPE "StandardSeverity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE "StandardCategory" AS ENUM ('reliability', 'security', 'observability', 'performance', 'cost', 'maintainability', 'architecture', 'compliance');

CREATE TABLE "standards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "StandardStatus" NOT NULL,
    "severity" "StandardSeverity" NOT NULL,
    "category" "StandardCategory" NOT NULL,
    "applies_to" JSONB NOT NULL,
    "rule_text" TEXT NOT NULL,
    "review_guidance" TEXT NOT NULL,
    "good_example" TEXT,
    "bad_example" TEXT,
    "owner" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deprecated_at" TIMESTAMP(3),

    CONSTRAINT "standards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "standards_rule_key_version_key" ON "standards"("rule_key", "version");
CREATE INDEX "standards_rule_key_status_idx" ON "standards"("rule_key", "status");
CREATE INDEX "standards_status_category_idx" ON "standards"("status", "category");

-- Migration: Add abandoned_carts table for cart recovery feature
-- Run: npm run db:migrate

CREATE TABLE "abandoned_carts" (
    "id"              SERIAL          NOT NULL,
    "sessionId"       TEXT            NOT NULL,
    "email"           TEXT,
    "name"            TEXT,
    "cartSnapshot"    JSONB           NOT NULL,
    "cartTotal"       DOUBLE PRECISION NOT NULL,
    "recoveryToken"   TEXT            NOT NULL,
    "reminderSentAt"  TIMESTAMP(3),
    "followupSentAt"  TIMESTAMP(3),
    "recovered"       BOOLEAN         NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "abandoned_carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "abandoned_carts_sessionId_key" ON "abandoned_carts"("sessionId");
CREATE UNIQUE INDEX "abandoned_carts_recoveryToken_key" ON "abandoned_carts"("recoveryToken");

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "account_uid" TEXT NOT NULL,
    "account_iban" TEXT,
    "account_name" TEXT,
    "institution_name" TEXT,
    "last_synced" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_uid" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "institution_name" TEXT,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_matches" (
    "id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "transaction_id" UUID,
    "file_id" UUID,
    "match_type" TEXT NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "suggested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actioned_at" TIMESTAMP(3),
    "actioned_by" UUID,

    CONSTRAINT "bank_transaction_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_account_uid_key" ON "bank_connections"("account_uid");

-- CreateIndex
CREATE INDEX "bank_connections_user_id_idx" ON "bank_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_idempotency_key_key" ON "bank_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "bank_transactions_user_id_idx" ON "bank_transactions"("user_id");

-- CreateIndex
CREATE INDEX "bank_transactions_account_uid_idx" ON "bank_transactions"("account_uid");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_account_uid_external_id_key" ON "bank_transactions"("account_uid", "external_id");

-- CreateIndex
CREATE INDEX "bank_transaction_matches_bank_transaction_id_idx" ON "bank_transaction_matches"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "bank_transaction_matches_status_idx" ON "bank_transaction_matches"("status");

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_uid_fkey" FOREIGN KEY ("account_uid") REFERENCES "bank_connections"("account_uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_matches" ADD CONSTRAINT "bank_transaction_matches_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

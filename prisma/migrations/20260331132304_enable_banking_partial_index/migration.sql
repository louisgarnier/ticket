CREATE UNIQUE INDEX bank_transaction_matches_confirmed_unique
ON bank_transaction_matches (bank_transaction_id)
WHERE status = 'confirmed';

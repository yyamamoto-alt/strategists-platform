-- 既存データ削除（外部キー制約の順序で）
-- 生成日時: 2026-02-28T21:30:41.944353

DELETE FROM agent_records;
DELETE FROM learning_records;
DELETE FROM contracts;
DELETE FROM sales_pipeline;
DELETE FROM payments;
DELETE FROM bank_transfers;
DELETE FROM customers;

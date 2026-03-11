-- 補助金関連の発行書類管理テーブル
CREATE TABLE IF NOT EXISTS subsidy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('invoice', 'receipt', 'certificate')),
  certificate_number TEXT, -- 修了証明書の通し番号 (00001形式)
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID, -- 発行者のuser_id
  email_sent_at TIMESTAMPTZ, -- メール送信日時
  email_to TEXT, -- 送信先メール
  metadata JSONB DEFAULT '{}', -- PDF生成時のパラメータ等
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subsidy_documents_customer ON subsidy_documents(customer_id);
CREATE INDEX idx_subsidy_documents_type ON subsidy_documents(doc_type);

-- 修了証明書の通し番号シーケンス
CREATE SEQUENCE IF NOT EXISTS subsidy_certificate_seq START WITH 1;

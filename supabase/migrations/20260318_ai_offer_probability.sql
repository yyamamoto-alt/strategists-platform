-- Agent Desk AI分析からの内定可能性確度（0-100%）
ALTER TABLE agent_records ADD COLUMN IF NOT EXISTS ai_offer_probability integer;

COMMENT ON COLUMN agent_records.ai_offer_probability IS 'AI分析による内定可能性（0-100%）。Agent Deskから自動連携。手動ランク(offer_rank)より優先して売上見込み計算に使用';

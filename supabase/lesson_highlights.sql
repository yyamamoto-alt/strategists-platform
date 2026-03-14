CREATE TABLE IF NOT EXISTS lesson_highlights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  lesson_id UUID NOT NULL,
  text_snippet TEXT NOT NULL,
  element_index INTEGER NOT NULL,
  color TEXT DEFAULT 'yellow',
  note TEXT,
  is_bookmark BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lesson_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own highlights"
  ON lesson_highlights FOR SELECT
  USING (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Students can insert own highlights"
  ON lesson_highlights FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Students can delete own highlights"
  ON lesson_highlights FOR DELETE
  USING (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

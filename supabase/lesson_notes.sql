CREATE TABLE IF NOT EXISTS lesson_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  lesson_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, lesson_id)
);

ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own notes"
  ON lesson_notes FOR SELECT
  USING (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Students can insert own notes"
  ON lesson_notes FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Students can update own notes"
  ON lesson_notes FOR UPDATE
  USING (customer_id IN (
    SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
  ));

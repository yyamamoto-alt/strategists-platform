CREATE TABLE IF NOT EXISTS case_problems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  problem_text TEXT NOT NULL,
  category TEXT,
  difficulty TEXT CHECK (difficulty IN ('初級', '中級', '上級')),
  hint TEXT,
  solution_outline TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE case_problems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public case problems"
  ON case_problems FOR SELECT
  USING (is_public = true);

CREATE POLICY "Authenticated users can view all case problems"
  ON case_problems FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage case problems"
  ON case_problems FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

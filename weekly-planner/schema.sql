-- Create the planner_data table
CREATE TABLE planner_data (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public read/write (since this is a personal app with no auth)
ALTER TABLE planner_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON planner_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert a default empty row
INSERT INTO planner_data (id, data) VALUES ('default', '{}');

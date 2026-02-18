
-- Enable RLS on the table (if it's not already enabled)
ALTER TABLE practice_records ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert data (so the frontend can save practice results)
CREATE POLICY "Enable insert for anonymous users" 
ON practice_records FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow anonymous users to view data (so the Teacher Dashboard can display stats)
CREATE POLICY "Enable select for anonymous users" 
ON practice_records FOR SELECT 
TO anon 
USING (true);

-- Also enable access for authenticated users (in case you add login later)
CREATE POLICY "Enable access for authenticated users" 
ON practice_records FOR ALL 
TO authenticated 
USING (true);

-- Note: The views (student_summary, daily_stats, etc.) will automatically work 
-- once the policies on the base table (practice_records) are in place.

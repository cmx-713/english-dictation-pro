
-- ============================================
-- Content Library & Student Identity Schema
-- ============================================

-- 1. Create Students Table (Simple Identity)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  student_name TEXT NOT NULL,
  class_name TEXT,
  student_number TEXT NOT NULL, -- 学号
  last_practice_at TIMESTAMPTZ,
  total_practices INTEGER DEFAULT 0,
  -- Ensure unique student number to avoid duplicates
  UNIQUE(student_number)
);

-- Enable RLS for students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read/write (public access for now)
CREATE POLICY "Enable insert for anonymous users" ON students FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Enable select for anonymous users" ON students FOR SELECT TO anon USING (true);
CREATE POLICY "Enable update for anonymous users" ON students FOR UPDATE TO anon USING (true);

-- 2. Create Dictation Materials Table (Content Library)
CREATE TABLE IF NOT EXISTS dictation_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'General', -- e.g., 'Daily News', 'TOEFL', 'Business'
  difficulty_level TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'
  audio_url TEXT, -- Optional URL to pre-generated audio
  source TEXT,    -- Optional source attribution
  word_count INTEGER
);

-- Enable RLS for materials
ALTER TABLE dictation_materials ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read (everyone can see content)
CREATE POLICY "Enable select for anonymous users" ON dictation_materials FOR SELECT TO anon USING (true);

-- Allow anonymous insert (for teacher to add content via app if built, or dashboard)
-- In production, you might restrict this, but for now it's fine.
CREATE POLICY "Enable insert for anonymous users" ON dictation_materials FOR INSERT TO anon WITH CHECK (true);

-- 3. Add foreign key to practice_records (optional, for linking)
-- We won't enforce FK to keep it flexible, but we can store student_id
ALTER TABLE practice_records ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE practice_records ADD COLUMN IF NOT EXISTS material_id UUID;

-- 4. Sample Data for Library (Optional)
INSERT INTO dictation_materials (title, content, category, difficulty_level, word_count)
VALUES 
(
  'The Benefits of Reading', 
  'Reading is one of the most beneficial activities you can do. It expands your knowledge and vocabulary. Moreover, reading reduces stress and improves memory. Creating a habit of reading daily can change your life.', 
  'Education', 
  'beginner',
  35
),
(
  'Artificial Intelligence in Daily Life', 
  'Artificial intelligence is becoming an integral part of our daily lives. From voice assistants on our phones to recommendation algorithms on streaming platforms, AI is everywhere. While some worry about job displacement, others see it as a tool to enhance human productivity.', 
  'Technology', 
  'intermediate',
  42
)
ON CONFLICT DO NOTHING;

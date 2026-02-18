-- ============================================
-- Supabase 数据库表结构优化（教学研究版）
-- ============================================
-- 
-- 使用说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制并执行以下 SQL 语句
-- 4. 或者分步执行（推荐）
--
-- ============================================

-- 方案 1: 扩展现有表（简单，推荐）
-- ============================================

-- 添加统计字段
ALTER TABLE practice_records 
ADD COLUMN IF NOT EXISTS total_sentences INTEGER,
ADD COLUMN IF NOT EXISTS correct_sentences INTEGER,
ADD COLUMN IF NOT EXISTS accuracy_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS total_words INTEGER,
ADD COLUMN IF NOT EXISTS correct_words INTEGER,
ADD COLUMN IF NOT EXISTS average_score DECIMAL(5,2);

-- 添加文本信息字段
ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS text_difficulty TEXT,
ADD COLUMN IF NOT EXISTS text_length INTEGER,
ADD COLUMN IF NOT EXISTS text_word_count INTEGER;

-- 添加设备信息字段
ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS browser TEXT,
ADD COLUMN IF NOT EXISTS screen_resolution TEXT;

-- 添加时间信息字段
ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS time_of_day TEXT,
ADD COLUMN IF NOT EXISTS day_of_week TEXT,
ADD COLUMN IF NOT EXISTS is_weekend BOOLEAN;

-- 添加输入方式和时长
ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS input_method TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- 添加详细分析字段（JSON格式）
ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS error_summary JSONB,
ADD COLUMN IF NOT EXISTS difficult_sentences JSONB,
ADD COLUMN IF NOT EXISTS text_analysis JSONB;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_practice_created_at ON practice_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_accuracy ON practice_records(accuracy_rate);
CREATE INDEX IF NOT EXISTS idx_practice_difficulty ON practice_records(text_difficulty);
CREATE INDEX IF NOT EXISTS idx_practice_student ON practice_records(student_name);

-- 添加注释
COMMENT ON COLUMN practice_records.total_sentences IS '总句子数';
COMMENT ON COLUMN practice_records.correct_sentences IS '完全正确的句子数';
COMMENT ON COLUMN practice_records.accuracy_rate IS '准确率(0-100)';
COMMENT ON COLUMN practice_records.total_words IS '总单词数';
COMMENT ON COLUMN practice_records.correct_words IS '正确单词数';
COMMENT ON COLUMN practice_records.average_score IS '平均分';
COMMENT ON COLUMN practice_records.text_difficulty IS '文本难度: easy/medium/hard';
COMMENT ON COLUMN practice_records.input_method IS '输入方式: voice/text/image';
COMMENT ON COLUMN practice_records.duration_seconds IS '完成用时（秒）';

-- ============================================
-- 方案 2: 创建新的规范化表结构（高级，可选）
-- ============================================

-- 学生表
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  grade_level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文本库表
CREATE TABLE IF NOT EXISTS text_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT,
  word_count INTEGER,
  sentence_count INTEGER,
  vocabulary_level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 学习进度表
CREATE TABLE IF NOT EXISTS learning_progress (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  practice_count INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  average_accuracy DECIMAL(5,2),
  highest_score DECIMAL(5,2),
  last_practice_date TIMESTAMPTZ,
  consecutive_days INTEGER DEFAULT 0,
  total_words_practiced INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 错误分析表
CREATE TABLE IF NOT EXISTS error_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID REFERENCES practice_records(id) ON DELETE CASCADE,
  error_type TEXT CHECK (error_type IN ('spelling', 'missing', 'extra', 'grammar')),
  original_word TEXT,
  written_word TEXT,
  sentence_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 实用查询视图
-- ============================================

-- 创建统计视图：每日练习统计
CREATE OR REPLACE VIEW daily_practice_stats AS
SELECT 
  DATE(created_at) as practice_date,
  COUNT(*) as total_practices,
  ROUND(AVG(accuracy_rate), 2) as avg_accuracy,
  ROUND(AVG(average_score), 2) as avg_score,
  COUNT(DISTINCT student_name) as active_students
FROM practice_records
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY practice_date DESC;

-- 创建视图：学生表现摘要
CREATE OR REPLACE VIEW student_performance_summary AS
SELECT 
  student_name,
  COUNT(*) as practice_count,
  ROUND(AVG(accuracy_rate), 2) as avg_accuracy,
  ROUND(AVG(average_score), 2) as avg_score,
  MAX(accuracy_rate) as best_accuracy,
  MIN(accuracy_rate) as worst_accuracy,
  SUM(total_words) as total_words_practiced,
  MAX(created_at) as last_practice_date
FROM practice_records
WHERE student_name IS NOT NULL
GROUP BY student_name
ORDER BY avg_accuracy DESC;

-- 创建视图：难度分析
CREATE OR REPLACE VIEW difficulty_analysis AS
SELECT 
  text_difficulty,
  COUNT(*) as practice_count,
  ROUND(AVG(accuracy_rate), 2) as avg_accuracy,
  ROUND(AVG(duration_seconds), 0) as avg_duration,
  ROUND(AVG(average_score), 2) as avg_score
FROM practice_records
WHERE text_difficulty IS NOT NULL
GROUP BY text_difficulty
ORDER BY 
  CASE text_difficulty
    WHEN 'easy' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'hard' THEN 3
  END;

-- 创建视图：时间段分析
CREATE OR REPLACE VIEW time_pattern_analysis AS
SELECT 
  time_of_day,
  COUNT(*) as practice_count,
  ROUND(AVG(accuracy_rate), 2) as avg_accuracy,
  ROUND(AVG(average_score), 2) as avg_score
FROM practice_records
WHERE time_of_day IS NOT NULL
GROUP BY time_of_day
ORDER BY 
  CASE time_of_day
    WHEN 'morning' THEN 1
    WHEN 'afternoon' THEN 2
    WHEN 'evening' THEN 3
    WHEN 'night' THEN 4
  END;

-- ============================================
-- 实用函数
-- ============================================

-- 函数：获取学生的学习趋势
CREATE OR REPLACE FUNCTION get_student_trend(p_student_name TEXT, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  practice_date DATE,
  accuracy_rate DECIMAL,
  practice_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) as practice_date,
    ROUND(AVG(pr.accuracy_rate), 2) as accuracy_rate,
    COUNT(*) as practice_count
  FROM practice_records pr
  WHERE pr.student_name = p_student_name
    AND pr.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY practice_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 数据清理和维护
-- ============================================

-- 删除超过1年的匿名记录（保留有学生名的记录）
-- 注意：使用前请确认！
-- DELETE FROM practice_records 
-- WHERE student_name IS NULL 
--   AND created_at < NOW() - INTERVAL '1 year';

-- ============================================
-- 行级安全策略（RLS）- 可选
-- ============================================

-- 启用 RLS
-- ALTER TABLE practice_records ENABLE ROW LEVEL SECURITY;

-- 允许所有人插入（用于匿名练习）
-- CREATE POLICY "允许插入练习记录" ON practice_records
--   FOR INSERT WITH CHECK (true);

-- 只允许查看自己的记录（如果有学生ID）
-- CREATE POLICY "查看自己的记录" ON practice_records
--   FOR SELECT USING (auth.uid()::text = student_name OR student_name IS NULL);

-- 管理员可以查看所有记录
-- CREATE POLICY "管理员查看所有记录" ON practice_records
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM students 
--       WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- ============================================
-- 完成
-- ============================================

-- 查询表结构验证
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'practice_records'
ORDER BY ordinal_position;

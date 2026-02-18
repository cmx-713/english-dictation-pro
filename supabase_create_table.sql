-- ============================================
-- 英语听写系统 - 完整建表脚本
-- ============================================
-- 从零开始创建 practice_records 表
--
-- 使用说明：
-- 1. 登录 Supabase Dashboard (https://supabase.com)
-- 2. 进入 SQL Editor
-- 3. 复制并执行以下 SQL 语句
-- ============================================

-- 创建 practice_records 表
CREATE TABLE IF NOT EXISTS practice_records (
  -- 基础字段
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 学生信息
  student_name TEXT,
  class_name TEXT,
  
  -- 练习内容
  raw_text TEXT NOT NULL,
  results JSONB NOT NULL,
  
  -- 核心统计数据
  accuracy_rate DECIMAL(5,2),           -- 正确率(%)
  perfect_sentences INTEGER,            -- 完美句数
  total_sentences INTEGER,              -- 总句子数
  total_words INTEGER,                  -- 总单词数
  difficulty_level TEXT,                -- 难度等级
  
  -- 其他信息
  input_method TEXT,                    -- 输入方式: text/voice/image
  ip_address TEXT,                      -- IP地址（可选）
  student_id TEXT                       -- 学生ID（可选）
);

-- 添加表注释
COMMENT ON TABLE practice_records IS '英语听写练习记录表';

-- 添加字段注释
COMMENT ON COLUMN practice_records.id IS '唯一标识';
COMMENT ON COLUMN practice_records.created_at IS '创建时间';
COMMENT ON COLUMN practice_records.student_name IS '学生姓名';
COMMENT ON COLUMN practice_records.class_name IS '班级名称';
COMMENT ON COLUMN practice_records.raw_text IS '原始文本';
COMMENT ON COLUMN practice_records.results IS '详细结果(JSON格式)';
COMMENT ON COLUMN practice_records.accuracy_rate IS '正确率(0-100)';
COMMENT ON COLUMN practice_records.perfect_sentences IS '完美句数(满分10分的句子)';
COMMENT ON COLUMN practice_records.total_sentences IS '总句子数';
COMMENT ON COLUMN practice_records.total_words IS '总单词数';
COMMENT ON COLUMN practice_records.difficulty_level IS '难度等级: beginner/intermediate/advanced/master';
COMMENT ON COLUMN practice_records.input_method IS '输入方式: text/voice/image';

-- 创建索引（提高查询性能）
CREATE INDEX IF NOT EXISTS idx_practice_student_name ON practice_records(student_name);
CREATE INDEX IF NOT EXISTS idx_practice_class_name ON practice_records(class_name);
CREATE INDEX IF NOT EXISTS idx_practice_created_at ON practice_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_accuracy ON practice_records(accuracy_rate);
CREATE INDEX IF NOT EXISTS idx_practice_student_class ON practice_records(student_name, class_name);

-- ============================================
-- 创建实用查询视图
-- ============================================

-- 视图1: 学生表现摘要
CREATE OR REPLACE VIEW student_summary AS
SELECT 
  student_name,
  class_name,
  COUNT(*) as total_practices,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  SUM(total_words) as total_words_practiced,
  SUM(perfect_sentences) as perfect_sentence_count,
  MAX(created_at) as last_practice_date,
  -- 最近7天的练习次数
  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_practices,
  -- 最高和最低准确率
  MAX(accuracy_rate) as best_accuracy,
  MIN(accuracy_rate) as worst_accuracy
FROM practice_records
WHERE student_name IS NOT NULL
GROUP BY student_name, class_name
ORDER BY avg_accuracy DESC;

-- 视图2: 班级统计
CREATE OR REPLACE VIEW class_stats AS
SELECT 
  class_name,
  COUNT(DISTINCT student_name) as student_count,
  COUNT(*) as total_practices,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  SUM(total_words) as total_words_practiced,
  MAX(created_at) as last_practice_date,
  -- 最近7天活跃学生数
  COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN student_name END) as recent_active_students
FROM practice_records
WHERE class_name IS NOT NULL
GROUP BY class_name
ORDER BY avg_accuracy DESC;

-- 视图3: 每日统计
CREATE OR REPLACE VIEW daily_stats AS
SELECT 
  DATE(created_at) as practice_date,
  COUNT(*) as practice_count,
  COUNT(DISTINCT student_name) as active_students,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  SUM(total_words) as words_practiced,
  SUM(perfect_sentences) as perfect_sentences_count
FROM practice_records
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY practice_date DESC;

-- 视图4: 难度分析
CREATE OR REPLACE VIEW difficulty_stats AS
SELECT 
  difficulty_level,
  COUNT(*) as practice_count,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  ROUND(AVG(total_words), 0) as avg_word_count,
  ROUND(AVG(total_sentences), 0) as avg_sentence_count
FROM practice_records
WHERE difficulty_level IS NOT NULL
GROUP BY difficulty_level
ORDER BY 
  CASE difficulty_level
    WHEN 'beginner' THEN 1
    WHEN 'intermediate' THEN 2
    WHEN 'advanced' THEN 3
    WHEN 'master' THEN 4
    ELSE 5
  END;

-- 视图5: 输入方式分析
CREATE OR REPLACE VIEW input_method_stats AS
SELECT 
  input_method,
  COUNT(*) as usage_count,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  COUNT(DISTINCT student_name) as user_count
FROM practice_records
WHERE input_method IS NOT NULL
GROUP BY input_method
ORDER BY usage_count DESC;

-- ============================================
-- 实用函数
-- ============================================

-- 函数1: 获取学生的学习趋势（最近N天）
CREATE OR REPLACE FUNCTION get_student_trend(
  p_student_name TEXT, 
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  practice_date DATE,
  practice_count BIGINT,
  avg_accuracy NUMERIC,
  total_words BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) as practice_date,
    COUNT(*) as practice_count,
    ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
    SUM(total_words) as total_words
  FROM practice_records
  WHERE student_name = p_student_name
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY practice_date;
END;
$$ LANGUAGE plpgsql;

-- 函数2: 获取班级排行榜（按准确率）
CREATE OR REPLACE FUNCTION get_class_ranking(p_class_name TEXT)
RETURNS TABLE (
  rank BIGINT,
  student_name TEXT,
  total_practices BIGINT,
  avg_accuracy NUMERIC,
  total_words_practiced BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY AVG(accuracy_rate) DESC) as rank,
    pr.student_name,
    COUNT(*) as total_practices,
    ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
    SUM(total_words) as total_words_practiced
  FROM practice_records pr
  WHERE pr.class_name = p_class_name
    AND pr.student_name IS NOT NULL
  GROUP BY pr.student_name
  ORDER BY avg_accuracy DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 验证安装
-- ============================================

-- 查看表结构
SELECT 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'practice_records'
ORDER BY ordinal_position;

-- 查看索引
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'practice_records';

-- 查看视图
SELECT 
  table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE '%stats' OR table_name LIKE '%summary';

-- ============================================
-- 测试查询示例
-- ============================================

-- 插入测试数据（可选，仅用于测试）
/*
INSERT INTO practice_records (
  student_name,
  class_name,
  raw_text,
  results,
  accuracy_rate,
  perfect_sentences,
  total_sentences,
  total_words,
  difficulty_level,
  input_method
) VALUES (
  '测试学生',
  '测试班级',
  'This is a test sentence.',
  '[{"score": 10, "diffs": [[0, "This is a test sentence."]]}]'::jsonb,
  100.0,
  1,
  1,
  5,
  'master',
  'text'
);
*/

-- 查询测试
-- SELECT * FROM practice_records LIMIT 5;
-- SELECT * FROM student_summary LIMIT 5;
-- SELECT * FROM class_stats;
-- SELECT * FROM daily_stats LIMIT 7;

-- ============================================
-- 完成！
-- ============================================

-- 成功提示
DO $$
BEGIN
  RAISE NOTICE '✅ 数据库初始化完成！';
  RAISE NOTICE '📊 已创建表: practice_records';
  RAISE NOTICE '📈 已创建5个视图: student_summary, class_stats, daily_stats, difficulty_stats, input_method_stats';
  RAISE NOTICE '🔧 已创建2个函数: get_student_trend(), get_class_ranking()';
  RAISE NOTICE '🎉 可以开始使用了！';
END $$;

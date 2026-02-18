-- ============================================
-- 英语听写系统 - 精简版数据表结构
-- ============================================
-- 只保留教学研究真正需要的核心字段
--
-- 使用说明：
-- 1. 登录 Supabase Dashboard (https://supabase.com)
-- 2. 进入 SQL Editor
-- 3. 复制并执行以下 SQL 语句
-- ============================================

-- 添加核心字段到现有表
ALTER TABLE practice_records 
-- 学生信息（最重要！）
ADD COLUMN IF NOT EXISTS student_name TEXT,
ADD COLUMN IF NOT EXISTS class_name TEXT,

-- 核心统计数据（对应界面显示的数据）
ADD COLUMN IF NOT EXISTS accuracy_rate DECIMAL(5,2),     -- 正确率(%)
ADD COLUMN IF NOT EXISTS perfect_sentences INTEGER,      -- 完美句数
ADD COLUMN IF NOT EXISTS total_sentences INTEGER,        -- 总句子数
ADD COLUMN IF NOT EXISTS total_words INTEGER,            -- 总单词数
ADD COLUMN IF NOT EXISTS difficulty_level TEXT,          -- 难度等级

-- 输入方式
ADD COLUMN IF NOT EXISTS input_method TEXT;              -- text/voice/image

-- 创建索引（提高查询性能）
CREATE INDEX IF NOT EXISTS idx_student_name ON practice_records(student_name);
CREATE INDEX IF NOT EXISTS idx_class_name ON practice_records(class_name);
CREATE INDEX IF NOT EXISTS idx_created_at ON practice_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accuracy ON practice_records(accuracy_rate);

-- 添加注释
COMMENT ON COLUMN practice_records.student_name IS '学生姓名';
COMMENT ON COLUMN practice_records.class_name IS '班级名称';
COMMENT ON COLUMN practice_records.accuracy_rate IS '正确率(0-100)';
COMMENT ON COLUMN practice_records.perfect_sentences IS '完美句数(满分10分的句子)';
COMMENT ON COLUMN practice_records.total_sentences IS '总句子数';
COMMENT ON COLUMN practice_records.total_words IS '总单词数';
COMMENT ON COLUMN practice_records.difficulty_level IS '难度等级: beginner/intermediate/advanced/master';
COMMENT ON COLUMN practice_records.input_method IS '输入方式: text/voice/image';

-- ============================================
-- 实用查询视图
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
  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_practices
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
  MAX(created_at) as last_practice_date
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
  SUM(total_words) as words_practiced
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
  ROUND(AVG(total_words), 0) as avg_word_count
FROM practice_records
WHERE difficulty_level IS NOT NULL
GROUP BY difficulty_level
ORDER BY 
  CASE difficulty_level
    WHEN 'beginner' THEN 1
    WHEN 'intermediate' THEN 2
    WHEN 'advanced' THEN 3
    WHEN 'master' THEN 4
  END;

-- ============================================
-- 实用查询示例
-- ============================================

-- 查询1: 查看某个学生的练习历史
-- SELECT * FROM practice_records 
-- WHERE student_name = '张三' 
-- ORDER BY created_at DESC;

-- 查询2: 查看某个班级的整体表现
-- SELECT * FROM student_summary 
-- WHERE class_name = '高一(3)班'
-- ORDER BY avg_accuracy DESC;

-- 查询3: 找出需要帮助的学生（准确率<70%）
-- SELECT student_name, class_name, avg_accuracy, total_practices
-- FROM student_summary
-- WHERE avg_accuracy < 70
-- ORDER BY avg_accuracy;

-- 查询4: 查看最近7天的练习情况
-- SELECT * FROM daily_stats
-- WHERE practice_date >= CURRENT_DATE - INTERVAL '7 days';

-- 查询5: 查看某次练习的详细错误
-- SELECT 
--   student_name,
--   raw_text,
--   results,
--   accuracy_rate,
--   created_at
-- FROM practice_records
-- WHERE id = 'xxx';

-- ============================================
-- 验证
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

-- ============================================
-- 完成！
-- ============================================
-- 
-- 下一步：
-- 1. 在应用中完成一次练习测试
-- 2. 检查 Supabase 表格是否有新数据
-- 3. 使用上面的查询示例分析数据
-- 
-- ============================================

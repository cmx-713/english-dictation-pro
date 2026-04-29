-- ============================================
-- 诊断并修复班级数据不一致问题
-- ============================================
-- 
-- 问题：选择A甲2时，显示了A乙2等其他班级的学生
-- 原因：同一学生在不同记录中的班级名称不一致
--
-- ============================================

-- 第一步：诊断问题
-- ============================================

-- 查看每个学生的班级名称分布
-- 如果一个学生有多个不同的班级名称，就会出问题
SELECT 
  student_name as 学生姓名,
  STRING_AGG(DISTINCT class_name, ', ' ORDER BY class_name) as 所有班级名称,
  COUNT(DISTINCT class_name) as 班级名称数量,
  COUNT(*) as 练习记录数
FROM practice_records
WHERE student_name IS NOT NULL
GROUP BY student_name
HAVING COUNT(DISTINCT class_name) > 1  -- 只显示有多个班级名称的学生
ORDER BY student_name;

-- 查看 student_summary 视图的数据
-- 这个视图用于教师后台的学生列表
SELECT 
  student_name,
  class_name,
  total_practices
FROM student_summary
ORDER BY class_name, student_name;

-- 查看具体某个学生的所有记录（示例：刘宇航）
SELECT 
  student_name,
  class_name,
  created_at,
  accuracy_rate
FROM practice_records
WHERE student_name = '刘宇航'  -- 替换为实际学生姓名
ORDER BY created_at DESC;

-- ============================================
-- 第二步：找出最常用的班级名称
-- ============================================

-- 为每个学生找出他们最常使用的班级名称
WITH student_class_counts AS (
  SELECT 
    student_name,
    class_name,
    COUNT(*) as usage_count,
    MAX(created_at) as last_used,
    ROW_NUMBER() OVER (
      PARTITION BY student_name 
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
    ) as rn
  FROM practice_records
  WHERE student_name IS NOT NULL AND class_name IS NOT NULL
  GROUP BY student_name, class_name
)
SELECT 
  student_name as 学生姓名,
  class_name as 应该使用的班级,
  usage_count as 使用次数,
  last_used as 最后使用时间
FROM student_class_counts
WHERE rn = 1  -- 每个学生的首选班级
ORDER BY student_name;

-- ============================================
-- 第三步：修复方案
-- ============================================

-- 方案A：将每个学生的所有记录统一为最常用的班级名称
-- （这是最推荐的方案）

-- 先创建一个临时表存储每个学生应该使用的班级
CREATE TEMP TABLE student_correct_class AS
WITH student_class_counts AS (
  SELECT 
    student_name,
    class_name,
    COUNT(*) as usage_count,
    MAX(created_at) as last_used,
    ROW_NUMBER() OVER (
      PARTITION BY student_name 
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
    ) as rn
  FROM practice_records
  WHERE student_name IS NOT NULL AND class_name IS NOT NULL
  GROUP BY student_name, class_name
)
SELECT 
  student_name,
  class_name as correct_class
FROM student_class_counts
WHERE rn = 1;

-- 查看将要进行的更新（预览）
SELECT 
  pr.student_name as 学生,
  pr.class_name as 当前班级,
  scc.correct_class as 将改为,
  COUNT(*) as 影响的记录数
FROM practice_records pr
JOIN student_correct_class scc ON pr.student_name = scc.student_name
WHERE pr.class_name != scc.correct_class
GROUP BY pr.student_name, pr.class_name, scc.correct_class
ORDER BY pr.student_name;

-- 确认无误后，执行更新
UPDATE practice_records pr
SET class_name = scc.correct_class
FROM student_correct_class scc
WHERE pr.student_name = scc.student_name
  AND pr.class_name != scc.correct_class;

-- 同时更新 students 表
UPDATE students s
SET class_name = scc.correct_class
FROM student_correct_class scc
WHERE s.student_name = scc.student_name
  AND (s.class_name IS NULL OR s.class_name != scc.correct_class);

-- 清理临时表
DROP TABLE student_correct_class;

-- ============================================
-- 方案B：手动指定某些学生的班级
-- ============================================

-- 如果您知道某个学生的正确班级，可以直接修改
-- 示例：将"刘宇航"的所有记录改为"A乙2"

/*
UPDATE practice_records
SET class_name = 'A乙2'
WHERE student_name = '刘宇航';

UPDATE students
SET class_name = 'A乙2'
WHERE student_name = '刘宇航';
*/

-- 批量修改示例
/*
UPDATE practice_records
SET class_name = '正确的班级名称'
WHERE student_name IN ('学生1', '学生2', '学生3');
*/

-- ============================================
-- 第四步：验证修复结果
-- ============================================

-- 再次检查是否还有学生有多个班级名称
SELECT 
  student_name as 学生姓名,
  STRING_AGG(DISTINCT class_name, ', ') as 所有班级名称,
  COUNT(DISTINCT class_name) as 班级名称数量
FROM practice_records
WHERE student_name IS NOT NULL
GROUP BY student_name
HAVING COUNT(DISTINCT class_name) > 1
ORDER BY student_name;

-- 如果上面的查询返回空结果，说明修复成功！

-- 查看修复后的班级统计
SELECT * FROM class_stats ORDER BY class_name;

-- 查看修复后的学生摘要
SELECT 
  student_name,
  class_name,
  total_practices,
  avg_accuracy
FROM student_summary
WHERE class_name = 'A甲2'  -- 查看A甲2班的学生
ORDER BY avg_accuracy DESC;

-- ============================================
-- 第五步：重建视图（可选，如果视图数据还是不对）
-- ============================================

-- 强制刷新物化视图（如果使用了物化视图）
-- REFRESH MATERIALIZED VIEW student_summary;
-- REFRESH MATERIALIZED VIEW class_stats;

-- 或者重建视图
DROP VIEW IF EXISTS student_summary CASCADE;
DROP VIEW IF EXISTS class_stats CASCADE;

-- 重新创建 student_summary 视图
CREATE OR REPLACE VIEW student_summary AS
SELECT 
  student_name,
  class_name,
  COUNT(*) as total_practices,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
  SUM(total_words) as total_words_practiced,
  SUM(perfect_sentences) as perfect_sentence_count,
  MAX(created_at) as last_practice_date,
  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_practices,
  MAX(accuracy_rate) as best_accuracy,
  MIN(accuracy_rate) as worst_accuracy
FROM practice_records
WHERE student_name IS NOT NULL
GROUP BY student_name, class_name
ORDER BY avg_accuracy DESC;

-- 重新创建 class_stats 视图
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

-- ============================================
-- 完成！
-- ============================================
-- 
-- 修复后：
-- 1. 每个学生只有一个班级名称
-- 2. student_summary 视图数据正确
-- 3. 教师后台筛选功能正常
--
-- 后续预防措施：
-- 1. 部署更新后的代码（自动标准化）
-- 2. 学生不要随意更改班级信息
-- 3. 定期检查数据一致性
--
-- ============================================

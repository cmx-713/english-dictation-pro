-- ============================================
-- 快速修复：去除班级名称末尾的"班"字
-- ============================================
-- 
-- 问题：A甲2 和 A甲2班 被视为不同班级
-- 解决：去除末尾的"班"字，统一为标准格式
--
-- 执行时间：< 1秒
-- ============================================

-- 第一步：查看当前问题
-- ============================================

-- 查看所有带"班"字的班级名称
SELECT 
  class_name as 当前名称,
  REGEXP_REPLACE(class_name, '班$', '') as 修改后,
  COUNT(*) as 记录数
FROM practice_records 
WHERE class_name LIKE '%班'
GROUP BY class_name
ORDER BY class_name;

-- 查看会被合并的情况
WITH normalized AS (
  SELECT 
    class_name as original,
    REGEXP_REPLACE(class_name, '班$', '') as normalized,
    COUNT(*) as count
  FROM practice_records
  GROUP BY class_name
)
SELECT 
  normalized as 标准化后的班级,
  STRING_AGG(original, ', ') as 原始格式,
  SUM(count) as 总记录数
FROM normalized
GROUP BY normalized
HAVING COUNT(*) > 1
ORDER BY normalized;

-- 第二步：执行修复（确认无误后执行）
-- ============================================

-- 备份（可选，如果之前已备份则跳过）
-- CREATE TABLE practice_records_backup_班 AS SELECT * FROM practice_records;
-- CREATE TABLE students_backup_班 AS SELECT * FROM students;

-- 更新 practice_records 表
UPDATE practice_records
SET class_name = REGEXP_REPLACE(class_name, '班$', '')
WHERE class_name LIKE '%班';

-- 更新 students 表
UPDATE students
SET class_name = REGEXP_REPLACE(class_name, '班$', '')
WHERE class_name LIKE '%班';

-- 第三步：验证结果
-- ============================================

-- 查看更新后的班级列表
SELECT 
  class_name as 班级,
  COUNT(*) as 记录数,
  COUNT(DISTINCT student_name) as 学生数
FROM practice_records
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- 查看班级统计视图
SELECT * FROM class_stats ORDER BY class_name;

-- 查看具体的合并结果（以A甲2为例）
SELECT 
  student_name as 学生,
  class_name as 班级,
  COUNT(*) as 练习次数
FROM practice_records
WHERE class_name = 'A甲2'
GROUP BY student_name, class_name
ORDER BY student_name;

-- ============================================
-- 完成！
-- ============================================
-- 
-- 修复后：
-- - A甲2班 → A甲2 ✓
-- - A乙2班 → A乙2 ✓
-- - 所有班级名称统一，无"班"字后缀
--
-- ============================================

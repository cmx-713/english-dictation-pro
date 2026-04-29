-- ============================================
-- 班级名称数据迁移脚本
-- ============================================
-- 
-- 目的：将旧格式的班级名称更新为新格式（带年级）
-- 映射关系：
--   A甲2  → 2025级A甲2
--   A乙2  → 2025级A乙2
--   A甲6  → 2024级A甲6
--   A乙6  → 2024级A乙6
--
-- 执行时间：< 1秒
-- ============================================

-- 第一步：查看当前数据（备份前确认）
-- ============================================

-- 查看需要更新的班级分布
SELECT 
  class_name as 当前班级名称,
  COUNT(*) as 记录数,
  COUNT(DISTINCT student_name) as 学生数
FROM practice_records
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6')
GROUP BY class_name
ORDER BY class_name;

-- 查看所有班级分布
SELECT 
  class_name as 班级,
  COUNT(*) as 记录数
FROM practice_records
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- 第二步：备份数据（重要！）
-- ============================================

-- 创建备份表（如果还没有）
CREATE TABLE IF NOT EXISTS practice_records_backup_migration AS 
SELECT * FROM practice_records 
WHERE 1=0;  -- 创建空表结构

-- 备份将要修改的数据
INSERT INTO practice_records_backup_migration
SELECT * FROM practice_records
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6');

-- 同样备份 students 表
CREATE TABLE IF NOT EXISTS students_backup_migration AS 
SELECT * FROM students 
WHERE 1=0;

INSERT INTO students_backup_migration
SELECT * FROM students
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6');

-- 验证备份
SELECT 
  'practice_records_backup_migration' as 表名,
  COUNT(*) as 备份记录数
FROM practice_records_backup_migration
UNION ALL
SELECT 
  'students_backup_migration' as 表名,
  COUNT(*) as 备份记录数
FROM students_backup_migration;

-- 第三步：预览将要进行的更改
-- ============================================

-- 查看 practice_records 表的更新预览
SELECT 
  class_name as 当前名称,
  CASE 
    WHEN class_name = 'A甲2' THEN '2025级A甲2'
    WHEN class_name = 'A乙2' THEN '2025级A乙2'
    WHEN class_name = 'A甲6' THEN '2024级A甲6'
    WHEN class_name = 'A乙6' THEN '2024级A乙6'
  END as 更新后,
  COUNT(*) as 影响记录数,
  COUNT(DISTINCT student_name) as 影响学生数
FROM practice_records
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6')
GROUP BY class_name
ORDER BY class_name;

-- 查看 students 表的更新预览
SELECT 
  class_name as 当前名称,
  CASE 
    WHEN class_name = 'A甲2' THEN '2025级A甲2'
    WHEN class_name = 'A乙2' THEN '2025级A乙2'
    WHEN class_name = 'A甲6' THEN '2024级A甲6'
    WHEN class_name = 'A乙6' THEN '2024级A乙6'
  END as 更新后,
  COUNT(*) as 影响学生数
FROM students
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6')
GROUP BY class_name
ORDER BY class_name;

-- 第四步：执行更新（确认无误后执行）
-- ============================================

-- 更新 practice_records 表
UPDATE practice_records
SET class_name = '2025级A甲2'
WHERE class_name = 'A甲2';

UPDATE practice_records
SET class_name = '2025级A乙2'
WHERE class_name = 'A乙2';

UPDATE practice_records
SET class_name = '2024级A甲6'
WHERE class_name = 'A甲6';

UPDATE practice_records
SET class_name = '2024级A乙6'
WHERE class_name = 'A乙6';

-- 更新 students 表
UPDATE students
SET class_name = '2025级A甲2'
WHERE class_name = 'A甲2';

UPDATE students
SET class_name = '2025级A乙2'
WHERE class_name = 'A乙2';

UPDATE students
SET class_name = '2024级A甲6'
WHERE class_name = 'A甲6';

UPDATE students
SET class_name = '2024级A乙6'
WHERE class_name = 'A乙6';

-- 第五步：验证更新结果
-- ============================================

-- 确认旧名称已经不存在
SELECT 
  class_name,
  COUNT(*) as 记录数
FROM practice_records
WHERE class_name IN ('A甲2', 'A乙2', 'A甲6', 'A乙6')
GROUP BY class_name;
-- 应该返回空结果

-- 查看新名称的记录数
SELECT 
  class_name as 班级,
  COUNT(*) as 记录数,
  COUNT(DISTINCT student_name) as 学生数
FROM practice_records
WHERE class_name IN ('2025级A甲2', '2025级A乙2', '2024级A甲6', '2024级A乙6')
GROUP BY class_name
ORDER BY class_name;

-- 查看所有班级统计
SELECT * FROM class_stats ORDER BY class_name;

-- 查看学生摘要
SELECT 
  student_name,
  class_name,
  total_practices
FROM student_summary
WHERE class_name IN ('2025级A甲2', '2025级A乙2', '2024级A甲6', '2024级A乙6')
ORDER BY class_name, student_name;

-- 第六步：清理备份表（可选，确认无误后执行）
-- ============================================

-- 如果一切正常，可以删除备份表
-- 建议保留一段时间，确认没问题后再删除

/*
DROP TABLE IF EXISTS practice_records_backup_migration;
DROP TABLE IF EXISTS students_backup_migration;
*/

-- ============================================
-- 回滚方案（如果需要）
-- ============================================

-- 如果发现问题，可以从备份恢复
/*
UPDATE practice_records pr
SET class_name = prb.class_name
FROM practice_records_backup_migration prb
WHERE pr.id = prb.id;

UPDATE students s
SET class_name = sb.class_name
FROM students_backup_migration sb
WHERE s.id = sb.id;
*/

-- ============================================
-- 完成！
-- ============================================
-- 
-- 迁移完成后：
-- ✓ 所有 A甲2 → 2025级A甲2
-- ✓ 所有 A乙2 → 2025级A乙2
-- ✓ 所有 A甲6 → 2024级A甲6
-- ✓ 所有 A乙6 → 2024级A乙6
--
-- 后续步骤：
-- 1. 刷新教师后台验证
-- 2. 部署前端代码（下拉框已更新）
-- 3. 通知学生使用新的班级格式
--
-- ============================================

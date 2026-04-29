-- ============================================
-- 班级名称标准化脚本
-- ============================================
-- 
-- 目的：统一不同格式的班级名称
-- 问题：A乙2、a乙2、A乙二 等格式不统一
-- 解决：标准化为统一格式（大写字母+阿拉伯数字）
--
-- 使用说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 先执行"查看当前数据"部分，确认需要清理的数据
-- 4. 再执行"标准化处理"部分
-- 5. 最后执行"验证结果"部分
-- ============================================

-- ============================================
-- 第一步：查看当前数据情况
-- ============================================

-- 查看 practice_records 表中的所有不同班级名称
SELECT 
  class_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT student_name) as student_count
FROM practice_records
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- 查看 students 表中的所有不同班级名称
SELECT 
  class_name,
  COUNT(*) as student_count
FROM students
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- ============================================
-- 第二步：创建标准化函数
-- ============================================

-- 创建一个 PostgreSQL 函数来标准化班级名称
CREATE OR REPLACE FUNCTION normalize_class_name(class_name TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  IF class_name IS NULL OR class_name = '' THEN
    RETURN '';
  END IF;
  
  result := TRIM(class_name);
  
  -- 1. 转大写
  result := UPPER(result);
  
  -- 2. 中文数字转阿拉伯数字
  result := REPLACE(result, '零', '0');
  result := REPLACE(result, '〇', '0');
  result := REPLACE(result, '一', '1');
  result := REPLACE(result, '壹', '1');
  result := REPLACE(result, '二', '2');
  result := REPLACE(result, '贰', '2');
  result := REPLACE(result, '三', '3');
  result := REPLACE(result, '叁', '3');
  result := REPLACE(result, '四', '4');
  result := REPLACE(result, '肆', '4');
  result := REPLACE(result, '五', '5');
  result := REPLACE(result, '伍', '5');
  result := REPLACE(result, '六', '6');
  result := REPLACE(result, '陆', '6');
  result := REPLACE(result, '七', '7');
  result := REPLACE(result, '柒', '7');
  result := REPLACE(result, '八', '8');
  result := REPLACE(result, '捌', '8');
  result := REPLACE(result, '九', '9');
  result := REPLACE(result, '玖', '9');
  result := REPLACE(result, '十', '10');
  result := REPLACE(result, '拾', '10');
  
  -- 3. 去除所有空格
  result := REPLACE(result, ' ', '');
  
  -- 4. 全角转半角（常见字符）
  result := TRANSLATE(result, 
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  );
  
  -- 5. 去除末尾的"班"字
  -- 例如：A甲2班 → A甲2
  result := REGEXP_REPLACE(result, '班$', '');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 测试函数（可选，查看标准化效果）
SELECT 
  'a乙2' as original,
  normalize_class_name('a乙2') as normalized
UNION ALL
SELECT 'A乙二', normalize_class_name('A乙二')
UNION ALL
SELECT ' A 乙 2 ', normalize_class_name(' A 乙 2 ')
UNION ALL
SELECT 'ａ乙２', normalize_class_name('ａ乙２')
UNION ALL
SELECT 'A甲1', normalize_class_name('A甲1')
UNION ALL
SELECT 'A甲2班', normalize_class_name('A甲2班')
UNION ALL
SELECT 'A乙2班', normalize_class_name('A乙2班');

-- ============================================
-- 第三步：预览将要进行的更改
-- ============================================

-- 查看 practice_records 中哪些记录会被更新
SELECT 
  class_name as original_class_name,
  normalize_class_name(class_name) as new_class_name,
  COUNT(*) as affected_records,
  COUNT(DISTINCT student_name) as affected_students
FROM practice_records
WHERE class_name IS NOT NULL 
  AND class_name != ''
  AND class_name != normalize_class_name(class_name)
GROUP BY class_name, normalize_class_name(class_name)
ORDER BY class_name;

-- 查看 students 中哪些记录会被更新
SELECT 
  class_name as original_class_name,
  normalize_class_name(class_name) as new_class_name,
  COUNT(*) as affected_students
FROM students
WHERE class_name IS NOT NULL 
  AND class_name != ''
  AND class_name != normalize_class_name(class_name)
GROUP BY class_name, normalize_class_name(class_name)
ORDER BY class_name;

-- ============================================
-- 第四步：执行标准化更新（确认无误后执行）
-- ============================================

-- 更新 practice_records 表
UPDATE practice_records
SET class_name = normalize_class_name(class_name)
WHERE class_name IS NOT NULL 
  AND class_name != ''
  AND class_name != normalize_class_name(class_name);

-- 更新 students 表
UPDATE students
SET class_name = normalize_class_name(class_name)
WHERE class_name IS NOT NULL 
  AND class_name != ''
  AND class_name != normalize_class_name(class_name);

-- ============================================
-- 第五步：验证结果
-- ============================================

-- 查看更新后的班级分布（practice_records）
SELECT 
  class_name,
  COUNT(*) as record_count,
  COUNT(DISTINCT student_name) as student_count,
  ROUND(AVG(accuracy_rate), 1) as avg_accuracy
FROM practice_records
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- 查看更新后的班级分布（students）
SELECT 
  class_name,
  COUNT(*) as student_count
FROM students
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;

-- 查看班级统计视图（应该显示合并后的数据）
SELECT * FROM class_stats ORDER BY class_name;

-- 查看学生摘要视图（检查学生是否正确归类）
SELECT 
  student_name,
  class_name,
  total_practices,
  avg_accuracy
FROM student_summary
ORDER BY class_name, avg_accuracy DESC;

-- ============================================
-- 补充：如果需要回滚（仅在备份后使用）
-- ============================================

-- 注意：PostgreSQL 不支持简单的回滚历史数据
-- 建议在执行更新前先导出数据：
-- 1. 在 Supabase Dashboard 中导出 CSV
-- 2. 或使用以下命令创建备份表：

-- 创建备份表（在更新前执行）
/*
CREATE TABLE practice_records_backup AS 
SELECT * FROM practice_records;

CREATE TABLE students_backup AS 
SELECT * FROM students;
*/

-- 如果需要恢复（仅在创建了备份表的情况下）
/*
UPDATE practice_records pr
SET class_name = prb.class_name
FROM practice_records_backup prb
WHERE pr.id = prb.id;

UPDATE students s
SET class_name = sb.class_name
FROM students_backup sb
WHERE s.id = sb.id;
*/

-- ============================================
-- 完成！
-- ============================================
-- 
-- 标准化完成后：
-- 1. 所有班级名称已统一格式
-- 2. 教师后台的班级筛选功能正常工作
-- 3. 新的练习记录会自动标准化
--
-- 维护说明：
-- - normalize_class_name() 函数会保留在数据库中
-- - 可以用于将来的数据清理
-- - 应用代码也会在保存前自动标准化
--
-- ============================================

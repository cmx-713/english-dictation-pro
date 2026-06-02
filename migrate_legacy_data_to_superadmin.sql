-- ============================================================
-- 历史数据迁移：将 teacher_id = NULL 的学生和练习记录
-- 全部归属到超级管理员账号
-- 
-- 执行前请先查询超管的 UID（替换下面的 <超管UID>）：
--   SELECT id FROM auth.users 
--   WHERE email LIKE '%@ext.teacher' 
--   ORDER BY created_at LIMIT 5;
--
-- 执行顺序：
--   Step 0 → 查看 → Step 1 → Step 2 → Step 3 → Step 4 验证
-- ============================================================

-- ── Step 0: 查看当前未归属的数据量（先执行确认）──────────────
SELECT 
  '未归属学生' AS 类型,
  COUNT(*) AS 数量 
FROM students 
WHERE teacher_id IS NULL
UNION ALL
SELECT 
  '未归属练习记录',
  COUNT(*) 
FROM practice_records 
WHERE teacher_id IS NULL;


-- ── Step 1: 查询超管 UID（复制结果备用）────────────────────
-- SELECT id, email, created_at 
-- FROM auth.users 
-- WHERE raw_user_meta_data->>'role' = 'super_admin'
-- LIMIT 1;


-- ── Step 2: 将 teacher_id = NULL 的学生归属到超管 ──────────
-- 将 <超管UID> 替换为 Step 1 查出的 UUID，例如：
--   'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

UPDATE students
SET teacher_id = '<超管UID>'   -- ← 替换这里
WHERE teacher_id IS NULL;


-- ── Step 3a: 若 practice_records 还没有 teacher_id 列，先加列 ──
ALTER TABLE practice_records
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_practice_records_teacher_id
  ON practice_records(teacher_id);


-- ── Step 3b: 通过 student_name + class_name 回填 practice_records ──
UPDATE practice_records pr
SET teacher_id = s.teacher_id
FROM students s
WHERE pr.student_name = s.student_name
  AND pr.class_name   = s.class_name
  AND pr.teacher_id   IS NULL
  AND s.teacher_id    IS NOT NULL;


-- ── Step 3c: 若仍有 practice_records.teacher_id = NULL
--            (学生名/班级在 students 表里找不到对应)
--            直接归属到超管 ──────────────────────────────────
UPDATE practice_records
SET teacher_id = '<超管UID>'   -- ← 同上，替换这里
WHERE teacher_id IS NULL;


-- ── Step 4: 验证迁移结果 ──────────────────────────────────
SELECT 
  '迁移后未归属学生' AS 类型,
  COUNT(*) AS 数量 
FROM students 
WHERE teacher_id IS NULL
UNION ALL
SELECT 
  '迁移后未归属记录',
  COUNT(*) 
FROM practice_records 
WHERE teacher_id IS NULL
UNION ALL
SELECT
  '超管名下学生数',
  COUNT(*)
FROM students
WHERE teacher_id = '<超管UID>'  -- ← 同上，替换这里
UNION ALL
SELECT
  '超管名下练习记录数',
  COUNT(*)
FROM practice_records
WHERE teacher_id = '<超管UID>'; -- ← 同上，替换这里

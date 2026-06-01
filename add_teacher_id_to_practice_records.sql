-- ============================================================
-- 给 practice_records 加 teacher_id 列
-- 目的：让练习记录直接归属于特定教师，
--       解决"姓名+班级相同"时跨教师数据交叉的问题
-- ============================================================

-- 1. 加列
ALTER TABLE practice_records
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. 加索引（提升教师端查询性能）
CREATE INDEX IF NOT EXISTS idx_practice_records_teacher_id
  ON practice_records(teacher_id);

-- 3. 回填历史数据（将已有记录按学生归属更新 teacher_id）
--    通过 student_name + class_name 匹配 students 表里的 teacher_id
UPDATE practice_records pr
SET teacher_id = s.teacher_id
FROM students s
WHERE pr.student_name = s.student_name
  AND pr.class_name   = s.class_name
  AND pr.teacher_id   IS NULL
  AND s.teacher_id    IS NOT NULL;

-- 4. 更新 RLS：允许教师通过 teacher_id 直接过滤练习记录
--    （现有 anon 策略保留，authenticated 策略改用 teacher_id 过滤）
DROP POLICY IF EXISTS "authenticated_select_practice_records" ON practice_records;
CREATE POLICY "authenticated_select_practice_records" ON practice_records
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- ============================================================
-- Phase 3 补丁：practice_records 数据隔离 + 视图 security_invoker
--
-- 背景：student_summary / class_stats / daily_stats 等视图
--       全部基于 practice_records 表聚合，该表无 teacher_id。
--       需通过 students 表的 teacher_id 做间接过滤。
-- ============================================================

-- 1. 确保 practice_records 开启 RLS
ALTER TABLE practice_records ENABLE ROW LEVEL SECURITY;

-- 2. anon 可查所有记录（学生端查历史记录需要）
DROP POLICY IF EXISTS "anon_select_practice_records" ON practice_records;
CREATE POLICY "anon_select_practice_records" ON practice_records
  FOR SELECT TO anon USING (true);

-- 3. authenticated 教师：只能看自己学生的练习记录
--    通过 students 表的 teacher_id 做间接关联
--    超管：看全部
DROP POLICY IF EXISTS "authenticated_select_practice_records" ON practice_records;
CREATE POLICY "authenticated_select_practice_records" ON practice_records
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.student_name = practice_records.student_name
        AND s.class_name   = practice_records.class_name
        AND s.teacher_id   = auth.uid()
    )
  );

-- 4. authenticated 教师：插入自己的练习记录（当前主要由 anon 写入，此处备用）
DROP POLICY IF EXISTS "authenticated_insert_practice_records" ON practice_records;
CREATE POLICY "authenticated_insert_practice_records" ON practice_records
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 5. 视图启用 security_invoker（使视图使用调用者权限，RLS 生效）
--    需要 PostgreSQL 15+（Supabase 已支持）
-- ============================================================
ALTER VIEW student_summary  SET (security_invoker = on);
ALTER VIEW class_stats      SET (security_invoker = on);
ALTER VIEW daily_stats      SET (security_invoker = on);

-- 如果存在以下视图，也一并设置
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'difficulty_stats') THEN
    EXECUTE 'ALTER VIEW difficulty_stats SET (security_invoker = on)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'input_method_stats') THEN
    EXECUTE 'ALTER VIEW input_method_stats SET (security_invoker = on)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'student_number_summary') THEN
    EXECUTE 'ALTER VIEW student_number_summary SET (security_invoker = on)';
  END IF;
END $$;

-- ============================================================
-- 验证方法（执行后用普通教师账号登录，查看教师端是否只显示自己的学生）
--
-- 如果视图查询仍然返回所有数据，说明 PostgreSQL 版本不支持 security_invoker。
-- 此时改用「前端过滤方案」：查看 README 或联系开发者。
-- ============================================================

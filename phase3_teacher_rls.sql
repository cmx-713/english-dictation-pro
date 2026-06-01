-- ============================================================
-- Phase 3: 教师数据隔离 RLS 策略
-- 说明：
--   anon 角色（学生）：保持原有访问权限不变
--   authenticated 角色（教师）：只能看到自己的学生和作业
--   super_admin：不受限制，看所有数据
-- ============================================================

-- ── students 表 ──────────────────────────────────────────────

-- 教师查看：只能看自己的学生（teacher_id = auth.uid()）
-- 超管：可查看所有
DROP POLICY IF EXISTS "authenticated_select_students" ON students;
CREATE POLICY "authenticated_select_students" ON students
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- 教师插入：teacher_id 必须等于自己
DROP POLICY IF EXISTS "authenticated_insert_students" ON students;
CREATE POLICY "authenticated_insert_students" ON students
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- 教师更新：只能改自己的学生
DROP POLICY IF EXISTS "authenticated_update_students" ON students;
CREATE POLICY "authenticated_update_students" ON students
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- 教师删除：只能删自己的学生
DROP POLICY IF EXISTS "authenticated_delete_students" ON students;
CREATE POLICY "authenticated_delete_students" ON students
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- ── class_assignments 表 ─────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_select_assignments" ON class_assignments;
CREATE POLICY "authenticated_select_assignments" ON class_assignments
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "authenticated_insert_assignments" ON class_assignments;
CREATE POLICY "authenticated_insert_assignments" ON class_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "authenticated_update_assignments" ON class_assignments;
CREATE POLICY "authenticated_update_assignments" ON class_assignments
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "authenticated_delete_assignments" ON class_assignments;
CREATE POLICY "authenticated_delete_assignments" ON class_assignments
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR teacher_id = auth.uid()
  );

-- ── assignment_submissions 表 ─────────────────────────────────
-- 通过 class_assignment_id 间接归属教师，先允许 authenticated 全查，
-- 后续可通过 JOIN 进一步收窄（当前阶段以 class_assignments 隔离为主）

DROP POLICY IF EXISTS "authenticated_select_submissions" ON assignment_submissions;
CREATE POLICY "authenticated_select_submissions" ON assignment_submissions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
    OR assignment_id IN (
      SELECT id FROM class_assignments
      WHERE teacher_id = auth.uid()
    )
  );

-- ============================================================
-- 超管现有数据迁移（可选）：
-- 如需将已有学生数据归属到超管账号，执行：
--
-- UPDATE students SET teacher_id = '<超管的 auth.users.id>'
-- WHERE teacher_id IS NULL;
--
-- UPDATE class_assignments SET teacher_id = '<超管的 auth.users.id>'
-- WHERE teacher_id IS NULL;
--
-- 超管 ID 查询方式：
-- SELECT id FROM auth.users WHERE email = 'cmx@ext.teacher';
-- ============================================================

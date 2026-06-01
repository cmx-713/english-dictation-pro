-- ============================================================
-- 修复：听力素材库 (dictation_materials) 对教师角色不可见
-- 原因：RLS 启用后只有 anon 策略，缺少 authenticated 策略
-- ============================================================

-- 允许所有已登录用户（教师、超管）查看素材库
DROP POLICY IF EXISTS "authenticated_select_materials" ON dictation_materials;
CREATE POLICY "authenticated_select_materials" ON dictation_materials
  FOR SELECT TO authenticated
  USING (true);

-- 允许超管插入/更新/删除素材（普通教师只读）
DROP POLICY IF EXISTS "superadmin_manage_materials" ON dictation_materials;
CREATE POLICY "superadmin_manage_materials" ON dictation_materials
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
  );

-- ============================================================
-- 同时：为学生登录班级列表提供公开视图（仅暴露班级名）
-- 学生以 anon 角色查询班级列表
-- ============================================================

-- 公开班级名视图（不含学生姓名/学号等敏感信息）
CREATE OR REPLACE VIEW public_class_names AS
  SELECT DISTINCT class_name
  FROM students
  WHERE class_name IS NOT NULL AND class_name <> ''
  ORDER BY class_name;

-- 允许匿名用户查询该视图
GRANT SELECT ON public_class_names TO anon;
GRANT SELECT ON public_class_names TO authenticated;

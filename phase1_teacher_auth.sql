-- ============================================================
-- Phase 1: 教师认证基础结构
-- 说明：仅添加 teacher_id 列和索引，全部为 nullable，向后兼容
--       现有数据不受影响，RLS 策略不做破坏性更改
-- ============================================================

-- 1. students 表：增加 teacher_id（归属教师）
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. class_assignments 表：增加 teacher_id（创建该作业的教师）
ALTER TABLE class_assignments
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. 创建索引（提升按教师过滤的查询性能）
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_teacher_id ON class_assignments(teacher_id);

-- 4. 字段注释
COMMENT ON COLUMN students.teacher_id IS '归属教师的 Supabase Auth user ID，NULL 表示超管直接导入或历史数据';
COMMENT ON COLUMN class_assignments.teacher_id IS '创建该作业的教师 Supabase Auth user ID';

-- ============================================================
-- 登录规则说明：
--   所有教师（含超管）使用"姓名 + 工号"登录
--   系统内部将工号映射为虚拟邮箱：{工号}@ext.teacher
--   密码默认等于工号本身（管理员创建账号时设定）
-- ============================================================

-- ============================================================
-- 在 Supabase Dashboard 手动创建账号步骤：
--
-- ① 添加你自己（超级管理员）：
--   Authentication → Users → Add user → enter manually
--   Email:    SA001@ext.teacher          （SA001 是你的工号，可自定义）
--   Password: SA001                       （与工号相同）
--
--   然后在 SQL Editor 运行：
--   UPDATE auth.users
--     SET raw_user_meta_data = raw_user_meta_data
--       || '{"role":"super_admin","name":"你的姓名","employee_id":"SA001"}'
--   WHERE email = 'SA001@ext.teacher';
--
-- ② 添加外校普通教师：
--   Email:    T001@ext.teacher
--   Password: T001
--
--   UPDATE auth.users
--     SET raw_user_meta_data = raw_user_meta_data
--       || '{"role":"teacher","name":"张老师","employee_id":"T001","school":"外校名称"}'
--   WHERE email = 'T001@ext.teacher';
--
-- ③ 教师登录方式：
--   打开系统 → 点击右上角"教师入口"
--   输入 姓名（如：张老师）+ 工号（如：T001）→ 登录成功
-- ============================================================

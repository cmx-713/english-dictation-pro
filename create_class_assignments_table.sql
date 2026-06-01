-- 班级作业表
-- 请在 Supabase SQL Editor 中执行此脚本

CREATE TABLE IF NOT EXISTS class_assignments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name   text        NOT NULL,                        -- 班级名称，对应 students.class_name
  material_id  text        NOT NULL,                        -- 关联 dictation_materials.id
  material_title text      NOT NULL,                        -- 冗余存储，方便展示
  due_date     date,                                        -- 截止日期（可选）
  is_active    boolean     NOT NULL DEFAULT true,           -- 是否生效（老师可下架）
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 索引：学生查询时按班级+生效状态筛选
CREATE INDEX IF NOT EXISTS idx_class_assignments_class
  ON class_assignments (class_name, is_active, due_date);

-- RLS + GRANT（Supabase 2026年10月30日后新表必须显式授权）
ALTER TABLE public.class_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_assignments_all" ON public.class_assignments;
CREATE POLICY "class_assignments_all"
  ON public.class_assignments FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT ON public.class_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_assignments TO service_role;

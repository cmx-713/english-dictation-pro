-- 中期能力：待办建议跨设备恢复 + 执行率统计
-- 执行后，系统会把本地待办建议同步到该表（若不执行，不影响现有功能）

CREATE TABLE IF NOT EXISTS suggestion_tasks (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  class_name TEXT,
  retry_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wrong_sentence_count INTEGER NOT NULL DEFAULT 0,
  avg_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_suggestion_tasks_student_number
ON suggestion_tasks(student_number);

CREATE INDEX IF NOT EXISTS idx_suggestion_tasks_status
ON suggestion_tasks(status);

-- RLS + GRANT（Supabase 2026年10月30日后新表必须显式授权）
ALTER TABLE public.suggestion_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suggestion_tasks_all" ON public.suggestion_tasks;
CREATE POLICY "suggestion_tasks_all"
  ON public.suggestion_tasks FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO service_role;

-- 教学建议执行追踪表
-- 请在 Supabase SQL Editor 中执行

CREATE TABLE IF NOT EXISTS teaching_suggestions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name          text        NOT NULL,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  source              text        NOT NULL DEFAULT 'rule',   -- 'rule' | 'llm'
  week_label          text,                                  -- e.g. '2026-W18'
  summary             text        NOT NULL DEFAULT '',
  priority_points     jsonb       NOT NULL DEFAULT '[]',
  classroom_activities jsonb      NOT NULL DEFAULT '[]',
  homework_suggestions jsonb      NOT NULL DEFAULT '[]',

  -- 执行状态
  status              text        NOT NULL DEFAULT 'generated',  -- 'generated' | 'adopted' | 'ignored'
  adopted_at          timestamptz,
  ignored_at          timestamptz,

  -- 效果追踪：采纳时记录基线，查看效果时写入 followup
  baseline_accuracy   numeric(5,2),   -- 采纳时班级平均正确率
  followup_accuracy   numeric(5,2),   -- 效果检查时班级平均正确率
  effect_checked_at   timestamptz,
  accuracy_delta      numeric(5,2)    -- followup - baseline，正数=进步
);

-- 按班级 + 时间倒序查询
CREATE INDEX IF NOT EXISTS idx_teaching_suggestions_class
  ON teaching_suggestions (class_name, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_suggestions_status
  ON teaching_suggestions (status, adopted_at DESC);

-- RLS：全开放（教师端内部使用）
ALTER TABLE public.teaching_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teaching_suggestions_all" ON public.teaching_suggestions;
CREATE POLICY "teaching_suggestions_all"
ON public.teaching_suggestions FOR ALL USING (true) WITH CHECK (true);

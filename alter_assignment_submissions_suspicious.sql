-- 给 assignment_submissions 添加可疑提交标记字段
-- 请在 Supabase SQL Editor 中执行

ALTER TABLE assignment_submissions
ADD COLUMN IF NOT EXISTS is_suspicious   boolean,
ADD COLUMN IF NOT EXISTS suspicious_reasons jsonb,   -- ["pasted","tooFewKeys","tooFast"] 等
ADD COLUMN IF NOT EXISTS pasted_count    integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS suspicious_sentence_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_is_suspicious
  ON assignment_submissions (is_suspicious);

-- Step 1: 扩展 class_assignments 字段（智能体演进所需）
-- 不破坏现有功能，全部使用 IF NOT EXISTS

ALTER TABLE class_assignments
ADD COLUMN IF NOT EXISTS target_error_focus text,     -- A/B/C/D（错因聚焦）
ADD COLUMN IF NOT EXISTS target_difficulty text,      -- beginner/intermediate/advanced
ADD COLUMN IF NOT EXISTS strategy_source text NOT NULL DEFAULT 'manual'; -- manual/rule/llm

-- 可选约束（如果后续值不规范，可先不加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_class_assignments_strategy_source'
  ) THEN
    ALTER TABLE class_assignments
    ADD CONSTRAINT chk_class_assignments_strategy_source
    CHECK (strategy_source IN ('manual', 'rule', 'llm'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_class_assignments_strategy
  ON class_assignments (strategy_source, target_error_focus, target_difficulty);

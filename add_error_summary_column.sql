-- Step B 最小改动：为 practice_records 增加结构化错误信号字段
-- 只新增字段，不改现有逻辑

ALTER TABLE practice_records
ADD COLUMN IF NOT EXISTS error_summary JSONB;

COMMENT ON COLUMN practice_records.error_summary IS '结构化错误统计信号（总错误、分类计数、子类计数）';

-- 验证
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'practice_records'
  AND column_name = 'error_summary';

-- Step 1: 作业提交记录表
-- 作用：记录学生对班级作业的完成情况，供教师端执行率统计使用

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     uuid        NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  student_name      text        NOT NULL,
  student_number    text,
  class_name        text        NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  accuracy_rate     numeric(5,2),
  total_sentences   integer,
  perfect_sentences integer,
  total_words       integer,
  raw_text          text,
  results           jsonb,
  source_record_id  uuid
);

-- 同一学生同一作业默认保留一条“当前记录”（后续可改为保留最新/最高分策略）
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_submission_once
  ON assignment_submissions (assignment_id, student_name);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id
  ON assignment_submissions (assignment_id);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_class_name
  ON assignment_submissions (class_name);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_submitted_at
  ON assignment_submissions (submitted_at DESC);

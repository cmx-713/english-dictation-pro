-- Step 1: 作业统计视图
-- 依赖：class_assignments + assignment_submissions

-- 视图1：作业执行汇总（assignment_completion_stats）
CREATE OR REPLACE VIEW assignment_completion_stats AS
WITH ass AS (
  SELECT
    a.id,
    a.class_name,
    a.material_title,
    a.due_date,
    a.is_active,
    a.created_at,
    a.target_error_focus,
    a.target_difficulty,
    a.strategy_source,
    COALESCE(cs.student_count, 0) AS class_student_count
  FROM class_assignments a
  LEFT JOIN class_stats cs ON cs.class_name = a.class_name
),
sub AS (
  SELECT
    s.assignment_id,
    COUNT(*) AS submitted_count,
    ROUND(AVG(s.accuracy_rate), 1) AS avg_accuracy
  FROM assignment_submissions s
  GROUP BY s.assignment_id
)
SELECT
  ass.id AS assignment_id,
  ass.class_name,
  ass.material_title,
  ass.due_date,
  ass.is_active,
  ass.created_at,
  ass.target_error_focus,
  ass.target_difficulty,
  ass.strategy_source,
  ass.class_student_count,
  COALESCE(sub.submitted_count, 0) AS submitted_count,
  GREATEST(ass.class_student_count - COALESCE(sub.submitted_count, 0), 0) AS pending_count,
  CASE
    WHEN ass.class_student_count > 0
    THEN ROUND(COALESCE(sub.submitted_count, 0)::numeric * 100 / ass.class_student_count, 1)
    ELSE 0
  END AS completion_rate,
  CASE
    WHEN ass.due_date IS NOT NULL AND ass.due_date < CURRENT_DATE
    THEN GREATEST(ass.class_student_count - COALESCE(sub.submitted_count, 0), 0)
    ELSE 0
  END AS overdue_count,
  sub.avg_accuracy
FROM ass
LEFT JOIN sub ON sub.assignment_id = ass.id
ORDER BY ass.created_at DESC;

-- 视图2：学生作业进度明细（assignment_student_progress）
CREATE OR REPLACE VIEW assignment_student_progress AS
SELECT
  a.id AS assignment_id,
  a.class_name,
  a.material_title,
  a.due_date,
  s.student_name,
  s.student_number,
  s.submitted_at,
  s.accuracy_rate,
  CASE
    WHEN s.id IS NOT NULL THEN 'submitted'
    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END AS status
FROM class_assignments a
LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
ORDER BY a.created_at DESC, s.submitted_at DESC NULLS LAST;

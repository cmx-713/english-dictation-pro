
-- Update student_summary view to include student_number
DROP VIEW IF EXISTS student_summary;

CREATE OR REPLACE VIEW student_summary AS
SELECT 
  s.student_number,
  pr.student_name,
  pr.class_name,
  COUNT(*) as total_practices,
  ROUND(AVG(pr.accuracy_rate), 1) as avg_accuracy,
  SUM(pr.total_words) as total_words_practiced,
  SUM(pr.perfect_sentences) as perfect_sentence_count,
  MAX(pr.created_at) as last_practice_date,
  -- Recent 7 days
  COUNT(CASE WHEN pr.created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_practices,
  MAX(pr.accuracy_rate) as best_accuracy,
  MIN(pr.accuracy_rate) as worst_accuracy
FROM practice_records pr
LEFT JOIN students s ON NULLIF(pr.student_id, '')::uuid = s.id
WHERE pr.student_name IS NOT NULL
GROUP BY s.student_number, pr.student_name, pr.class_name
ORDER BY avg_accuracy DESC;

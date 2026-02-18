-- ============================================
-- 修复正确率数据脚本
-- ============================================
-- 
-- 问题：之前的数据中 accuracy_rate 是 0-1000 的值
-- 原因：score 返回的是 0-100 而不是 0-10
-- 解决：清理所有错误数据，从现在开始保存正确的数据
--
-- ============================================

-- 方案 1: 删除所有错误数据（推荐，简单直接）
-- ============================================

-- 删除 accuracy_rate > 100 的异常记录
DELETE FROM practice_records 
WHERE accuracy_rate > 100;

-- 查看剩余记录数
SELECT COUNT(*) as remaining_records FROM practice_records;

-- ============================================
-- 方案 2: 修正错误数据（如果想保留历史记录）
-- ============================================

-- 如果 accuracy_rate > 100，除以 10 进行修正
-- 注意：这只是估算，不保证完全准确
/*
UPDATE practice_records 
SET accuracy_rate = ROUND(accuracy_rate / 10, 1)
WHERE accuracy_rate > 100;

-- 确保不超过 100
UPDATE practice_records 
SET accuracy_rate = 100
WHERE accuracy_rate > 100;
*/

-- ============================================
-- 验证修复结果
-- ============================================

-- 检查 accuracy_rate 范围
SELECT 
  MIN(accuracy_rate) as min_accuracy,
  MAX(accuracy_rate) as max_accuracy,
  AVG(accuracy_rate) as avg_accuracy
FROM practice_records;

-- 查看学生摘要（应该显示正常的百分比）
SELECT * FROM student_summary;

-- 查看班级统计（应该显示正常的百分比）
SELECT * FROM class_stats;

-- ============================================
-- 说明
-- ============================================
--
-- 修复后：
-- 1. 旧的错误数据已清除
-- 2. 新的练习会保存正确的 0-100 百分比
-- 3. 视图会自动显示正确的平均值
--
-- 如果删除后没有数据：
-- - 让学生重新完成几次练习
-- - 新数据会正确保存
-- - 教师后台会显示正确的统计
--
-- ============================================

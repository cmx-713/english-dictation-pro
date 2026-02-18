
-- ============================================
-- 批量添加听力素材脚本
-- 使用说明：
-- 1. 复制下方的 SQL 语句
-- 2. 修改 VALUES 中的内容（标题、内容、分类、难度）
-- 3. 在 Supabase SQL Editor 中运行
-- ============================================

INSERT INTO dictation_materials (title, content, category, difficulty_level, word_count, source)
VALUES 
-- 第 1 篇文章
(
  'Digital Nomads', -- 标题
  'Digital nomads are people who use telecommunications technologies to earn a living and, more generally, conduct their life in a nomadic manner. Such workers often work remotely from foreign countries, coffee shops, public libraries, co-working spaces, or recreational vehicles.', -- 内容
  'Lifestyle', -- 分类 (建议: Daily News, Technology, Culture, Business)
  'intermediate', -- 难度 (beginner, intermediate, advanced, master)
  38, -- 单词数 (可选，不填也可以)
  'Wikipedia' -- 来源 (可选)
),

-- 第 2 篇文章 (复制这一段来添加更多)
(
  'The Importance of Sleep',
  'Sleep is essential for good health. In fact, we need sleep just as much as we need food and water. Lack of sleep can cause a number of health problems, including obesity, heart disease, and diabetes. It is recommended that adults get at least seven hours of sleep per night.',
  'Health',
  'beginner',
  46,
  'Healthline'
);

-- 提示：
-- category (分类) 可以是任意自定义的文本，如：CNN News, IELTS, TOEFL 等
-- difficulty_level (难度) 建议使用：beginner (初级), intermediate (中级), advanced (高级), master (大师)

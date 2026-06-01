-- ============================================================
-- grant_all_permissions.sql
-- 英语听写系统 — 一键授权脚本
-- ============================================================
-- 背景：Supabase 从 2026年10月30日起，所有项目的新建表
--       必须有显式 GRANT，supabase-js / PostgREST 才能访问。
--       现有表在此日期后也适用。
--
-- 使用方法：
--   在 Supabase Dashboard → SQL Editor 中执行本文件，
--   即可为所有表和视图补全权限。
-- ============================================================

-- ------------------------------------------------------------
-- 1. practice_records（核心练习记录表）
-- ------------------------------------------------------------
GRANT SELECT, INSERT ON public.practice_records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_records TO service_role;

-- ------------------------------------------------------------
-- 2. students（学生信息表）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.students TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO service_role;

-- ------------------------------------------------------------
-- 3. dictation_materials（听写素材库）
-- ------------------------------------------------------------
GRANT SELECT, INSERT ON public.dictation_materials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictation_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictation_materials TO service_role;

-- ------------------------------------------------------------
-- 4. class_assignments（班级作业表）
-- ------------------------------------------------------------
GRANT SELECT ON public.class_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_assignments TO service_role;

-- ------------------------------------------------------------
-- 5. assignment_submissions（作业提交记录）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.assignment_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO service_role;

-- ------------------------------------------------------------
-- 6. teaching_suggestions（教学建议表）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teaching_suggestions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teaching_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teaching_suggestions TO service_role;

-- ------------------------------------------------------------
-- 7. suggestion_tasks（学习建议任务表）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_tasks TO service_role;

-- ------------------------------------------------------------
-- 8. tts_audio_cache（TTS 音频缓存表）
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.tts_audio_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tts_audio_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tts_audio_cache TO service_role;

-- ------------------------------------------------------------
-- 9. 可选表（仅在已执行 supabase_schema_update.sql 方案2时需要）
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'text_library') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_library TO anon, authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_progress') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_progress TO anon, authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_details') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_details TO anon, authenticated, service_role';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 10. 视图（所有视图授予 SELECT 权限）
-- ------------------------------------------------------------
DO $$
DECLARE
  v TEXT;
  views TEXT[] := ARRAY[
    'student_summary',
    'class_stats',
    'daily_stats',
    'difficulty_stats',
    'input_method_stats',
    'assignment_completion_stats',
    'assignment_student_progress',
    'daily_practice_stats',
    'student_performance_summary',
    'difficulty_analysis',
    'time_pattern_analysis'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = v
    ) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated, service_role', v);
      RAISE NOTICE '✅ GRANT SELECT ON view: %', v;
    ELSE
      RAISE NOTICE '⏭  视图不存在，跳过: %', v;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 完成提示
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '🎉 grant_all_permissions.sql 执行完成！';
  RAISE NOTICE '所有表和视图的 Data API 权限已授予 anon / authenticated / service_role。';
  RAISE NOTICE '如遇 42501 错误，请检查对应表是否在上方列表中。';
END $$;

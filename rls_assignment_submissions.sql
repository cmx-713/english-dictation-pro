-- assignment_submissions 表 RLS 策略
-- 请在 Supabase SQL Editor 中执行

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignment_submissions_select_all" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_insert_all" ON public.assignment_submissions;
DROP POLICY IF EXISTS "assignment_submissions_update_all" ON public.assignment_submissions;

CREATE POLICY "assignment_submissions_select_all"
ON public.assignment_submissions FOR SELECT USING (true);

CREATE POLICY "assignment_submissions_insert_all"
ON public.assignment_submissions FOR INSERT WITH CHECK (true);

CREATE POLICY "assignment_submissions_update_all"
ON public.assignment_submissions FOR UPDATE USING (true) WITH CHECK (true);

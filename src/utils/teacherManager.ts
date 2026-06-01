import { supabase } from '../lib/supabase';

export interface TeacherInfo {
  id: string;
  name: string;
  school: string;
  role: 'teacher' | 'super_admin';
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-teachers`;

async function callAdmin(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登录，请重新登录教师端');

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...params }),
  });

  const result = await res.json() as { error?: string };
  if (!res.ok) throw new Error(result.error || `请求失败 (${res.status})`);
  return result;
}

/** 创建教师账号 */
export const createTeacher = async (
  name: string,
  school: string,
  password: string
): Promise<TeacherInfo> => {
  const result = await callAdmin('create', { name, school, password }) as { user: { id: string; email: string; user_metadata: Record<string, string>; created_at: string; last_sign_in_at: string | null } };
  const u = result.user;
  return {
    id: u.id,
    name: u.user_metadata?.name || name,
    school: u.user_metadata?.school || school,
    role: 'teacher',
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  };
};

/** 列出所有教师账号 */
export const listTeachers = async (): Promise<TeacherInfo[]> => {
  const result = await callAdmin('list') as { teachers: TeacherInfo[] };
  return result.teachers;
};

/** 删除教师账号 */
export const deleteTeacher = async (userId: string): Promise<void> => {
  await callAdmin('delete', { userId });
};

/** 重置教师密码 */
export const resetTeacherPassword = async (userId: string, password: string): Promise<void> => {
  await callAdmin('reset-password', { userId, password });
};

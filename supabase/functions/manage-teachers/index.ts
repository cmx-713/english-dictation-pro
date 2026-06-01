/**
 * Supabase Edge Function: manage-teachers
 * 超级管理员专用：创建/列出/删除教师账号，重置密码。
 * 使用 SUPABASE_SERVICE_ROLE_KEY 执行 Admin API，前端不持有密钥。
 *
 * 请求体（JSON）：
 *   { action: 'create' | 'list' | 'delete' | 'reset-password', ...params }
 *
 * create 参数：    { name: string, school: string, password: string }
 * delete 参数：    { userId: string }
 * reset-password：{ userId: string, password: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * 将教师姓名转为 ASCII 安全的虚拟邮箱。
 * 中文姓名通过 UTF-8 hex 编码，确保邮箱格式合法。
 * 登录时用相同逻辑反向推导，无需额外数据库查询。
 * 示例："张新" → "t_e5bca0e696b0@ext.teacher"
 */
function nameToEmail(name: string): string {
  const bytes = new TextEncoder().encode(name.trim());
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t_${hex}@ext.teacher`;
}

serve(async (req) => {
  // 处理 CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // 1. 验证调用者身份（必须持有有效 JWT）
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
  if (authError || !caller) return json({ error: 'Unauthorized' }, 401);

  // 2. 验证必须是 super_admin
  const role = caller.user_metadata?.role;
  if (role !== 'super_admin') return json({ error: 'Forbidden: super_admin only' }, 403);

  // 3. Admin 客户端（持有 service_role key，仅在服务端使用）
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const body = await req.json();
  const { action } = body;

  // ── 创建教师账号 ─────────────────────────────────────────────
  if (action === 'create') {
    const { name, school, password } = body as { name: string; school: string; password: string };
    if (!name?.trim() || !password?.trim()) {
      return json({ error: '姓名和密码不能为空' }, 400);
    }

    const email = nameToEmail(name);

    // 检查是否已存在
    const { data: existing } = await admin.auth.admin.listUsers();
    const dup = existing?.users?.find(u => u.email === email);
    if (dup) return json({ error: `教师"${name}"已存在，请确认姓名是否重复` }, 409);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,           // 无需邮件确认，直接激活
      user_metadata: {
        role: 'teacher',
        name: name.trim(),
        school: school?.trim() || '',
      },
    });

    if (error) return json({ error: error.message }, 400);
    return json({ user: data.user });
  }

  // ── 列出所有教师（含超管，排除普通学生相关用户）────────────────
  if (action === 'list') {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return json({ error: error.message }, 400);

    const teachers = (data.users || [])
      .filter(u => ['teacher', 'super_admin'].includes(u.user_metadata?.role))
      .map(u => ({
        id: u.id,
        name: u.user_metadata?.name || u.email,
        school: u.user_metadata?.school || '',
        role: u.user_metadata?.role,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

    return json({ teachers });
  }

  // ── 删除教师账号 ─────────────────────────────────────────────
  if (action === 'delete') {
    const { userId } = body as { userId: string };
    if (!userId) return json({ error: 'Missing userId' }, 400);

    // 不允许删除自己
    if (userId === caller.id) return json({ error: '不能删除自己的账号' }, 400);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ── 重置教师密码 ─────────────────────────────────────────────
  if (action === 'reset-password') {
    const { userId, password } = body as { userId: string; password: string };
    if (!userId || !password) return json({ error: 'Missing userId or password' }, 400);

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});

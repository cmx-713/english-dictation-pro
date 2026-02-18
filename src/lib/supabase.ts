
import { createClient } from '@supabase/supabase-js';

// 这些环境变量需要在你的 .env.local 文件中设置
// 或者在 Netlify 的后台设置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('缺少 Supabase 环境变量，后台数据保存功能将不可用。');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

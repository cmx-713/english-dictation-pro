import React, { useState } from 'react';
import { GraduationCap, ArrowLeft, LogIn, User, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TeacherLoginScreenProps {
  onBack: () => void;
}

/**
 * 将姓名转为 ASCII 安全的虚拟邮箱（与 Edge Function 保持完全一致）。
 * 示例："张新" → "t_e5bca0e696b0@ext.teacher"
 */
function nameToEmail(name: string): string {
  const bytes = new TextEncoder().encode(name.trim());
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t_${hex}@ext.teacher`;
}

/**
 * 教师登录
 * 使用姓名 + 密码登录，账号由管理员统一分配。
 * 内部规则：Supabase Auth email = nameToEmail(姓名)（UTF-8 hex 编码）
 * 教师登录后可在教师端修改密码。
 */
export const TeacherLoginScreen: React.FC<TeacherLoginScreenProps> = ({ onBack }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('请输入姓名'); return; }
    if (!password) { setError('请输入密码'); return; }

    setLoading(true);
    setError('');

    // 优先尝试十六进制格式（新账号），失败则回退到旧格式（早期手动创建的账号）
    const hexEmail = nameToEmail(trimmedName);
    const simpleEmail = `${trimmedName}@ext.teacher`;

    let loginSuccess = false;

    const { error: hexError } = await supabase.auth.signInWithPassword({
      email: hexEmail,
      password,
    });

    if (!hexError) {
      loginSuccess = true;
    } else {
      // 回退：尝试旧格式（兼容早期手动创建的账号）
      const { error: simpleError } = await supabase.auth.signInWithPassword({
        email: simpleEmail,
        password,
      });
      if (!simpleError) loginSuccess = true;
    }

    setLoading(false);

    if (!loginSuccess) {
      setError('姓名或密码错误，请联系管理员确认账号');
    }
    // 登录成功 → App.tsx 中 onAuthStateChange 自动更新 session
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="max-w-sm mx-auto mt-12 px-4">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        返回首页
      </button>

      {/* 页头 */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100">
          <GraduationCap className="text-white" size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">教师登录</h2>
        <p className="text-slate-500 mt-2 text-sm">使用管理员分配的账号登录</p>
      </div>

      {/* 表单卡片 */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
        {/* 姓名 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            姓名 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="请输入你的姓名"
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 placeholder-slate-400"
            />
          </div>
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            密码 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 placeholder-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 登录按钮 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          {loading ? (
            <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <LogIn size={18} />
          )}
          {loading ? '登录中...' : '登录教师端'}
        </button>

        <p className="text-xs text-slate-400 text-center">
          账号由管理员创建，登录后可在教师端修改密码
        </p>
      </div>
    </div>
  );
};

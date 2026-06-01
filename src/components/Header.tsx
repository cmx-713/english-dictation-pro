import React from 'react';
import { Headphones, Sparkles, Home, History, LogIn, LogOut, User, GraduationCap, Shield } from 'lucide-react';

interface HeaderProps {
  onRestart: () => void;
  onViewHistory: () => void;
  studentIdentity: { name: string; number: string; className: string } | null;
  onLogin: () => void;
  onLogout: () => void;
  teacherInfo?: { email: string; name: string; isSuperAdmin: boolean } | null;
  onTeacherLogin?: () => void;
  onTeacherLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onRestart,
  onViewHistory,
  studentIdentity,
  onLogin,
  onLogout,
  teacherInfo,
  onTeacherLogin,
  onTeacherLogout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        {/* 左侧 Logo */}
        <div className="flex items-center gap-4 cursor-pointer group" onClick={onRestart}>
          <div className="relative">
            <div className="w-11 h-11 bg-blue-700 rounded-xl flex items-center justify-center shadow-md transform transition-transform group-hover:scale-110">
              <Headphones className="text-white" size={22} />
            </div>
            <div className="absolute -top-1 -right-1">
              <Sparkles className="text-yellow-400 fill-current" size={14} />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">英语听写练习系统</h1>
            <p className="text-xs text-slate-500 font-medium">AI智能听力训练平台</p>
          </div>
        </div>

        {/* 右侧按钮区域 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onViewHistory}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
          >
            <History size={18} />
            练习记录
          </button>

          <button
            onClick={onRestart}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-all shadow-sm"
          >
            <Home size={18} />
            首页
          </button>

          {/* 登录态切换：教师优先，其次学生，最后未登录 */}
          {teacherInfo ? (
            // ── 教师已登录 ──────────────────────────────────────
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg ${
                teacherInfo.isSuperAdmin
                  ? 'bg-purple-50 border-purple-100'
                  : 'bg-emerald-50 border-emerald-100'
              }`}>
                {teacherInfo.isSuperAdmin
                  ? <Shield size={15} className="text-purple-600 shrink-0" />
                  : <GraduationCap size={15} className="text-emerald-600 shrink-0" />
                }
                <span className={`text-sm font-semibold max-w-[7rem] truncate ${
                  teacherInfo.isSuperAdmin ? 'text-purple-800' : 'text-emerald-800'
                }`}>
                  {teacherInfo.name}
                </span>
                <span className={`text-xs hidden sm:inline ${
                  teacherInfo.isSuperAdmin ? 'text-purple-500' : 'text-emerald-500'
                }`}>
                  · {teacherInfo.isSuperAdmin ? '超级管理员' : '教师'}
                </span>
              </div>
              <button
                onClick={onTeacherLogout}
                title="退出教师登录"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          ) : studentIdentity ? (
            // ── 学生已登录 ──────────────────────────────────────
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                <User size={15} className="text-blue-600 shrink-0" />
                <span className="text-sm font-semibold text-blue-800 max-w-[7rem] truncate">
                  {studentIdentity.name}
                </span>
                <span className="text-xs text-blue-500 hidden sm:inline">
                  · {studentIdentity.className}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="退出登录"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          ) : (
            // ── 未登录 ──────────────────────────────────────────
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <button
                onClick={onLogin}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm"
              >
                <LogIn size={16} />
                学生登录
              </button>
              <button
                onClick={onTeacherLogin}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-lg transition-all"
                title="教师/管理员登录"
              >
                <GraduationCap size={16} />
                <span className="hidden sm:inline">教师入口</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

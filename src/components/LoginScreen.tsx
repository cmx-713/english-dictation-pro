import React, { useState, useEffect } from 'react';
import { Check, LogIn, ArrowLeft, Loader2 } from 'lucide-react';
import { normalizeClassName } from '../utils/classNameNormalizer';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  onLoginSuccess: (name: string, number: string, className: string) => void;
  onBack: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onBack }) => {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('student_name') || ''; } catch { return ''; }
  });
  const [number, setNumber] = useState(() => {
    try { return localStorage.getItem('student_number') || ''; } catch { return ''; }
  });
  const [className, setClassName] = useState(() => {
    try { return localStorage.getItem('student_class') || ''; } catch { return ''; }
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 动态加载班级列表
  const [classList, setClassList] = useState<string[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        // 优先用公开视图（执行 fix_materials_rls.sql 后生效）
        const { data: viewData, error: viewError } = await supabase
          .from('public_class_names')
          .select('class_name');

        if (!viewError && viewData && viewData.length > 0) {
          setClassList(viewData.map((r: { class_name: string }) => r.class_name).filter(Boolean));
          return;
        }

        // 降级：直接从 students 表读（依赖 anon RLS 策略）
        const { data: studentData } = await supabase
          .from('students')
          .select('class_name')
          .not('class_name', 'is', null);

        if (studentData) {
          const unique = [...new Set(
            studentData
              .map((r: { class_name: string | null }) => r.class_name)
              .filter((c): c is string => !!c)
          )].sort();
          setClassList(unique);
        }
      } catch (e) {
        console.error('加载班级列表失败', e);
      } finally {
        setLoadingClasses(false);
      }
    };
    void loadClasses();
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '请输入姓名';
    if (!number.trim()) errs.number = '请输入学号';
    if (!className.trim()) errs.className = '请选择或输入班级';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const normalizedClass = normalizeClassName(className);
    localStorage.setItem('student_name', name.trim());
    localStorage.setItem('student_number', number.trim());
    localStorage.setItem('student_class', normalizedClass);
    onLoginSuccess(name.trim(), number.trim(), normalizedClass);
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
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-100">
          <LogIn className="text-white" size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">学生登录</h2>
        <p className="text-slate-500 mt-2 text-sm">请填写你的信息，用于记录练习成绩</p>
      </div>

      {/* 表单卡片 */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
        {/* 姓名 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
            onKeyDown={handleKeyDown}
            placeholder="请输入你的姓名"
            autoFocus
            className={`w-full px-4 py-3 rounded-xl border outline-none transition-all text-slate-800 placeholder-slate-400 ${
              errors.name
                ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            }`}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        {/* 学号 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            学号 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={number}
            onChange={e => { setNumber(e.target.value); setErrors(p => ({ ...p, number: '' })); }}
            onKeyDown={handleKeyDown}
            placeholder="请输入你的学号"
            className={`w-full px-4 py-3 rounded-xl border outline-none transition-all text-slate-800 placeholder-slate-400 ${
              errors.number
                ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            }`}
          />
          {errors.number && <p className="mt-1 text-xs text-red-500">{errors.number}</p>}
        </div>

        {/* 班级 — 支持从列表选择，也可手动输入 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            班级 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              list="class-options"
              value={className}
              onChange={e => { setClassName(e.target.value); setErrors(p => ({ ...p, className: '' })); }}
              onKeyDown={handleKeyDown}
              placeholder={loadingClasses ? '正在加载班级列表...' : '选择或输入班级名称'}
              disabled={false}
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-all text-slate-800 placeholder-slate-400 pr-10 ${
                errors.className
                  ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
              }`}
            />
            {loadingClasses && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
          <datalist id="class-options">
            {classList.map(c => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errors.className && <p className="mt-1 text-xs text-red-500">{errors.className}</p>}
          {!loadingClasses && classList.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">已加载 {classList.length} 个班级，可直接输入或从列表选择</p>
          )}
          {!loadingClasses && classList.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">请手动输入班级名称</p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Check size={18} />
          确认登录
        </button>

        <p className="text-xs text-slate-400 text-center">
          你的信息将保存在本地，方便下次自动识别
        </p>
      </div>
    </div>
  );
};

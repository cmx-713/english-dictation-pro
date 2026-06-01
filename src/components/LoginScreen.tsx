import React, { useState } from 'react';
import { Check, LogIn, ArrowLeft } from 'lucide-react';
import { normalizeClassName } from '../utils/classNameNormalizer';

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

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '请输入姓名';
    if (!number.trim()) errs.number = '请输入学号';
    if (!className) errs.className = '请选择班级';
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            班级 <span className="text-red-500">*</span>
          </label>
          <select
            value={className}
            onChange={e => { setClassName(e.target.value); setErrors(p => ({ ...p, className: '' })); }}
            className={`w-full px-4 py-3 rounded-xl border outline-none transition-all bg-white text-slate-800 ${
              errors.className
                ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
            }`}
          >
            <option value="">请选择班级</option>
            <option value="2025级A甲2">2025级A甲2</option>
            <option value="2025级A乙2">2025级A乙2</option>
            <option value="2024级A甲6">2024级A甲6</option>
            <option value="2024级A乙6">2024级A乙6</option>
          </select>
          {errors.className && <p className="mt-1 text-xs text-red-500">{errors.className}</p>}
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

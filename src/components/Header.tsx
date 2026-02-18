import React from 'react';
import { Headphones, Sparkles, Home, History } from 'lucide-react';

interface HeaderProps {
  onRestart: () => void;
  onViewHistory: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onRestart, onViewHistory }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        {/* 左侧 Logo 区域 */}
        <div className="flex items-center gap-4 cursor-pointer group" onClick={onRestart}>
          <div className="relative">
            {/* 修改：背景改为 bg-blue-700 (深蓝色) */}
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

        {/* 右侧 按钮区域 */}
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
        </div>

      </div>
    </header>
  );
};
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Eye, Clock, TrendingUp, Book, Target, CheckCircle } from 'lucide-react';
import { SentenceResult } from './PracticeScreen';

// 定义记录的结构 (需与您的 historyManager 保存的结构一致)
// 如果您的 historyManager 使用的是不同的字段名，请相应调整
interface HistoryRecord {
  id: string;
  timestamp: number; // 或者 string，取决于您存储的是时间戳还是日期字符串
  rawText: string;
  results: SentenceResult[];
}

interface HistoryScreenProps {
  onViewRecord: (text: string, results: SentenceResult[]) => void;
  onBack: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ onViewRecord, onBack }) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  // 加载记录
  useEffect(() => {
    // 假设您的记录保存在 localStorage 的 'dictation_records' 键中
    // 如果您在 utils/historyManager.ts 中使用了不同的键名，请在这里修改
    const saved = localStorage.getItem('dictation_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 按时间倒序排列（最新的在前面）
        setRecords(parsed.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)));
      } catch (e) {
        console.error('Failed to load history records', e);
      }
    }
  }, []);

  // 删除单条记录
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发点击卡片的查看事件
    if (confirm('确定要删除这条练习记录吗？')) {
      const newRecords = records.filter(r => r.id !== id);
      setRecords(newRecords);
      localStorage.setItem('dictation_records', JSON.stringify(newRecords));
    }
  };

  // 清空所有
  const handleClearAll = () => {
    if (confirm('确定要清空所有历史记录吗？此操作无法撤销。')) {
      setRecords([]);
      localStorage.removeItem('dictation_records');
    }
  };

  // --- 统计数据计算 ---
  const totalPractices = records.length;
  
  const avgAccuracy = records.length > 0
    ? Math.round(records.reduce((acc, r) => {
        // 计算每条记录的平均正确率
        const recordAvg = r.results.reduce((sum, res) => sum + res.accuracy, 0) / (r.results.length || 1);
        return acc + recordAvg;
      }, 0) / records.length)
    : 0;

  const totalWords = records.reduce((acc, r) => {
      // 估算单词数 (根据 rawText 空格分割)
      return acc + (r.rawText ? r.rawText.trim().split(/\s+/).length : 0);
  }, 0);

  const totalSentences = records.reduce((acc, r) => acc + (r.results ? r.results.length : 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:bg-slate-50 transition-colors">
             <ArrowLeft size={18} />
          </div>
          <span className="font-bold text-lg">返回</span>
        </button>
        
        <h1 className="text-2xl font-bold text-slate-900">练习记录</h1>
        
        <button
            onClick={handleClearAll}
            disabled={records.length === 0}
            className="flex items-center gap-2 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
            <Trash2 size={16} />
            清空全部
        </button>
      </div>

      {/* 统计卡片区域 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard 
            icon={<Clock className="text-blue-600" size={24} />} 
            label="练习次数" 
            value={totalPractices} 
            bg="bg-blue-50" 
            border="border-blue-100" 
            textColor="text-blue-900"
        />
        <StatCard 
            icon={<TrendingUp className="text-emerald-600" size={24} />} 
            label="平均正确率" 
            value={`${avgAccuracy}%`} 
            bg="bg-emerald-50" 
            border="border-emerald-100" 
            textColor="text-emerald-900"
        />
        <StatCard 
            icon={<Book className="text-purple-600" size={24} />} 
            label="累计单词数" 
            value={totalWords} 
            bg="bg-purple-50" 
            border="border-purple-100" 
            textColor="text-purple-900"
        />
        <StatCard 
            icon={<Target className="text-orange-600" size={24} />} 
            label="累计句子数" 
            value={totalSentences} 
            bg="bg-orange-50" 
            border="border-orange-100" 
            textColor="text-orange-900"
        />
      </div>

      {/* 记录列表 */}
      <div className="space-y-4">
        {records.map(record => {
            // 计算单条记录的统计信息
            const recordAvg = Math.round(record.results.reduce((sum, r) => sum + r.accuracy, 0) / (record.results.length || 1));
            const perfectCount = record.results.filter(r => r.accuracy === 100).length;
            const dateStr = new Date(record.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

            return (
                <div
                    key={record.id}
                    // 修改重点：点击整个卡片也可以触发查看详情
                    onClick={() => onViewRecord(record.rawText, record.results)}
                    className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group relative overflow-hidden"
                >
                    {/* 底部进度条装饰 */}
                    <div 
                        className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${recordAvg >= 90 ? 'bg-emerald-500' : recordAvg >= 60 ? 'bg-orange-400' : 'bg-red-400'}`} 
                        style={{ width: `${recordAvg}%` }}
                    />

                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 text-sm text-slate-500">
                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600">
                                <Clock size={14} />
                                <span className="font-mono">{dateStr}</span>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                recordAvg >= 90 ? 'bg-emerald-100 text-emerald-700' : 
                                recordAvg >= 60 ? 'bg-orange-100 text-orange-700' : 
                                'bg-red-100 text-red-700'
                            }`}>
                                正确率: {recordAvg}%
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <button
                                // 修改重点：点击眼睛按钮查看详情
                                onClick={(e) => { e.stopPropagation(); onViewRecord(record.rawText, record.results); }}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="查看详情"
                            >
                                <Eye size={18} />
                            </button>
                            <button
                                onClick={(e) => handleDelete(record.id, e)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="删除记录"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>

                    <p className="text-slate-800 mb-4 line-clamp-2 text-base leading-relaxed font-serif pr-10">
                        {record.rawText}
                    </p>

                    <div className="flex items-center gap-6 text-xs font-medium text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <Target size={14} />
                            句子: {record.results.length}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Book size={14} />
                            单词: {record.rawText.split(' ').length}
                        </div>
                         <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle size={14} />
                            完美: {perfectCount}
                        </div>
                    </div>
                </div>
            );
        })}

        {records.length === 0 && (
            <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-slate-300">
                    <Book size={32} />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">还没有练习记录</h3>
                <p className="text-slate-500 text-sm">完成第一次听写练习后，记录会显示在这里</p>
                <button 
                    onClick={onBack}
                    className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                    去练习
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

// 简单的统计卡片组件
const StatCard = ({ icon, label, value, bg, border, textColor }: any) => (
    <div className={`${bg} border ${border} rounded-xl p-5 flex flex-col justify-between h-32 hover:shadow-sm transition-shadow`}>
        <div className="flex justify-between items-start">
            <div className={`p-2 bg-white rounded-lg shadow-sm`}>{icon}</div>
        </div>
        <div>
            <div className={`text-3xl font-bold ${textColor} mb-1 tracking-tight`}>{value}</div>
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider opacity-80">{label}</div>
        </div>
    </div>
);
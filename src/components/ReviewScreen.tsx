import React, { useState } from 'react';
import { ArrowLeft, Play, Pause, AlertCircle, CheckCircle } from 'lucide-react';
import { SentenceResult } from './PracticeScreen';

interface ReviewScreenProps {
  results: SentenceResult[];
  onBack: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ results, onBack }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const handlePlay = (text: string, id: string) => {
    window.speechSynthesis.cancel();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;

    utterance.onstart = () => setPlayingId(id);
    utterance.onend = () => setPlayingId(null);
    utterance.onerror = () => setPlayingId(null);

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 pb-20">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8 sticky top-0 bg-slate-50 z-10 py-4 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:bg-slate-50 transition-colors">
            <ArrowLeft size={18} />
          </div>
          <span className="font-bold text-lg">返回列表</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">练习详情回顾</h1>
        <div className="w-20"></div> {/* 占位，保持标题居中 */}
      </div>

      {/* 列表区域 */}
      <div className="space-y-6">
        {results.map((item, index) => (
          <div key={item.sentenceId || index} className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${item.accuracy === 100 ? 'border-green-500' : 'border-orange-500'}`}>

            {/* 卡片头部：播放按钮 + 状态标签 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePlay(item.original, item.sentenceId)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${playingId === item.sentenceId
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'
                    }`}
                  title="播放原句"
                >
                  {playingId === item.sentenceId ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                </button>
                <span className="text-sm text-slate-500 font-medium">第 {index + 1} 句</span>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 ${item.accuracy === 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {item.accuracy === 100 ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                正确率: {item.accuracy}%
              </div>
            </div>

            {/* 核心内容：Diff 对比展示 */}
            <div className="p-4 bg-slate-50 rounded-lg text-lg leading-relaxed font-serif mb-4">
              {item.accuracy === 100 ? (
                <span className="text-slate-800">{item.original}</span>
              ) : (
                item.diffs.map((part: any, i: number) => {
                  // 兼容 diff 结构: [type, text]
                  const type = part[0];
                  const text = part[1];
                  // 0: Equal, 1: Insert (漏掉的), -1: Delete (多写的)
                  if (type === 0) {
                    return <span key={i} className="text-slate-800">{text}</span>;
                  } else if (type === 1) {
                    return <span key={i} className="bg-green-200 text-green-800 px-1 rounded mx-0.5 decoration-green-500 decoration-2 underline" title="漏掉的内容">{text}</span>;
                  } else {
                    return <span key={i} className="bg-red-200 text-red-800 px-1 rounded mx-0.5 line-through decoration-red-500" title="多余/错误的内容">{text}</span>;
                  }
                })
              )}
            </div>

            {/* 用户原始输入 (如果有错误才显示) */}
            {item.accuracy < 100 && (
              <div className="text-sm text-slate-500 bg-white border border-slate-100 p-3 rounded-lg">
                <span className="font-semibold text-slate-700">你的输入：</span>
                {item.userAnswer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
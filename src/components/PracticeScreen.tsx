import React, { useState, useEffect } from 'react';
import { Play, Pause, CheckCircle, Eye, EyeOff, MessageSquare, Mic, ArrowLeft, ChevronRight } from 'lucide-react';
import { Sentence, splitTextIntoSentences } from '../utils/textProcessing';
import { DictationCard } from './DictationCard';
import { useSpeech } from '../hooks/useSpeech';
import { DiffResult } from '../utils/diffLogic';
import { isSemanticallyCorrect } from '../utils/textMatcher';
import { AIAssistant } from './AIAssistant';

interface PracticeScreenProps {
  rawText: string;
  onFinish: (results: SentenceResult[]) => void;
  onBack: () => void;
  /** 是否处于作业模式（启用反作弊：禁粘贴、提交前不可看原文） */
  isAssignmentMode?: boolean;
}

export interface SentenceResult {
  sentenceId: string;
  original: string;
  userAnswer: string;
  accuracy: number;
  score: number;
  diffs: any[];
  /** 输入行为元数据（反作弊用） */
  inputMeta?: {
    pasted: boolean;        // 是否触发过粘贴
    typingDurationMs: number; // 从首次输入到提交的耗时
    avgKeyIntervalMs: number | null; // 平均按键间隔
    suspicious: boolean;    // 综合可疑标记
  };
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({ rawText, onFinish, onBack, isAssignmentMode = false }) => {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [results, setResults] = useState<Map<string, SentenceResult>>(new Map());
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(384);


  const { voices, selectedVoice, setSelectedVoice, speak, cancel, isPlaying, isSupported, error } = useSpeech();

  useEffect(() => {
    const s = splitTextIntoSentences(rawText);
    setSentences(s);
  }, [rawText]);

  const handlePlayAll = () => {
    if (isPlaying) {
      cancel();
    } else {
      speak(rawText);
    }
  };

  // ...



  const handleSentenceComplete = (
    id: string,
    input: string,
    diff: DiffResult,
    inputMeta?: SentenceResult['inputMeta']
  ) => {
    const originalSentence = sentences.find(s => s.id === id)?.text || "";
    const isSmartMatch = isSemanticallyCorrect(input, originalSentence);

    const finalAccuracy = isSmartMatch ? 100 : diff.accuracy;
    const finalScore = isSmartMatch ? 10 : diff.score;

    setResults(prev => {
      const newMap = new Map(prev);
      newMap.set(id, {
        sentenceId: id,
        original: originalSentence,
        userAnswer: input,
        accuracy: finalAccuracy,
        score: finalScore,
        diffs: diff.diffs,
        inputMeta,
      });
      return newMap;
    });
  };

  const handleFinish = () => {
    if (results.size < sentences.length) {
      if (!confirm(`还有 ${sentences.length - results.size} 个句子未完成，确定要生成报告吗？`)) {
        return;
      }
    }
    onFinish(Array.from(results.values()));
  };



  const progress = Math.round((results.size / sentences.length) * 100) || 0;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* 主内容区域：保持固定布局，AI 侧栏覆盖显示，不挤压内容 */}
      <div className="max-w-4xl mx-auto pb-20 px-4 transition-all duration-300 ease-in-out">

        {/* 作业模式提示 */}
        {isAssignmentMode && (
          <div className="mt-4 mb-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-800">作业模式 · 已开启专注规则</p>
              <p className="text-amber-700 text-xs mt-0.5">禁止粘贴文本 · 提交前不可查看原文 · 异常输入将被记录</p>
            </div>
          </div>
        )}

        {/* 顶部返回按钮 */}
        <div className="pt-6 mb-2">
          <button
            onClick={() => {
              if (results.size > 0 && !confirm("正在练习中，返回将丢失当前进度，确定要离开吗？")) return;
              onBack();
            }}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 group"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span className="font-bold text-slate-600 group-hover:text-slate-900">重新导入文本</span>
          </button>
        </div>

        {/* 原文显示（作业模式完全禁用 / 自由模式需全部提交后） */}
        {!isAssignmentMode && showOriginalText && sentences.length > 0 && results.size >= sentences.length && (
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-6 mb-6 shadow-sm mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <Eye size={20} className="text-blue-600" />
                完整原文
              </h3>
              <button
                onClick={() => setShowOriginalText(false)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
              >
                <EyeOff size={16} />
                隐藏
              </button>
            </div>
            <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{rawText}</p>
            </div>
          </div>
        )}

        {/* 工具栏 */}
        <div className="bg-white sticky top-20 z-40 shadow-sm rounded-lg p-4 mb-8 flex flex-wrap items-center justify-between gap-4 border border-gray-100 mt-4">
          {/* 语音不支持提示 */}
          {!isSupported && (
            <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
              <p className="text-sm text-red-600">
                ⚠️ {error || '你的浏览器不支持语音朗读功能，请使用 Chrome、Edge 或 Safari 浏览器。'}
              </p>
            </div>
          )}

          {/* 语音列表为空提示 */}
          {isSupported && voices.length === 0 && (
            <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2">
              <p className="text-sm text-yellow-700">
                ⏳ 正在加载语音包，请稍候...
              </p>
            </div>
          )}

          {/* 英文语音包缺失提示 */}
          {isSupported && error && (
            <div className="w-full bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2">
              <p className="text-sm text-orange-700">
                ⚠️ {error}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <h2 className="font-bold text-gray-700">进度: {results.size} / {sentences.length}</h2>
            <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? '停止' : '朗读全文'}
            </button>

            {!isAssignmentMode && (() => {
              const allSubmitted = sentences.length > 0 && results.size >= sentences.length;
              const remaining = Math.max(sentences.length - results.size, 0);
              return (
                <button
                  onClick={() => {
                    if (!allSubmitted) {
                      alert(`📝 请先完成全部听写后再查看原文。\n还剩 ${remaining} 句未提交。`);
                      return;
                    }
                    setShowOriginalText(!showOriginalText);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    allSubmitted
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                  title={allSubmitted ? '' : `完成全部听写后可查看原文（还剩 ${remaining} 句）`}
                >
                  {showOriginalText ? <EyeOff size={18} /> : <Eye size={18} />}
                  {!allSubmitted
                    ? `原文（剩 ${remaining} 句）`
                    : (showOriginalText ? '隐藏' : '原文')}
                </button>
              );
            })()}

            <div className="flex flex-col gap-1 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 font-medium">语速</span>
                <span className="text-xs font-bold text-primary">{speechRate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="2.0"
                step="0.1"
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
            </div>

            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 bg-gray-50 h-10">
              <Mic size={14} className="text-gray-500 ml-1" />
              <select
                className="bg-transparent border-none text-sm w-32 focus:ring-0 text-slate-700 font-medium cursor-pointer"
                onChange={(e) => {
                  const v = voices.find(voice => voice.name === e.target.value);
                  if (v) setSelectedVoice(v);
                }}
                value={selectedVoice?.name || ''}
              >
                {voices.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace('Microsoft', '').replace('Google', '').substring(0, 15)}...
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 听写列表 */}
        <div className="space-y-2">
          {sentences.map((sentence) => (
            <DictationCard
              key={sentence.id}
              sentence={sentence}
              onComplete={handleSentenceComplete}
              speechRate={speechRate}
              voice={selectedVoice}
              autoPlay={false}
              isAssignmentMode={isAssignmentMode}
            />
          ))}
        </div>

        {/* 完成按钮 */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={handleFinish}
            className="px-8 py-3 rounded-full bg-slate-900 text-white font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
          >
            <CheckCircle size={20} />
            结束并生成报告
          </button>
        </div>
      </div>

      {/* 随动悬浮按钮：
         - 默认在右下角 (right-8)
         - 打开 AI 时，自动移动到侧边栏左侧 (right-[400px])
         - 永远可见，充当“开关”
      */}
      <button
        onClick={() => setIsAiOpen(!isAiOpen)}
        className={`fixed bottom-8 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 z-[60] group border-4 border-white/20 ${isAiOpen
          ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl'
          }`}
        style={{ right: isAiOpen ? aiPanelWidth : 32 }}
        title={isAiOpen ? "收起 AI 助教" : "打开 AI 助教"}
      >
        {isAiOpen ? (
          <ChevronRight size={28} />
        ) : (
          <>
            <MessageSquare size={26} className="relative z-10" />
            {/* Removed AI sparkles and ping animation for cleaner look */}
          </>
        )}
      </button>

      {/* AI 助手侧边栏 */}
      <AIAssistant
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        context={rawText}
        panelWidth={aiPanelWidth}
        onPanelWidthChange={setAiPanelWidth}

      />
    </div>
  );
};
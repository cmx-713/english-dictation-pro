import React, { useState, useRef, useEffect } from 'react';
import { Play, Check, RefreshCw, AlertCircle, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sentence } from '../utils/textProcessing';
import { calculateDiff, DiffResult, predictErrorReason } from '../utils/diffLogic';
import { isSemanticallyCorrect } from '../utils/textMatcher';

interface InputMeta {
  pasted: boolean;
  typingDurationMs: number;
  avgKeyIntervalMs: number | null;
  suspicious: boolean;
}

interface DictationCardProps {
  sentence: Sentence;
  onComplete: (sentenceId: string, userInput: string, diffResult: DiffResult, inputMeta?: InputMeta) => void;
  speechRate: number;
  voice: SpeechSynthesisVoice | null;
  autoPlay?: boolean;
  /** 作业模式：禁粘贴 + 检测可疑输入 */
  isAssignmentMode?: boolean;
}

export const DictationCard: React.FC<DictationCardProps> = ({
  sentence,
  onComplete,
  speechRate,
  voice,
  autoPlay,
  isAssignmentMode = false,
}) => {
  const [input, setInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string[]>([]);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0 ~ text.length
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startOffsetRef = useRef(0); // 当前 utterance 起始字符偏移
  const totalLength = sentence.text.length;

  // 反作弊：输入行为追踪
  const pastedRef = useRef(false);
  const firstInputAtRef = useRef<number | null>(null);
  const lastKeyTimeRef = useRef<number | null>(null);
  const keyIntervalsRef = useRef<number[]>([]);
  const [pasteWarning, setPasteWarning] = useState(false);

  // 播放从指定字符位置开始的文本
  const playFromOffset = (offset: number) => {
    window.speechSynthesis.cancel();
    const safeOffset = Math.max(0, Math.min(offset, totalLength - 1));
    const fragment = sentence.text.slice(safeOffset);
    if (!fragment) return;
    const utterance = new SpeechSynthesisUtterance(fragment);
    if (voice) utterance.voice = voice;
    utterance.rate = speechRate;
    startOffsetRef.current = safeOffset;
    setProgress(safeOffset);

    utterance.onstart = () => {
      setIsPlayingLocal(true);
      setIsPaused(false);
    };
    utterance.onboundary = (e) => {
      // charIndex 是相对当前 utterance（fragment）的字符位置
      const abs = startOffsetRef.current + (e.charIndex || 0);
      setProgress(prev => (isDragging ? prev : Math.min(abs, totalLength)));
    };
    utterance.onend = () => {
      setIsPlayingLocal(false);
      setIsPaused(false);
      setProgress(totalLength);
    };
    utterance.onerror = () => {
      setIsPlayingLocal(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handlePlay = () => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlayingLocal(true);
    } else if (isPlayingLocal) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlayingLocal(false);
    } else {
      // 若已播放完，从头开始；否则从当前位置继续
      const startAt = progress >= totalLength ? 0 : progress;
      playFromOffset(startAt);
    }
  };

  // 拖动进度条
  const handleSeek = (newOffset: number) => {
    const wasPlaying = isPlayingLocal || isPaused;
    setProgress(newOffset);
    if (wasPlaying) {
      playFromOffset(newOffset);
    } else {
      window.speechSynthesis.cancel();
      setIsPaused(false);
      startOffsetRef.current = newOffset;
    }
  };

  useEffect(() => {
    if (autoPlay && !isSubmitted) {
      handlePlay();
      inputRef.current?.focus();
    }
  }, [autoPlay]);

  // 卸载或换句时清理
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [sentence.id]);

  // 处理粘贴：作业模式下拦截
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    pastedRef.current = true;
    if (isAssignmentMode) {
      e.preventDefault();
      setPasteWarning(true);
      setTimeout(() => setPasteWarning(false), 2500);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (isAssignmentMode) e.preventDefault();
  };

  // 按键时间间隔统计（用于作弊检测）
  const handleKeyTracking = (e: React.KeyboardEvent) => {
    // 仅记录"内容输入类"按键
    const isContentKey = e.key.length === 1 || e.key === 'Backspace' || e.key === ' ';
    if (!isContentKey) return;
    const now = performance.now();
    if (firstInputAtRef.current === null) firstInputAtRef.current = now;
    if (lastKeyTimeRef.current !== null) {
      const interval = now - lastKeyTimeRef.current;
      if (interval > 0 && interval < 5000) {
        keyIntervalsRef.current.push(interval);
      }
    }
    lastKeyTimeRef.current = now;
  };

  const buildInputMeta = (): InputMeta => {
    const now = performance.now();
    const typingDurationMs = firstInputAtRef.current != null ? now - firstInputAtRef.current : 0;
    const intervals = keyIntervalsRef.current;
    const avg = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
    // 可疑判定：触发过粘贴 / 击键太少（直接整段出现）/ 平均间隔过短
    const expectedKeys = Math.max(1, Math.floor(input.length * 0.6)); // 至少应有 60% 字符量级的按键
    const tooFewKeys = input.length > 8 && intervals.length < expectedKeys * 0.3;
    const tooFast = avg !== null && avg < 25 && input.length > 8; // 25ms 以下平均间隔显著异常
    const suspicious = pastedRef.current || tooFewKeys || tooFast;
    return {
      pasted: pastedRef.current,
      typingDurationMs: Math.round(typingDurationMs),
      avgKeyIntervalMs: avg !== null ? Math.round(avg) : null,
      suspicious,
    };
  };

  const handleSubmit = () => {
    if (!input.trim()) return;

    const inputMeta = buildInputMeta();

    // 1. 智能比对
    const isSmartMatch = isSemanticallyCorrect(input, sentence.text);

    let finalResult: DiffResult;
    let feedback: string[] = [];

    if (isSmartMatch) {
      finalResult = {
        diffs: [[0, sentence.text]],
        accuracy: 100,
        score: 10,
        errors: []
      };
      feedback = [];
    } else {
      finalResult = calculateDiff(sentence.text, input);
      feedback = predictErrorReason(finalResult.diffs);
    }

    setDiffResult(finalResult);
    setIsSubmitted(true);
    setErrorFeedback(feedback);
    onComplete(sentence.id, input, finalResult, inputMeta);
  };

  const handleRetry = () => {
    setIsSubmitted(false);
    setDiffResult(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    handleKeyTracking(e);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-md p-6 mb-6 border-l-4 ${isSubmitted ? (diffResult?.accuracy === 100 ? 'border-green-500' : 'border-orange-500') : 'border-primary'}`}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500 font-medium">
            {isSubmitted ? "原文与对比" : isPlayingLocal ? "正在播放..." : isPaused ? "已暂停" : "请听写句子"}
          </span>
          {isSubmitted && (
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${diffResult?.accuracy === 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              正确率: {diffResult?.accuracy}%
            </div>
          )}
        </div>

        {/* 播放控制条：播放按钮 + 可拖动进度条 */}
        <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2.5">
          <button
            onClick={handlePlay}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
              isPlayingLocal || isPaused
                ? 'bg-primary text-white shadow-md'
                : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
            }`}
            title={isPlayingLocal ? "暂停" : isPaused ? "继续播放" : "播放句子"}
          >
            {isPlayingLocal ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <input
            type="range"
            min={0}
            max={totalLength}
            step={1}
            value={Math.min(progress, totalLength)}
            onChange={(e) => setProgress(Number(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onMouseUp={(e) => {
              setIsDragging(false);
              handleSeek(Number((e.target as HTMLInputElement).value));
            }}
            onTouchEnd={(e) => {
              setIsDragging(false);
              handleSeek(Number((e.target as HTMLInputElement).value));
            }}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
            title="拖动到任意位置反复听"
          />

          <span className="text-xs text-gray-400 font-mono shrink-0 w-12 text-right">
            {Math.round((progress / Math.max(totalLength, 1)) * 100)}%
          </span>
        </div>
      </div>

      {!isSubmitted ? (
        <div className="space-y-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            placeholder={isAssignmentMode ? "🔒 作业模式：请逐字键入听到的内容（粘贴已禁用）" : "听完句子后，在这里输入..."}
            className="w-full p-4 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none text-lg"
            rows={2}
          />
          {pasteWarning && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5 flex items-center gap-2">
              <AlertCircle size={14} />
              作业模式禁止粘贴，请手动输入。
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Check size={18} />
              提交检查
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg text-lg leading-relaxed font-serif">
            {diffResult?.accuracy === 100 ? (
              <span className="text-gray-800">{sentence.text}</span>
            ) : (
              diffResult?.diffs.map((part, index) => {
                const [type, text] = part;
                if (type === 0) {
                  return <span key={index} className="text-gray-800">{text}</span>;
                } else if (type === 1) {
                  return <span key={index} className="bg-green-200 text-green-800 px-1 rounded mx-0.5 underline decoration-green-500 decoration-2" title="漏掉的内容">{text}</span>;
                } else {
                  return <span key={index} className="bg-red-200 text-red-800 px-1 rounded mx-0.5 line-through decoration-red-500" title="多余的内容">{text}</span>;
                }
              })
            )}
          </div>

          {diffResult && diffResult.accuracy < 100 && (
            <div className="text-sm text-gray-500 mt-2">
              <span className="font-semibold">你的输入：</span> {input}
            </div>
          )}

          {diffResult && diffResult.accuracy < 100 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex gap-3 items-start"
            >
              <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-orange-800 text-sm mb-1">错误分析 & 建议</h4>
                <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                  {errorFeedback.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}



          <div className="flex justify-end pt-2">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 text-gray-500 hover:text-primary transition-colors text-sm font-medium"
            >
              <RefreshCw size={16} />
              重新听写此句
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
import React, { useState, useRef, useEffect } from 'react';
import { Play, Check, RefreshCw, AlertCircle, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sentence } from '../utils/textProcessing';
import { calculateDiff, DiffResult, predictErrorReason } from '../utils/diffLogic';
import { isSemanticallyCorrect } from '../utils/textMatcher';

interface DictationCardProps {
  sentence: Sentence;
  onComplete: (sentenceId: string, userInput: string, diffResult: DiffResult) => void;
  speechRate: number;
  voice: SpeechSynthesisVoice | null;
  autoPlay?: boolean;
}

export const DictationCard: React.FC<DictationCardProps> = ({
  sentence,
  onComplete,
  speechRate,
  voice,
  autoPlay
}) => {
  const [input, setInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string[]>([]);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(sentence.text);
      if (voice) utterance.voice = voice;
      utterance.rate = speechRate;

      utterance.onstart = () => {
        setIsPlayingLocal(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        setIsPlayingLocal(false);
        setIsPaused(false);
      };

      utterance.onerror = () => {
        setIsPlayingLocal(false);
        setIsPaused(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (autoPlay && !isSubmitted) {
      handlePlay();
      inputRef.current?.focus();
    }
  }, [autoPlay]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    // 1. 智能比对
    const isSmartMatch = isSemanticallyCorrect(input, sentence.text);

    let finalResult: DiffResult;
    let feedback: string[] = [];

    if (isSmartMatch) {
      // 2. 满分构造 (修复点：增加了 errors: [])
      finalResult = {
        diffs: [[0, sentence.text]],
        accuracy: 100,
        score: 10,
        errors: [] // <--- 必须补上这个空数组，否则 Build 会报错
      };
      feedback = [];
    } else {
      // 3. 严格比对
      finalResult = calculateDiff(sentence.text, input);
      feedback = predictErrorReason(finalResult.diffs);
    }

    setDiffResult(finalResult);
    setIsSubmitted(true);
    setErrorFeedback(feedback);
    onComplete(sentence.id, input, finalResult);
  };

  const handleRetry = () => {
    setIsSubmitted(false);
    setDiffResult(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlay}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isPlayingLocal || isPaused
              ? 'bg-primary text-white shadow-md'
              : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
              }`}
            title={isPlayingLocal ? "暂停" : isPaused ? "继续播放" : "播放句子"}
          >
            {isPlayingLocal ? (
              <Pause size={20} />
            ) : (
              <Play size={20} className="ml-0.5" />
            )}
          </button>
          <span className="text-sm text-gray-500 font-medium">
            {isSubmitted ? "原文与对比" : isPlayingLocal ? "正在播放..." : isPaused ? "已暂停" : "请听写句子"}
          </span>
        </div>
        {isSubmitted && (
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${diffResult?.accuracy === 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            正确率: {diffResult?.accuracy}%
          </div>
        )}
      </div>

      {!isSubmitted ? (
        <div className="space-y-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="听完句子后，在这里输入..."
            className="w-full p-4 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none text-lg"
            rows={2}
          />
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
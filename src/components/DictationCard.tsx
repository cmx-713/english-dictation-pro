import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Check, RefreshCw, AlertCircle, Pause, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sentence } from '../utils/textProcessing';
import { calculateDiff, DiffResult, FeedbackItem, predictErrorReason } from '../utils/diffLogic';
import { getLlmFeedback } from '../utils/llmFeedback';
import { isSemanticallyCorrect } from '../utils/textMatcher';
import { ensureTtsAudioUrl } from '../utils/ttsAudioCache';

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
  /** 有值时尝试 OpenAI TTS + Supabase 缓存（素材库/作业）；自由粘贴不传 */
  libraryMaterialId?: string | null;
}

type TtsPhase = 'idle' | 'loading' | 'file' | 'speech';

export const DictationCard: React.FC<DictationCardProps> = ({
  sentence,
  onComplete,
  speechRate,
  voice,
  autoPlay,
  isAssignmentMode = false,
  libraryMaterialId = null,
}) => {
  const [input, setInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  /** 统一 0–100，便于与 file/speech 共用进度条 */
  const [progressPct, setProgressPct] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startOffsetRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isDraggingRef = useRef(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsPhase, setTtsPhase] = useState<TtsPhase>(() =>
    libraryMaterialId?.trim() ? 'loading' : 'speech'
  );

  const totalLength = sentence.text.length;

  const pastedRef = useRef(false);
  const firstInputAtRef = useRef<number | null>(null);
  const lastKeyTimeRef = useRef<number | null>(null);
  const keyIntervalsRef = useRef<number[]>([]);
  const [pasteWarning, setPasteWarning] = useState(false);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // 载入 TTS 缓存（仅绑定 material 时）
  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: number | null = null;
    if (!libraryMaterialId?.trim()) {
      console.info('[TTS debug] skip cache: missing libraryMaterialId', {
        sentenceId: sentence.id,
      });
      setAudioUrl(null);
      setTtsPhase('speech');
      return;
    }
    console.info('[TTS debug] start cache lookup', {
      sentenceId: sentence.id,
      libraryMaterialId: libraryMaterialId.trim(),
    });
    setTtsPhase('loading');
    setAudioUrl(null);
    // 30s 兜底：覆盖排队 + 冷启动 + 合成 + Storage 上传的总时长
    fallbackTimer = window.setTimeout(() => {
      if (cancelled) return;
      setTtsPhase('speech');
    }, 30000);
    void ensureTtsAudioUrl({
      sentenceText: sentence.text,
      libraryMaterialId: libraryMaterialId.trim(),
    }).then((url) => {
      if (cancelled) return;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (url) {
        console.info('[TTS debug] cache/audio ready', { sentenceId: sentence.id, hasUrl: true });
        setAudioUrl(url);
        setTtsPhase('file');
      } else {
        console.info('[TTS debug] fallback to speech', { sentenceId: sentence.id, hasUrl: false });
        setTtsPhase('speech');
      }
    });
    return () => {
      cancelled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [sentence.id, sentence.text, libraryMaterialId]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.playbackRate = speechRate;
  }, [speechRate, audioUrl]);

  useEffect(() => {
    setProgressPct(0);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    window.speechSynthesis.cancel();
    setIsPlayingLocal(false);
    setIsPaused(false);
  }, [sentence.id]);

  const playSpeechFromOffsetChars = useCallback(
    (offsetChars: number) => {
      window.speechSynthesis.cancel();
      if (audioUrl && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const safeOffset = totalLength === 0 ? 0 : Math.max(0, Math.min(offsetChars, totalLength - 1));
      const fragment = sentence.text.slice(safeOffset);
      if (!fragment) return;
      const utterance = new SpeechSynthesisUtterance(fragment);
      if (voice) utterance.voice = voice;
      utterance.rate = speechRate;
      startOffsetRef.current = safeOffset;
      setProgressPct(totalLength > 0 ? (safeOffset / totalLength) * 100 : 0);

      utterance.onstart = () => {
        setIsPlayingLocal(true);
        setIsPaused(false);
      };
      utterance.onboundary = (e) => {
        const abs = startOffsetRef.current + (e.charIndex || 0);
        if (!isDraggingRef.current && totalLength > 0) {
          setProgressPct(Math.min(100, (abs / totalLength) * 100));
        }
      };
      utterance.onend = () => {
        setIsPlayingLocal(false);
        setIsPaused(false);
        setProgressPct(100);
      };
      utterance.onerror = () => {
        setIsPlayingLocal(false);
        setIsPaused(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [audioUrl, speechRate, sentence.text, totalLength, voice]
  );

  const toggleFilePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {
        setAudioUrl(null);
        setTtsPhase('speech');
      });
    } else {
      a.pause();
    }
  }, []);

  const handlePlay = () => {
    if (ttsPhase === 'loading') return;

    if (ttsPhase === 'file' && audioUrl) {
      toggleFilePlay();
      return;
    }

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlayingLocal(true);
    } else if (isPlayingLocal) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlayingLocal(false);
    } else {
      const pct = progressPct >= 99.5 ? 0 : progressPct;
      const startChars = totalLength > 0 ? Math.round((pct / 100) * totalLength) : 0;
      playSpeechFromOffsetChars(startChars);
    }
  };

  const applySeek = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setProgressPct(clamped);

    if (ttsPhase === 'file' && audioUrl) {
      const a = audioRef.current;
      if (a && a.duration && Number.isFinite(a.duration)) {
        a.currentTime = (clamped / 100) * a.duration;
      }
      return;
    }

    const wasPlaying = isPlayingLocal || isPaused;
    const offsetChars = totalLength > 0 ? Math.round((clamped / 100) * totalLength) : 0;
    if (wasPlaying) {
      playSpeechFromOffsetChars(offsetChars);
    } else {
      window.speechSynthesis.cancel();
      setIsPaused(false);
      startOffsetRef.current = offsetChars;
    }
  };

  useEffect(() => {
    if (!autoPlay || isSubmitted || ttsPhase === 'loading' || ttsPhase === 'idle') return;
    const t = window.setTimeout(() => {
      if (ttsPhase === 'file' && audioUrl) {
        void audioRef.current?.play();
        inputRef.current?.focus();
      } else if (ttsPhase === 'speech') {
        playSpeechFromOffsetChars(0);
        inputRef.current?.focus();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [autoPlay, isSubmitted, ttsPhase, audioUrl, playSpeechFromOffsetChars]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      audioRef.current?.pause();
    };
  }, [sentence.id]);

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

  const handleKeyTracking = (e: React.KeyboardEvent) => {
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
    const expectedKeys = Math.max(1, Math.floor(input.length * 0.6));
    const tooFewKeys = input.length > 8 && intervals.length < expectedKeys * 0.3;
    const tooFast = avg !== null && avg < 25 && input.length > 8;
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
    const isSmartMatch = isSemanticallyCorrect(input, sentence.text);

    let finalResult: DiffResult;

    if (isSmartMatch) {
      finalResult = {
        diffs: [[0, sentence.text]],
        accuracy: 100,
        score: 10,
        errors: [],
      };
      setDiffResult(finalResult);
      setIsSubmitted(true);
      setErrorFeedback([]);
      onComplete(sentence.id, input, finalResult, inputMeta);
      return;
    }

    finalResult = calculateDiff(sentence.text, input);
    setDiffResult(finalResult);
    setIsSubmitted(true);
    onComplete(sentence.id, input, finalResult, inputMeta);

    // 有错误时异步调用 LLM 生成反馈
    if (finalResult.accuracy < 100) {
      setFeedbackLoading(true);
      setErrorFeedback([]);
      getLlmFeedback(sentence.text, input)
        .then((items) => {
          setErrorFeedback(items);
        })
        .catch(() => {
          // LLM 失败时降级到规则引擎
          setErrorFeedback(predictErrorReason(finalResult.diffs));
        })
        .finally(() => {
          setFeedbackLoading(false);
        });
    }
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
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          className="hidden"
          onPlay={() => {
            setIsPlayingLocal(true);
            setIsPaused(false);
          }}
          onPause={() => setIsPlayingLocal(false)}
          onError={() => {
            setAudioUrl(null);
            setTtsPhase('speech');
            setIsPlayingLocal(false);
          }}
          onEnded={() => {
            setIsPlayingLocal(false);
            setProgressPct(100);
          }}
          onTimeUpdate={() => {
            const a = audioRef.current;
            if (!a?.duration || !Number.isFinite(a.duration) || isDraggingRef.current) return;
            setProgressPct((a.currentTime / a.duration) * 100);
          }}
        />
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 font-medium">
              {isSubmitted ? '原文与对比' : isPlayingLocal ? '正在播放...' : isPaused ? '已暂停' : '请听写句子'}
            </span>
            {ttsPhase === 'file' && !isSubmitted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">HD 音频</span>
            )}
            {ttsPhase === 'loading' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">加载音频…</span>
            )}
          </div>
          {isSubmitted && (
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${diffResult?.accuracy === 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              正确率: {diffResult?.accuracy}%
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2.5">
          <button
            type="button"
            onClick={() => handlePlay()}
            disabled={ttsPhase === 'loading'}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
              ttsPhase === 'loading'
                ? 'bg-gray-100 text-gray-400'
                : isPlayingLocal || isPaused
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
            }`}
            title={isPlayingLocal ? '暂停' : isPaused ? '继续播放' : '播放句子'}
          >
            {ttsPhase === 'loading' ? <Loader2 size={18} className="animate-spin" />
              : isPlayingLocal ? <Pause size={18} />
              : <Play size={18} className="ml-0.5" />}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={Math.min(100, Math.max(0, progressPct))}
            onChange={(e) => {
              const v = Number(e.target.value);
              setProgressPct(v);
              if (ttsPhase === 'file' && audioUrl) {
                const a = audioRef.current;
                if (a?.duration && Number.isFinite(a.duration)) {
                  a.currentTime = (v / 100) * a.duration;
                }
              }
            }}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onMouseUp={(e) => {
              setIsDragging(false);
              applySeek(Number((e.target as HTMLInputElement).value));
            }}
            onTouchEnd={(e) => {
              setIsDragging(false);
              applySeek(Number((e.target as HTMLInputElement).value));
            }}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
            title="拖动到任意位置反复听"
          />

          <span className="text-xs text-gray-400 font-mono shrink-0 w-12 text-right">{Math.round(progressPct)}%</span>
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
            placeholder={isAssignmentMode ? '🔒 作业模式：请逐字键入听到的内容（粘贴已禁用）' : '听完句子后，在这里输入...'}
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
              type="button"
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

          {diffResult && diffResult.accuracy < 100 && feedbackLoading && (
            <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin text-blue-500 shrink-0" />
              AI 正在分析错误原因…
            </div>
          )}

          {diffResult && diffResult.accuracy < 100 && !feedbackLoading && errorFeedback.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {errorFeedback.map((item, i) => (
                <FeedbackCard key={i} item={item} />
              ))}
            </motion.div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
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

// ── 单条反馈卡片 ────────────────────────────────────────────
const PHENOMENON_CONFIG: Record<string, { icon: string; bg: string; border: string; labelColor: string }> = {
  weak_form:          { icon: '🔇', bg: 'bg-blue-50',   border: 'border-blue-200',   labelColor: 'text-blue-700' },
  auxiliary:          { icon: '🔈', bg: 'bg-indigo-50', border: 'border-indigo-200', labelColor: 'text-indigo-700' },
  connected_speech:   { icon: '🔗', bg: 'bg-purple-50', border: 'border-purple-200', labelColor: 'text-purple-700' },
  phonetic_confusion: { icon: '👂', bg: 'bg-amber-50',  border: 'border-amber-200',  labelColor: 'text-amber-700' },
  spelling:           { icon: '✏️', bg: 'bg-yellow-50', border: 'border-yellow-200', labelColor: 'text-yellow-700' },
  chunk_missing:      { icon: '📦', bg: 'bg-orange-50', border: 'border-orange-200', labelColor: 'text-orange-700' },
  extra_word:         { icon: '➕', bg: 'bg-rose-50',   border: 'border-rose-200',   labelColor: 'text-rose-700' },
  general:            { icon: '💬', bg: 'bg-gray-50',   border: 'border-gray-200',   labelColor: 'text-gray-700' },
};

const FeedbackCard: React.FC<{ item: FeedbackItem }> = ({ item }) => {
  const cfg = PHENOMENON_CONFIG[item.phenomenon] ?? PHENOMENON_CONFIG.general;
  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base leading-none">{cfg.icon}</span>
        <span className={`text-xs font-bold uppercase tracking-wide ${cfg.labelColor}`}>{item.label}</span>
        {item.words.length > 0 && (
          <span className="ml-1 flex gap-1 flex-wrap">
            {item.words.map((w, i) => (
              <code key={i} className={`text-xs px-1.5 py-0.5 rounded font-mono ${cfg.bg} border ${cfg.border} ${cfg.labelColor}`}>
                {w}
              </code>
            ))}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700 leading-snug mb-1.5">{item.explanation}</p>
      <div className="flex items-start gap-1.5">
        <span className="text-xs text-gray-400 shrink-0 mt-0.5">💡 怎么听</span>
        <p className="text-xs text-gray-600 leading-snug">{item.tip}</p>
      </div>
    </div>
  );
};

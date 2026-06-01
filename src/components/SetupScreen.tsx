import React, { useState, useEffect, useRef } from 'react';
import { FileText, ArrowRight, Loader2, Mic, Camera, Image, Book, ClipboardList, LogIn } from 'lucide-react';
import { getPendingSuggestionTaskLocal, updatePendingSuggestionTaskStatusLocal, syncSuggestionTaskStatusToSupabase } from '../utils/suggestionTaskManager';
import { supabase } from '../lib/supabase';
import type { DictationDifficulty } from '../utils/textProcessing';
import Tesseract from 'tesseract.js';

interface SetupScreenProps {
  initialText?: string;
  initialLibraryMaterialId?: string | null;
  onOpenLibrary: () => void;
  onStart: (text: string, metadata?: {
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
    assignmentId?: string;
    assignmentTitle?: string;
    libraryMaterialId?: string;
    difficulty?: DictationDifficulty;
  }) => void;
  hasLatestReport?: boolean;
  latestReportAt?: string;
  onViewLatestReport?: () => void;
  /** 当前登录的学生信息（null = 未登录） */
  studentIdentity: { name: string; number: string; className: string } | null;
  /** 导航到登录页 */
  onNavigateToLogin: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({
  onStart,
  onOpenLibrary,
  initialText = '',
  initialLibraryMaterialId = null,
  hasLatestReport = false,
  latestReportAt,
  onViewLatestReport,
  studentIdentity,
  onNavigateToLogin,
}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
      setMode('text');
    }
  }, [initialText]);

  const [mode, setMode] = useState<'text' | 'voice' | 'image'>('text');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // 听写难度（持久化到 localStorage）
  const [difficulty, setDifficulty] = useState<DictationDifficulty>(() => {
    try {
      const saved = localStorage.getItem('dictation_difficulty');
      if (saved === 'easy' || saved === 'normal' || saved === 'hard') return saved;
    } catch { /* ignore */ }
    return 'normal';
  });
  useEffect(() => {
    try { localStorage.setItem('dictation_difficulty', difficulty); } catch { /* ignore */ }
  }, [difficulty]);

  const [pendingTask, setPendingTask] = useState<ReturnType<typeof getPendingSuggestionTaskLocal>>(null);

  // 班级作业
  interface ClassAssignment { id: string; class_name: string; material_id: string; material_title: string; due_date: string | null; }
  interface AssignmentSubmissionStatus { submittedAt: string; accuracyRate: number | null; }
  const [classAssignment, setClassAssignment] = useState<ClassAssignment | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentSubmissionStatus | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [startingAssignment, setStartingAssignment] = useState(false);
  const lastCheckedKeyRef = useRef('');

  // 登录提示弹窗
  const [showLoginWarning, setShowLoginWarning] = useState(false);

  // 每次挂载强制重新检查作业状态
  useEffect(() => {
    lastCheckedKeyRef.current = '';
    setAssignmentStatus(null);
    setClassAssignment(null);
  }, []);

  const loadClassAssignment = async (cls: string, studentName: string) => {
    setAssignmentLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('class_assignments')
        .select('id, class_name, material_id, material_title, due_date')
        .eq('class_name', cls)
        .eq('is_active', true)
        .or(`due_date.is.null,due_date.gte.${today}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setClassAssignment(data);
        if (studentName.trim()) {
          const { data: submitted } = await supabase
            .from('assignment_submissions')
            .select('submitted_at, accuracy_rate')
            .eq('assignment_id', data.id)
            .eq('student_name', studentName.trim())
            .maybeSingle();
          setAssignmentStatus(submitted ? {
            submittedAt: submitted.submitted_at,
            accuracyRate: submitted.accuracy_rate,
          } : null);
        } else {
          setAssignmentStatus(null);
        }
      } else {
        setClassAssignment(null);
        setAssignmentStatus(null);
      }
    } catch {
      setClassAssignment(null);
      setAssignmentStatus(null);
    } finally {
      setAssignmentLoading(false);
    }
  };

  // 学生身份变化时重新检查作业
  useEffect(() => {
    const cls = studentIdentity?.className?.trim() || '';
    const name = studentIdentity?.name?.trim() || '';
    const checkKey = `${cls}__${name}`;

    if (!cls) {
      setAssignmentLoading(false);
      setClassAssignment(null);
      setAssignmentStatus(null);
      lastCheckedKeyRef.current = '';
      return;
    }
    if (lastCheckedKeyRef.current === checkKey) return;
    lastCheckedKeyRef.current = checkKey;
    void loadClassAssignment(cls, name);
  }, [studentIdentity?.className, studentIdentity?.name]);

  // 作业开始
  const handleStartAssignment = async () => {
    if (!classAssignment) return;
    if (!studentIdentity) { setShowLoginWarning(true); return; }
    setStartingAssignment(true);
    try {
      const { data, error } = await supabase
        .from('dictation_materials')
        .select('content')
        .eq('id', classAssignment.material_id)
        .single();
      if (error || !data?.content) { alert('加载素材失败，请稍后重试'); return; }
      onStart(data.content, {
        studentName: studentIdentity.name,
        studentNumber: studentIdentity.number,
        className: studentIdentity.className,
        inputMethod: 'text',
        assignmentId: classAssignment.id,
        assignmentTitle: classAssignment.material_title,
        libraryMaterialId: classAssignment.material_id,
      });
    } catch { alert('加载素材失败'); }
    finally { setStartingAssignment(false); }
  };

  // 待办建议
  useEffect(() => {
    if (!studentIdentity?.number) {
      setPendingTask(null);
      return;
    }
    setPendingTask(getPendingSuggestionTaskLocal(studentIdentity.number));
  }, [studentIdentity?.number]);

  const handleContinuePendingTask = () => {
    if (!pendingTask || !studentIdentity) return;
    updatePendingSuggestionTaskStatusLocal('done');
    void syncSuggestionTaskStatusToSupabase(pendingTask.id, 'done');
    setPendingTask(null);
    onStart(pendingTask.retry_text, {
      studentName: studentIdentity.name,
      studentNumber: studentIdentity.number,
      className: studentIdentity.className,
      inputMethod: 'text',
    });
  };

  const handleDismissPendingTask = () => {
    if (!pendingTask) return;
    updatePendingSuggestionTaskStatusLocal('dismissed');
    void syncSuggestionTaskStatusToSupabase(pendingTask.id, 'dismissed');
    setPendingTask(null);
  };

  // 统一"开始练习"入口，未登录时弹提示
  const startPractice = (
    practiceText: string,
    inputMethod: 'text' | 'voice' | 'image',
    options?: {
      assignmentId?: string;
      assignmentTitle?: string;
      libraryMaterialId?: string;
      difficulty?: DictationDifficulty;
    }
  ) => {
    if (!studentIdentity) {
      setShowLoginWarning(true);
      return;
    }
    onStart(practiceText, {
      studentName: studentIdentity.name,
      studentNumber: studentIdentity.number,
      className: studentIdentity.className,
      inputMethod,
      ...options,
      difficulty: options?.difficulty ?? difficulty,
    });
  };

  // 图片 OCR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件（JPG、PNG等格式）');
      return;
    }
    setIsProcessing(true);
    setProcessingStatus('正在初始化识别引擎...');
    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProcessingStatus(`正在识别文字... ${(m.progress * 100).toFixed(0)}%`);
          } else if (m.status === 'loading tesseract core') {
            setProcessingStatus('正在加载核心组件...');
          } else {
            setProcessingStatus('正在处理图片...');
          }
        }
      });
      const recognizedText = result.data.text;
      if (!recognizedText.trim()) {
        alert('未在图片中识别到清晰的英文，请重试。');
      } else {
        setText(recognizedText);
        setMode('text');
      }
    } catch {
      alert('图片识别失败，请检查网络或重试。');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const [voiceError, setVoiceError] = useState<string | null>(null);

  // 语音识别
  const handleVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('您的浏览器不支持语音识别。请使用 Chrome 浏览器，并确保网络正常。');
      return;
    }
    if (isRecording && recognition) {
      recognition.stop();
      setIsRecording(false);
      return;
    }
    setVoiceError(null);
    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';
    let finalTranscript = '';
    recognizer.onresult = (event: any) => {
      setVoiceError(null);
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) { finalTranscript += transcript + ' '; }
        else { interimTranscript += transcript; }
      }
      setText((finalTranscript + interimTranscript).trim());
    };
    recognizer.onerror = (event: any) => {
      setIsRecording(false);
      const errorMessages: Record<string, string> = {
        'not-allowed': '麦克风权限被拒绝。请点击浏览器地址栏左侧的锁形图标，允许麦克风访问，然后刷新页面重试。',
        'network': '网络连接失败。语音识别需要连接到 Google 服务，请检查网络或使用可访问 Google 的网络环境。',
        'no-speech': '未检测到语音，请靠近麦克风并大声朗读。',
        'audio-capture': '未找到麦克风设备，请检查麦克风是否已连接。',
        'service-not-allowed': '语音识别服务被阻止。请确保页面通过 HTTPS 访问，并使用 Chrome 浏览器。',
        'aborted': '语音识别已中止，请重新点击按钮开始。',
      };
      setVoiceError(errorMessages[event.error] ?? `识别出错（${event.error}），请重试。`);
    };
    recognizer.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) setText(finalTranscript.trim());
    };
    try {
      recognizer.start();
      setRecognition(recognizer);
      setIsRecording(true);
    } catch (e: any) {
      setVoiceError('启动语音识别失败：' + (e?.message ?? '未知错误'));
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4">

      {/* ── 请先登录弹窗 ── */}
      {showLoginWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowLoginWarning(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-xs mx-4 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <LogIn className="text-amber-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">请先登录</h3>
            <p className="text-sm text-slate-500 mb-5">需要登录后才能开始练习</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginWarning(false)}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setShowLoginWarning(false); onNavigateToLogin(); }}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                去登录
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">开始你的听力训练</h2>
        <p className="text-slate-600">粘贴任何你想练习的英语文本，系统会自动为你生成听力材料。</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 border border-slate-200">

        {/* 本班作业提示卡 */}
        {assignmentLoading && (
          <div className="mb-5 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />检查本班作业中...
          </div>
        )}
        {!assignmentLoading && classAssignment && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-2 mb-2">
              <ClipboardList className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">📚 本班有作业</p>
                <p className="text-sm text-emerald-800 mt-0.5">{classAssignment.material_title}</p>
                {classAssignment.due_date && (
                  <p className="text-xs text-emerald-600 mt-0.5">截止日期：{classAssignment.due_date}</p>
                )}
                {assignmentStatus && (
                  <p className="text-xs text-emerald-700 mt-1">
                    ✅ 你已提交：{new Date(assignmentStatus.submittedAt).toLocaleString('zh-CN', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                    {assignmentStatus.accuracyRate != null ? ` · 正确率 ${Math.round(Number(assignmentStatus.accuracyRate))}%` : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => void handleStartAssignment()}
              disabled={startingAssignment}
              className="w-full mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {startingAssignment
                ? <><Loader2 className="w-4 h-4 animate-spin" />加载中...</>
                : <><ArrowRight className="w-4 h-4" />{assignmentStatus ? '再次练习该作业' : '立即完成作业'}</>}
            </button>
          </div>
        )}

        {/* 待办建议卡 */}
        {pendingTask && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">📌 上次练习建议未完成</p>
            <p className="mt-1 text-sm text-amber-700">{pendingTask.summary}</p>
            <div className="mt-2 space-y-1">
              {pendingTask.suggestions.map((item, idx) => (
                <p key={idx} className="text-xs text-amber-700">• {item}</p>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleContinuePendingTask}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                继续执行建议
              </button>
              <button
                type="button"
                onClick={handleDismissPendingTask}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                稍后再说
              </button>
            </div>
          </div>
        )}

        {/* 顶部操作按钮行 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-2 bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-100 transition-colors border border-slate-200 w-full justify-center md:w-auto"
          >
            <Book size={20} className="text-blue-600" />
            从听力库选择内容
          </button>
          {hasLatestReport && onViewLatestReport && (
            <div className="w-full md:w-auto">
              <button
                onClick={onViewLatestReport}
                className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-medium hover:bg-blue-100 transition-colors border border-blue-200 w-full justify-center md:w-auto"
              >
                查看上次分析报告
              </button>
              {latestReportAt && (
                <p className="mt-1 text-center md:text-left text-xs text-slate-500">
                  上次报告：{new Date(latestReportAt).toLocaleString('zh-CN', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 输入方式 Tabs */}
        <div className="flex gap-3 mb-6 border-b border-slate-100 pb-4">
          <button
            onClick={() => setMode('text')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'text' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <FileText size={20} />文本导入
          </button>
          <button
            onClick={() => setMode('voice')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'voice' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Mic size={20} />语音识别
          </button>
          <button
            onClick={() => setMode('image')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'image' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Camera size={20} />图片识别
          </button>
        </div>

        {/* 文本模式 */}
        {mode === 'text' && (
          <div className="space-y-4">
            <DifficultySelector value={difficulty} onChange={setDifficulty} />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="在这里粘贴英语文章、新闻或对话..."
              className="w-full h-64 p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-700 focus:border-transparent outline-none resize-none text-lg leading-relaxed text-slate-800"
            />
            <div className="flex justify-end">
              <button
                onClick={() => startPractice(text, 'text', { libraryMaterialId: initialLibraryMaterialId || undefined })}
                disabled={!text.trim()}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                开始练习
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* 语音模式 */}
        {mode === 'voice' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-lg p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Mic className="text-blue-700" size={20} />实时语音识别
                </h3>
                <p className="text-sm text-slate-600">点击麦克风按钮，朗读英语内容，系统会实时转换为文字</p>
              </div>
              <button
                onClick={handleVoiceRecording}
                className={`w-full py-4 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 text-lg ${
                  isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-blue-700 hover:bg-blue-800 text-white shadow-md'
                }`}
              >
                <Mic size={24} />
                {isRecording ? '点击停止录音' : '开始语音识别'}
              </button>
              {isRecording && text && (
                <div className="mt-3 p-3 bg-white border border-blue-200 rounded-lg text-sm text-slate-700 max-h-32 overflow-y-auto">
                  <p className="text-xs text-blue-400 mb-1">实时识别中…</p>
                  {text}
                </div>
              )}
              {voiceError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {voiceError}</div>
              )}
              <div className="mt-3 p-3 bg-slate-100 rounded-lg text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-600">使用说明</p>
                <p>· 首次使用需在浏览器弹窗中点击"允许"授权麦克风</p>
                <p className="font-medium text-slate-600 mt-1.5">支持的设备与浏览器</p>
                <p>· <strong>手机</strong>：iOS Safari ✅ &nbsp;|&nbsp; iOS/Android Chrome ✅</p>
                <p>· <strong>电脑（Mac）</strong>：Safari ✅</p>
                <p>· <strong>电脑（Windows）</strong>：Chrome / Edge 依赖 Google 服务，国内网络下通常无法使用 ❌</p>
                <p>· Firefox 不支持此功能 ❌</p>
              </div>
            </div>
            {text && mode === 'voice' && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700">已识别内容（可直接修改）</p>
                    <button onClick={() => setText('')} className="text-xs text-slate-400 hover:text-red-500 transition-colors">清空</button>
                  </div>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={8}
                    className="w-full p-4 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none resize-none text-slate-800 text-sm leading-relaxed"
                    placeholder="识别结果将显示在这里，可以直接编辑修改…"
                  />
                  <p className="text-xs text-slate-400 mt-1">请确认内容无误后再开始练习</p>
                </div>
                <DifficultySelector value={difficulty} onChange={setDifficulty} />
                <div className="flex justify-end">
                  <button
                    onClick={() => startPractice(text, 'voice')}
                    disabled={!text.trim()}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
                  >
                    开始练习<ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 图片模式 */}
        {mode === 'image' && (
          <div className="space-y-6">
            <div className="relative h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors group">
              {isProcessing ? (
                <div className="flex flex-col items-center">
                  <Loader2 size={40} className="text-blue-700 animate-spin mb-3" />
                  <p className="text-slate-700 font-medium">{processingStatus}</p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                    <Image size={36} className="text-blue-700" />
                  </div>
                  <p className="text-slate-800 font-bold mb-2 text-lg">拍照或上传图片</p>
                  <p className="text-slate-600 text-sm mb-1">支持 JPG、PNG、WEBP 等格式</p>
                  <p className="text-xs text-slate-400">AI将自动识别图片中的英文文字</p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isProcessing}
                  />
                </>
              )}
            </div>
            {text && mode === 'image' && (
              <div className="space-y-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="识别的文字将显示在这里..."
                  className="w-full h-32 p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-700 focus:border-transparent outline-none resize-none text-base leading-relaxed"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => startPractice(text, 'image')}
                    disabled={!text.trim()}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
                  >
                    开始练习<ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 特性介绍 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div className="p-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto mb-3 font-bold border border-blue-100">1</div>
          <h3 className="font-semibold text-slate-900">智能分句</h3>
          <p className="text-sm text-slate-500 mt-1">自动识别句子结构，逐句练习更高效</p>
        </div>
        <div className="p-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 font-bold border border-emerald-100">2</div>
          <h3 className="font-semibold text-slate-900">实时反馈</h3>
          <p className="text-sm text-slate-500 mt-1">智能对比答案，精准定位听写错误</p>
        </div>
        <div className="p-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 font-bold border border-blue-100">3</div>
          <h3 className="font-semibold text-slate-900">多维报告</h3>
          <p className="text-sm text-slate-500 mt-1">生成详细的学习报告，见证你的进步</p>
        </div>
      </div>
    </div>
  );
};

// ── 难度选择器 ────────────────────────────────────────────
interface DifficultySelectorProps {
  value: DictationDifficulty;
  onChange: (v: DictationDifficulty) => void;
}

const DIFFICULTY_OPTIONS: {
  id: DictationDifficulty;
  label: string;
  desc: string;
  example: string;
  color: { active: string; idle: string; ring: string };
}[] = [
  {
    id: 'easy',
    label: '入门',
    desc: '短句精听，每句 5–8 词',
    example: '适合听力薄弱、想踏实练听清的学生',
    color: {
      active: 'bg-emerald-50 border-emerald-400 text-emerald-700',
      idle: 'border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/40',
      ring: 'focus-visible:ring-emerald-300',
    },
  },
  {
    id: 'normal',
    label: '标准',
    desc: '完整意群，每句 10–14 词',
    example: '默认推荐，平衡训练量与认知负担',
    color: {
      active: 'bg-blue-50 border-blue-400 text-blue-700',
      idle: 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/40',
      ring: 'focus-visible:ring-blue-300',
    },
  },
  {
    id: 'hard',
    label: '挑战',
    desc: '长句记忆，尽量保持整句',
    example: '适合应试、追求长句记忆与全句理解的学生',
    color: {
      active: 'bg-purple-50 border-purple-400 text-purple-700',
      idle: 'border-slate-200 hover:border-purple-200 hover:bg-purple-50/40',
      ring: 'focus-visible:ring-purple-300',
    },
  },
];

const DifficultySelector: React.FC<DifficultySelectorProps> = ({ value, onChange }) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">听写难度</h3>
        <span className="text-xs text-slate-400">影响每句的拆分长度</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DIFFICULTY_OPTIONS.map(opt => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`relative text-left p-3 rounded-lg border transition-all outline-none focus-visible:ring-2 ${opt.color.ring} ${
                active ? `${opt.color.active} shadow-sm` : `bg-white ${opt.color.idle} text-slate-700`
              }`}
            >
              <div className="font-bold text-sm flex items-center justify-between">
                {opt.label}
                {active && <span className="text-xs">✓</span>}
              </div>
              <div className={`text-xs mt-1 ${active ? '' : 'text-slate-500'}`}>{opt.desc}</div>
              <div className="text-[11px] mt-1 text-slate-400 leading-snug">{opt.example}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

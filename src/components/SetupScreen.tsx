import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, ArrowRight, Loader2, Mic, Camera, Image, Book, ClipboardList } from 'lucide-react';
import { StudentInfo } from './StudentInfo';
import { getPendingSuggestionTaskLocal, updatePendingSuggestionTaskStatusLocal, syncSuggestionTaskStatusToSupabase } from '../utils/suggestionTaskManager';
import { supabase } from '../lib/supabase';
// 引入 OCR 库
import Tesseract from 'tesseract.js';

interface SetupScreenProps {
  initialText?: string;
  onOpenLibrary: () => void;
  onStart: (text: string, metadata?: {
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
    assignmentId?: string;
    assignmentTitle?: string;
  }) => void;
  hasLatestReport?: boolean;
  latestReportAt?: string;
  onViewLatestReport?: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStart, onOpenLibrary, initialText = '', hasLatestReport = false, latestReportAt, onViewLatestReport }) => {
  const [text, setText] = useState(initialText);

  // Update text if initialText changes (e.g. coming back from library)
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

  // 学生信息
  const [studentName, setStudentName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [className, setClassName] = useState('');
  const [pendingTask, setPendingTask] = useState<ReturnType<typeof getPendingSuggestionTaskLocal>>(null);

  // 班级作业
  interface ClassAssignment { id: string; class_name: string; material_id: string; material_title: string; due_date: string | null; }
  interface AssignmentSubmissionStatus { submittedAt: string; accuracyRate: number | null; }
  const [classAssignment, setClassAssignment] = useState<ClassAssignment | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentSubmissionStatus | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [startingAssignment, setStartingAssignment] = useState(false);
  const lastCheckedClassRef = useRef('');

  // 每次组件挂载（从练习页返回时）都强制重新检查作业状态
  useEffect(() => {
    lastCheckedClassRef.current = '';
    setAssignmentStatus(null);
    setClassAssignment(null);
  }, []);

  const handleStudentInfoChange = useCallback((name: string, number: string, classN: string) => {
    setStudentName(name);
    setStudentNumber(number);
    setClassName(classN);
  }, []);

  const loadClassAssignment = async (cls: string) => {
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
          if (submitted) {
            setAssignmentStatus({
              submittedAt: submitted.submitted_at,
              accuracyRate: submitted.accuracy_rate,
            });
          } else {
            setAssignmentStatus(null);
          }
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
    } finally { setAssignmentLoading(false); }
  };

  // 班级变化时再检查作业，避免重复轮询导致“一直检查中”
  useEffect(() => {
    const normalizedClass = className.trim();
    const normalizedStudent = studentName.trim();
    const checkKey = `${normalizedClass}__${normalizedStudent}`;

    if (!normalizedClass) {
      setAssignmentLoading(false);
      setClassAssignment(null);
      setAssignmentStatus(null);
      lastCheckedClassRef.current = '';
      return;
    }

    // 同一“班级+学生”不重复查
    if (lastCheckedClassRef.current === checkKey) return;
    lastCheckedClassRef.current = checkKey;
    void loadClassAssignment(normalizedClass);
  }, [className, studentName]);

  const handleStartAssignment = async () => {
    if (!classAssignment) return;
    setStartingAssignment(true);
    try {
      const { data, error } = await supabase
        .from('dictation_materials')
        .select('content')
        .eq('id', classAssignment.material_id)
        .single();
      if (error || !data?.content) { alert('加载素材失败，请稍后重试'); return; }
      if (!studentName.trim() || !studentNumber.trim()) { alert('请先填写学生信息'); return; }
      onStart(data.content, {
        studentName,
        studentNumber,
        className,
        inputMethod: 'text',
        assignmentId: classAssignment.id,
        assignmentTitle: classAssignment.material_title,
      });
    } catch { alert('加载素材失败'); }
    finally { setStartingAssignment(false); }
  };

  useEffect(() => {
    if (!studentNumber) {
      setPendingTask(null);
      return;
    }
    setPendingTask(getPendingSuggestionTaskLocal(studentNumber));
  }, [studentNumber]);

  const handleContinuePendingTask = () => {
    if (!pendingTask) return;
    updatePendingSuggestionTaskStatusLocal('done');
    void syncSuggestionTaskStatusToSupabase(pendingTask.id, 'done');
    setPendingTask(null);
    onStart(pendingTask.retry_text, {
      studentName,
      studentNumber,
      className,
      inputMethod: 'text',
    });
  };

  const handleDismissPendingTask = () => {
    if (!pendingTask) return;
    updatePendingSuggestionTaskStatusLocal('dismissed');
    void syncSuggestionTaskStatusToSupabase(pendingTask.id, 'dismissed');
    setPendingTask(null);
  };

  // --- 真正的图片识别逻辑 ---
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
      // 调用 Tesseract 进行识别
      const result = await Tesseract.recognize(
        file,
        'eng', // 语言：英语
        {
          logger: (m) => {
            // 更新进度条状态
            if (m.status === 'recognizing text') {
              setProcessingStatus(`正在识别文字... ${(m.progress * 100).toFixed(0)}%`);
            } else if (m.status === 'loading tesseract core') {
              setProcessingStatus('正在加载核心组件...');
            } else {
              setProcessingStatus('正在处理图片...');
            }
          }
        }
      );

      // 识别成功
      const recognizedText = result.data.text;
      if (!recognizedText.trim()) {
        alert('未在图片中识别到清晰的英文，请重试。');
      } else {
        setText(recognizedText);
        // 自动切换到文本模式，让用户看到结果
        setMode('text');
      }
    } catch (error) {
      console.error('Error processing image:', error);
      alert('图片识别失败，请检查网络或重试。');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 实时语音识别
  const handleVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('您的浏览器不支持语音识别功能。');
      return;
    }

    if (isRecording && recognition) {
      recognition.stop();
      setIsRecording(false);
      return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';

    let finalTranscript = '';

    recognizer.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      setText((finalTranscript + interimTranscript).trim());
    };

    recognizer.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognizer.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        setText(finalTranscript.trim());
      }
    };

    recognizer.start();
    setRecognition(recognizer);
    setIsRecording(true);
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">开始你的听力训练</h2>
        <p className="text-slate-600">粘贴任何你想练习的英语文本，系统会自动为你生成听力材料。</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 border border-slate-200">
        {/* 学生信息输入 */}
        <StudentInfo onInfoChange={handleStudentInfoChange} />

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
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
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
              {startingAssignment ? <><Loader2 className="w-4 h-4 animate-spin" />加载中...</> : <><ArrowRight className="w-4 h-4" />{assignmentStatus ? '再次练习该作业' : '立即完成作业'}</>}
            </button>
          </div>
        )}

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
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mb-6 border-b border-slate-100 pb-4">
          <button
            onClick={() => setMode('text')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'text' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <FileText size={20} />
            文本导入
          </button>
          <button
            onClick={() => setMode('voice')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'voice' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Mic size={20} />
            语音识别
          </button>
          <button
            onClick={() => setMode('image')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mode === 'image' ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Camera size={20} />
            图片识别
          </button>
        </div>

        {mode === 'text' ? (
          <div className="space-y-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="在这里粘贴英语文章、新闻或对话..."
              className="w-full h-64 p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-700 focus:border-transparent outline-none resize-none text-lg leading-relaxed text-slate-800"
            />
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (!studentName.trim() || !studentNumber.trim()) {
                    alert('请先填写学生信息（姓名和学号）');
                    return;
                  }
                  onStart(text, { studentName, studentNumber, className, inputMethod: 'text' });
                }}
                disabled={!text.trim()}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                开始练习
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        ) : mode === 'voice' ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <Mic className="text-blue-700" size={20} />
                    实时语音识别
                  </h3>
                  <p className="text-sm text-slate-600">
                    点击麦克风按钮，朗读英语内容，系统会实时转换为文字
                  </p>
                </div>
              </div>

              <button
                onClick={handleVoiceRecording}
                className={`w-full py-4 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 text-lg ${isRecording
                  ? 'bg-red-500 hover:bg-blue-600 text-white animate-pulse'
                  : 'bg-blue-700 hover:bg-blue-800 text-white shadow-md'
                  }`}
              >
                <Mic size={24} />
                {isRecording ? '点击停止录音' : '开始语音识别'}
              </button>

              {text && mode === 'voice' && (
                <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 mb-2">已识别内容预览：</p>
                  <p className="text-slate-700 text-sm line-clamp-3">{text}</p>
                </div>
              )}
            </div>

            {text && mode === 'voice' && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (!studentName.trim() || !studentNumber.trim()) {
                      alert('请先填写学生信息（姓名和学号）');
                      return;
                    }
                    setMode('text');
                    setTimeout(() => onStart(text, { studentName, studentNumber, className, inputMethod: 'voice' }), 300);
                  }}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md"
                >
                  使用此内容开始练习
                  <ArrowRight size={20} />
                </button>
              </div>
            )}
          </div>
        ) : (
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
                    onClick={() => {
                      if (!studentName.trim() || !studentNumber.trim()) {
                        alert('请先填写学生信息（姓名和学号）');
                        return;
                      }
                      onStart(text, { studentName, studentNumber, className, inputMethod: 'image' });
                    }}
                    disabled={!text.trim()}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
                  >
                    开始练习
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
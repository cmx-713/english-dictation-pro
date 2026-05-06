import React, { useState } from 'react';
import {
  LayoutDashboard,
  List,
  TrendingUp,
  RotateCcw,
  Home,
  CheckCircle,
  Book,
  Zap,
  Target
} from 'lucide-react';
import { SentenceResult } from './PracticeScreen';
import { AIAssistant } from './AIAssistant';
import { OVERALL_ANALYSIS_SYSTEM_PROMPT } from '../utils/aiPrompts';
import { Bot, AlertTriangle, MessageSquare, ChevronRight } from 'lucide-react';
import { analyzeErrors } from '../utils/errorAnalysis';
import { supabase } from '../lib/supabase';
import { ErrorCharts } from './ErrorCharts';

interface ResultsScreenProps {
  results: SentenceResult[];
  onRestart: () => void;
  onRetryRound: (retryText: string) => void;
  studentMetadata: {
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
  } | null;
}

// 定义标签页类型，去掉了 'ai'
type TabType = 'overview' | 'details' | 'insights';

interface ErrorSummaryRecord {
  by_subtype?: Record<string, number>;
}

const ERROR_CODE_LABELS: Record<string, string> = {
  A1: '漏冠词',
  A2: '漏介词',
  A3: '漏连词',
  A4: '漏代词',
  A5: '漏助动词',
  B1: '连读误判',
  B2: '弱读误判',
  B3: '同音混淆',
  B4: '尾音丢失',
  B5: '缩读误解',
  C1: '单词拼错',
  C2: '大小写错误',
  C3: '标点缺失',
  D1: '时态错误',
  D2: '单复数错误',
  D3: '主谓不一致',
};

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ results, onRestart, onRetryRound, studentMetadata }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [aiPanelWidth, setAiPanelWidth] = useState(384);
  const [profileLoading, setProfileLoading] = useState(false);
  const [weeklyProfile, setWeeklyProfile] = useState<{ totalSessions: number; topErrors: Array<{ key: string; count: number; trend: 'up' | 'down' | 'flat' }>; message: string } | null>(null);

  // 计算统计数据
  const totalSentences = results.length;
  const perfectSentences = results.filter(r => r.accuracy === 100).length;
  const avgAccuracy = Math.round(results.reduce((acc, curr) => acc + curr.accuracy, 0) / totalSentences) || 0;

  // 估算单词总数 (简单按空格分割)
  const totalWords = results.reduce((acc, curr) => acc + curr.original.split(' ').length, 0);

  // 难度评级
  const getDifficultyLevel = () => {
    if (avgAccuracy >= 90) return { label: '大师', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (avgAccuracy >= 75) return { label: '进阶', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (avgAccuracy >= 60) return { label: '中级', color: 'text-orange-600', bg: 'bg-orange-100' };
    return { label: '初级', color: 'text-slate-600', bg: 'bg-slate-100' };
  };

  const level = getDifficultyLevel();
  const currentErrorStats = analyzeErrors(results);
  const hasWrongErrors = currentErrorStats.A.total + currentErrorStats.B.total + currentErrorStats.C.total + currentErrorStats.D.total > 0;
  const hasLinkingErrors = currentErrorStats.B.total > 0;
  const hasSpellingErrors = currentErrorStats.C.total > 0;

  const weakForms = new Set(['to', 'of', 'and', 'that', 'but', 'as', 'than', 'at', 'for', 'from', 'was', 'were', 'do', 'does', 'can', 'could', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'must']);

  const extractWords = (text: string): string[] => {
    const words = text.toLowerCase().match(/[a-z']+/g);
    return words || [];
  };

  const hasSubstitutionPattern = (diffs: any[]): boolean => {
    for (let i = 0; i < diffs.length - 1; i++) {
      if (diffs[i][0] === 1 && diffs[i + 1][0] === -1) return true;
      if (diffs[i][0] === -1 && diffs[i + 1][0] === 1) return true;
    }
    return false;
  };

  const buildRetryText = (type: 'wrong' | 'linking' | 'spelling'): string => {
    const wrongResults = results.filter((r) => r.accuracy < 100);
    if (wrongResults.length === 0) {
      return results.map((r) => r.original).filter(Boolean).join('\n\n');
    }

    let selected = wrongResults;
    if (type === 'linking') {
      selected = wrongResults.filter((r) => {
        if (hasSubstitutionPattern(r.diffs)) return true;
        return r.diffs.some((d: any) => {
          if (d[0] !== 1 && d[0] !== -1) return false;
          return extractWords(d[1]).some((w) => weakForms.has(w) || w.length <= 3);
        });
      });
    }

    if (type === 'spelling') {
      selected = wrongResults.filter((r) => {
        if (hasSubstitutionPattern(r.diffs)) {
          return r.diffs.some((d: any) => extractWords(d[1]).some((w) => w.length >= 4));
        }
        return r.diffs.some((d: any) => (d[0] === 1 || d[0] === -1) && /[a-zA-Z]/.test(d[1]));
      });
    }

    if (selected.length === 0) selected = wrongResults;
    return selected.map((r) => r.original).filter(Boolean).join('\n\n');
  };

  // 从错误代码（如 B1, C2）映射到再练类型
  const getRetryTypeFromCode = (code: string): 'wrong' | 'linking' | 'spelling' => {
    if (code.startsWith('B')) return 'linking';
    if (code.startsWith('C')) return 'spelling';
    return 'wrong';
  };

  const handleRetryByType = (type: 'wrong' | 'linking' | 'spelling') => {
    if (type === 'wrong' && !hasWrongErrors) {
      alert('本次没有错题可再练，可直接开始新练习。');
      return;
    }
    if (type === 'linking' && !hasLinkingErrors) {
      alert('本次未检测到辨音/连读类错误。');
      return;
    }
    if (type === 'spelling' && !hasSpellingErrors) {
      alert('本次未检测到拼写类错误。');
      return;
    }

    const retryText = buildRetryText(type);
    if (!retryText.trim()) {
      alert('未找到可用于再练的句子');
      return;
    }
    onRetryRound(retryText);
  };

  React.useEffect(() => {
    const loadWeeklyProfile = async () => {
      if (!studentMetadata?.studentName) {
        setWeeklyProfile(null);
        return;
      }
      setProfileLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const { data, error } = await supabase
          .from('practice_records')
          .select('error_summary, created_at')
          .eq('student_name', studentMetadata.studentName)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false });

        if (error) throw error;
        const rows = (data || []) as Array<{ error_summary: ErrorSummaryRecord | null; created_at: string }>;

        const aggregateSubtypeCounts = (inputRows: Array<{ error_summary: ErrorSummaryRecord | null; created_at: string }>) => {
          const counts: Record<string, number> = {};
          inputRows.forEach((row) => {
            const summary = row.error_summary;
            if (!summary?.by_subtype) return;
            Object.entries(summary.by_subtype).forEach(([k, v]) => {
              counts[k] = (counts[k] || 0) + Number(v || 0);
            });
          });
          return counts;
        };

        const bySubtype = aggregateSubtypeCounts(rows);
        const splitIndex = Math.max(1, Math.floor(rows.length / 2));
        const recentRows = rows.slice(0, splitIndex);
        const previousRows = rows.slice(splitIndex);
        const recentCounts = aggregateSubtypeCounts(recentRows);
        const previousCounts = aggregateSubtypeCounts(previousRows);

        const topErrors = Object.entries(bySubtype)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([key, count]) => {
            const recent = recentCounts[key] || 0;
            const previous = previousCounts[key] || 0;
            const trend: 'up' | 'down' | 'flat' =
              recent > previous ? 'up' : recent < previous ? 'down' : 'flat';
            return { key, count, trend };
          });

        let message = '最近7天错误分布稳定，建议继续保持练习节奏。';
        if (topErrors.length > 0) {
          message = `最近7天高频错因：${topErrors
            .map((e) => `${ERROR_CODE_LABELS[e.key] || e.key}(${e.count})`)
            .join('、')}。建议优先专项巩固。`;
        }

        setWeeklyProfile({
          totalSessions: rows.length,
          topErrors,
          message,
        });
      } catch (e) {
        console.error('加载最近7天错因画像失败:', e);
        setWeeklyProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };
    void loadWeeklyProfile();
  }, [studentMetadata?.studentName]);
  const wrongSentences = results
    .filter((r) => r.accuracy < 100)
    .map((r) => r.original)
    .filter(Boolean);

  const handleRetryRound = () => {
    const retryText = (wrongSentences.length > 0
      ? wrongSentences
      : results.map((r) => r.original).filter(Boolean)
    ).join('\n\n');

    if (!retryText.trim()) {
      alert('未找到可用于再练的句子');
      return;
    }
    onRetryRound(retryText);
  };

  // AI 分析相关
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [aiInitialInput, setAiInitialInput] = useState('');

  // 整篇总结（自动生成，内联展示）
  const [autoSummary, setAutoSummary] = useState<string | null>(null);
  const [autoSummaryLoading, setAutoSummaryLoading] = useState(false);
  const autoSummaryFetchedRef = React.useRef(false);

  const buildAiContextSummary = () => {
    let summary = "【本次练习成绩单】\n";
    summary += `总句数：${totalSentences}，平均正确率：${avgAccuracy}%，完美句数：${perfectSentences}\n\n`;
    summary += "【详细错题记录】\n";

    results.forEach((r, i) => {
      if (r.accuracy < 100) {
        summary += `${i + 1}. 原文：${r.original}\n   用户：${r.userAnswer}\n`;
      }
    });

    if (perfectSentences === totalSentences) {
      summary += "（本次练习全部正确，太棒了！）";
    }
    return summary;
  };

  const handleAnalyzeOverall = () => {
    setAiContext(buildAiContextSummary());
    setAiInitialInput("请根据上述练习记录，生成整体错误分析报告");
    setIsAiOpen(true);
  };

  // 自动生成整篇总结（组件挂载后执行一次）
  React.useEffect(() => {
    if (autoSummaryFetchedRef.current) return;
    autoSummaryFetchedRef.current = true;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
    const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
    if (!supabaseUrl || !supabaseAnonKey) return;

    const context = buildAiContextSummary();

    const SUMMARY_SYSTEM_PROMPT = `你是专业英语听力教师。请根据学生本次整篇练习的错题记录，生成一份简短的总结反馈。

要求：
1. 只输出三个部分，用以下固定标题（Markdown 加粗）：
   **本次主要问题**
   **下次重点练习**
   **鼓励语**
2. "本次主要问题"：列出 2-3 个最突出的听力难点，用具体例子（原文单词）说明，而非笼统描述。
3. "下次重点练习"：给出 1-2 个可立即执行的练习建议（如：专项练习弱读词、放慢 0.75x 速度反复听连读片段）。
4. "鼓励语"：一句积极具体的鼓励（针对本次成绩）。
5. 如果本次全部正确，直接写：本次练习全部正确，表现出色！继续保持这种状态。
6. 总字数不超过 200 字，语气简洁直接，不要废话。`;

    setAutoSummaryLoading(true);
    fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: context },
        ],
        stream: false,
        temperature: 0.3,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data?.choices?.[0]?.message?.content ?? null;
        setAutoSummary(text);
      })
      .catch((err) => {
        console.warn('[AutoSummary] 生成总结失败:', err);
        setAutoSummary(null);
      })
      .finally(() => setAutoSummaryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 浮动按钮：打开时带上本次练习上下文；再次点击或点遮罩即收起 */
  const toggleAiAssistant = () => {
    if (isAiOpen) {
      setIsAiOpen(false);
      return;
    }
    if (!aiContext.trim()) {
      setAiContext(buildAiContextSummary());
      setAiInitialInput('');
    }
    setIsAiOpen(true);
  };

  return (
    <div className="relative max-w-5xl mx-auto pb-20 px-4 transition-all duration-300 ease-in-out">
      {/* 头部标题 */}
      <div className="text-center mb-10 pt-8">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce shadow-sm">
          <span className="text-4xl">🏆</span>
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">练习完成!</h2>
        <p className="text-slate-500">多维度听写能力分析报告</p>
      </div>

      {/* 标签页导航 (已移除 AI助手) */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-sm ${activeTab === 'overview'
            ? 'bg-slate-800 text-white shadow-lg'
            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-100'
            }`}
        >
          <LayoutDashboard size={18} />
          总览
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-sm ${activeTab === 'details'
            ? 'bg-slate-800 text-white shadow-lg'
            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-100'
            }`}
        >
          <List size={18} />
          详细分析
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-sm ${activeTab === 'insights'
            ? 'bg-slate-800 text-white shadow-lg'
            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-100'
            }`}
        >
          <TrendingUp size={18} />
          学习洞察
        </button>
      </div>

      {/* 内容区域 */}
      <div className="space-y-6">

        {/* 1. 总览视图 */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Zap size={24} className="text-emerald-600" />}
              label="平均正确率"
              value={`${avgAccuracy}%`}
              subtext="总分"
              bg="bg-emerald-50"
              border="border-emerald-100"
              textColor="text-emerald-700"
            />
            <StatCard
              icon={<CheckCircle size={24} className="text-blue-600" />}
              label="完美句数"
              value={perfectSentences}
              subtext={`完美句数 / ${totalSentences}`}
              bg="bg-blue-50"
              border="border-blue-100"
              textColor="text-blue-700"
            />
            <StatCard
              icon={<Book size={24} className="text-slate-600" />}
              label="练习单词总量"
              value={totalWords}
              subtext="练习单词总量"
              bg="bg-slate-100"
              border="border-slate-200"
              textColor="text-slate-700"
            />
            <StatCard
              icon={<Target size={24} className={level.color} />}
              label="练习难度"
              value={<span className="text-lg">{level.label}</span>} // Use ReactNode for value
              subtext="练习难度"
              bg={level.bg}
              border="border-slate-100" // Generic border since difficulty color varies
              textColor={level.color}
            />

            {/* 图表区域占位 */}
            <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-600" />
                正确率走势
              </h3>
              <div className="h-48 flex items-end justify-between gap-2 px-2">
                {results.map((r, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="relative w-full flex justify-center">
                      <span className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs px-2 py-1 rounded">
                        {r.accuracy}%
                      </span>
                      <div
                        className={`w-full max-w-[30px] rounded-t-lg transition-all duration-1000 ${r.accuracy >= 90 ? 'bg-emerald-500' : r.accuracy >= 60 ? 'bg-blue-400' : 'bg-orange-300'
                          }`}
                        style={{ height: `${Math.max(r.accuracy, 5) * 1.5}px` }} // Simple scaling
                      ></div>
                    </div>
                    <span className="text-xs text-slate-400">句{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Target size={18} className="text-blue-600" />
                  句子表现分布
                </h3>
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    完美 (100%): {perfectSentences}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    良好 (80-99%): {results.filter(r => r.accuracy < 100 && r.accuracy >= 80).length}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                    需改进 (&lt;80%): {results.filter(r => r.accuracy < 80).length}
                  </div>
                </div>
              </div>
              {/* 简单的饼图视觉效果 */}
              <div className="w-32 h-32 rounded-full border-8 border-slate-50 relative flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(
                                #10b981 0% ${(perfectSentences / totalSentences) * 100}%, 
                                #3b82f6 ${(perfectSentences / totalSentences) * 100}% ${((perfectSentences + results.filter(r => r.accuracy < 100 && r.accuracy >= 80).length) / totalSentences) * 100}%, 
                                #f97316 ${((perfectSentences + results.filter(r => r.accuracy < 100 && r.accuracy >= 80).length) / totalSentences) * 100}% 100%
                            )`
                  }}
                ></div>
                <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-400">完美</span>
                  <span className="font-bold text-emerald-600">{Math.round((perfectSentences / totalSentences) * 100)}%</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* 2. 详细分析视图 */}
        {activeTab === 'details' && (
          <div className="space-y-6">
            {results.map((r, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                      {i + 1}
                    </span>
                    <span className="font-bold text-slate-700">句 {i + 1}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${r.accuracy === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                    正确率: {r.accuracy}%
                  </span>
                </div>

                {/* 视觉化对比区域 */}
                <div className="flex flex-col gap-4">

                  {/* 1. 你的输入 (Input Construction) */}
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">你的输入</span>
                    <div className="text-lg font-medium text-slate-700 leading-relaxed font-serif">
                      {r.diffs.map((part: any, idx: number) => {
                        const [type, text] = part;
                        // Type -1: Extra (User wrote this, but it's not in original)
                        if (type === -1) {
                          return (
                            <span key={idx} className="bg-red-100 text-red-600 px-1 rounded mx-0.5 line-through decoration-red-400 decoration-2" title="多写的词">
                              {text}
                            </span>
                          );
                        }
                        // Type 0: Correct (User wrote this, and it is in original)
                        if (type === 0) {
                          return <span key={idx} className="text-slate-800 mx-0.5">{text}</span>;
                        }
                        // Type 1: Missing (User didn't write this) - Don't show in Input
                        return null;
                      })}
                      {/* 如果结果为空 (全漏)，显示占位符 */}
                      {r.diffs.every(d => d[0] === 1) && <span className="text-slate-300 italic">（未输入任何内容）</span>}
                    </div>
                  </div>

                  {/* 2. 原文对比 (Original Construction) */}
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 block">原文对比 & 错误标注</span>
                    <div className="text-lg font-medium text-slate-800 leading-[3rem] font-serif">
                      {r.diffs.map((part: any, idx: number) => {
                        const [type, text] = part;
                        // Type 1: Missing (In original, user missed it)
                        if (type === 1) {
                          return (
                            <span key={idx} className="relative inline-block mx-1 group">
                              <span className="text-emerald-600 font-bold border-b-2 border-emerald-500 pb-0.5 cursor-help">{text}</span>
                              <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[10px] bg-white border border-emerald-200 text-emerald-600 px-2 py-0.5 rounded shadow-sm whitespace-nowrap z-10 flex items-center gap-1">
                                <AlertTriangle size={10} className="fill-emerald-100" />
                                漏词
                              </span>
                            </span>
                          );
                        }
                        // Type 0: Correct
                        if (type === 0) {
                          return <span key={idx} className="mx-0.5 opacity-80">{text}</span>;
                        }
                        // Type -1: Extra - Don't show in Original
                        return null;
                      })}
                    </div>
                  </div>

                </div>

                {/* 错误提示文字 (Simplified) */}
                {r.accuracy < 100 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                    {r.diffs.some(d => d[0] === 1) && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        绿色下划线：漏掉的词
                      </div>
                    )}
                    {r.diffs.some(d => d[0] === -1) && (
                      <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        红色删除线：多写的词
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 3. 学习洞察视图 */}
        {activeTab === 'insights' && (
          <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm">
            {/* 自动生成整篇总结 */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                  <TrendingUp size={16} />
                </div>
                <h3 className="text-base font-bold text-slate-900">本次练习总结</h3>
              </div>
              {autoSummaryLoading ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-indigo-700 flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  AI 正在生成本次练习总结…
                </div>
              ) : autoSummary ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {autoSummary.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                    part.startsWith('**') && part.endsWith('**')
                      ? <strong key={i} className="text-indigo-700">{part.slice(2, -2)}</strong>
                      : <span key={i}>{part}</span>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-500">
                  总结生成失败，可点击下方"生成 AI 深度总结报告"手动获取。
                </div>
              )}
            </div>

            <div className="mt-8 mb-8 text-left">
              <h4 className="font-bold text-slate-800 mb-4 px-2 border-l-4 border-blue-500">最近7天错因画像</h4>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6">
                {profileLoading ? (
                  <p className="text-sm text-blue-700">正在生成最近7天错因画像...</p>
                ) : weeklyProfile ? (
                  <>
                    <p className="text-sm text-blue-800 font-medium mb-2">{weeklyProfile.message}</p>
                    <p className="text-xs text-blue-700 mb-2">近7天有效练习：{weeklyProfile.totalSessions} 次</p>
                    {weeklyProfile.topErrors.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {weeklyProfile.topErrors.map((item) => (
                          <span key={item.key} className="px-2 py-1 text-xs rounded-full bg-white text-blue-700 border border-blue-200">
                            {(ERROR_CODE_LABELS[item.key] || item.key)}（{item.key}） · {item.count}
                            <span className="ml-1">
                              {item.trend === 'up' ? '🔺上升' : item.trend === 'down' ? '🔻下降' : '➡️持平'}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-blue-700">暂无足够历史数据，完成更多练习后将显示画像。</p>
                )}
                {weeklyProfile && weeklyProfile.topErrors.length > 0 && (() => {
                  const topCode = weeklyProfile.topErrors[0].key;
                  const retryType = getRetryTypeFromCode(topCode);
                  const topLabel = ERROR_CODE_LABELS[topCode] || topCode;
                  const canRetry =
                    retryType === 'linking' ? hasLinkingErrors :
                    retryType === 'spelling' ? hasSpellingErrors :
                    hasWrongErrors;
                  return (
                    <div className="mt-3 flex flex-col gap-1">
                      <button
                        onClick={() => handleRetryByType(retryType)}
                        disabled={!canRetry}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed w-fit"
                        title={canRetry ? `针对历史高频错误「${topLabel}」专项再练` : `本次无「${topLabel}」类型错误`}
                      >
                        历史弱点专项再练：{topLabel}
                      </button>
                      <p className="text-xs text-blue-600">
                        基于你近7天最高频错误类型，在本次句子中专项再练
                        {!canRetry && '（本次无此类错误，按钮已禁用）'}
                      </p>
                    </div>
                  );
                })()}
              </div>

              <h4 className="font-bold text-slate-800 mb-4 px-2 border-l-4 border-indigo-500">听力现象频次分析</h4>
              <ErrorCharts stats={currentErrorStats} weeklyProfile={weeklyProfile} />
            </div>

            <div className="mt-8 mb-8 text-left">
              <h4 className="font-bold text-slate-800 mb-4 px-2 border-l-4 border-emerald-500">可执行建议卡（本次）</h4>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-800 font-medium mb-3">
                  建议优先处理：辨音类 {currentErrorStats.B.total} 次、拼写类 {currentErrorStats.C.total} 次、漏词类 {currentErrorStats.A.total} 次。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleRetryByType('wrong')}
                    disabled={!hasWrongErrors}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                    title={hasWrongErrors ? '针对本次错题进行再练' : '本次无错题'}
                  >
                    再练错题句
                  </button>
                  <button
                    onClick={() => handleRetryByType('linking')}
                    disabled={!hasLinkingErrors}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                    title={hasLinkingErrors ? '针对连读/辨音类问题再练' : '本次无连读/辨音类错误'}
                  >
                    连读专项再练
                  </button>
                  <button
                    onClick={() => handleRetryByType('spelling')}
                    disabled={!hasSpellingErrors}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                    title={hasSpellingErrors ? '针对拼写类问题再练' : '本次无拼写类错误'}
                  >
                    拼写专项再练
                  </button>
                </div>
                <p className="text-xs text-emerald-700 mt-2">
                  规则说明：本版先基于本次错题句进行专项筛选，不依赖 LLM。
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={handleAnalyzeOverall}
                className="flex items-center gap-2 mx-auto bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-200"
              >
                <Bot size={20} />
                生成 AI 深度总结报告
              </button>
              <p className="text-xs text-slate-400 mt-2">
                包含详细的错误类型统计（漏词、辨音、拼写等）及个性化建议
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 闭环提示：告诉学生建议会被保留，便于下次继续 */}
      <div className="mt-6 mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center">
        <p className="text-sm font-medium text-indigo-800">
          📌 本次练习建议已自动保存，下次打开系统可继续执行建议练习。
        </p>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-50">
        <button
          onClick={handleRetryRound}
          className="flex items-center gap-2 px-8 py-3 rounded-full bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all"
          title={wrongSentences.length > 0 ? `将再练 ${wrongSentences.length} 个错题句` : '本次全对，进行全文巩固再练'}
        >
          <RotateCcw size={20} />
          再练一轮（错题优先）
        </button>
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-8 py-3 rounded-full bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 hover:scale-105 transition-all"
        >
          <RotateCcw size={20} />
          开始新的练习
        </button>
        <button
          onClick={onRestart} // 这里简化为回首页，实际逻辑 App.tsx 已处理
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-800 text-white font-bold shadow-lg hover:bg-slate-900 hover:scale-105 transition-all"
        >
          <Home size={20} />
          返回首页
        </button>
      </div>

      {/* 与练习页一致：右下角开关，避免 AI 侧栏一直挡内容 */}
      <button
        type="button"
        onClick={toggleAiAssistant}
        className={`fixed bottom-8 z-[60] flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/20 shadow-2xl transition-all duration-300 group ${
          isAiOpen
            ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
            : 'right-8 bg-blue-600 text-white shadow-xl hover:bg-blue-700'
        }`}
        style={{ right: isAiOpen ? aiPanelWidth : 32 }}
        title={isAiOpen ? '收起 AI 助教' : '打开 AI 助教'}
      >
        {isAiOpen ? <ChevronRight size={28} /> : <MessageSquare size={26} className="relative z-10" />}
      </button>

      <AIAssistant
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        context={aiContext}
        initialInput={aiInitialInput}
        systemPrompt={OVERALL_ANALYSIS_SYSTEM_PROMPT}
        panelWidth={aiPanelWidth}
        onPanelWidthChange={setAiPanelWidth}
      />
    </div>
  );
};

// 辅助组件：统计卡片
const StatCard = ({ icon, label, value, subtext, bg, border, textColor }: any) => (
  <div className={`${bg} border ${border} p-5 rounded-xl flex flex-col justify-between h-36 hover:shadow-md transition-shadow`}>
    <div className="flex justify-between items-start">
      <div className="p-2 bg-white rounded-lg shadow-sm">
        {icon}
      </div>
      <span className={`text-xs font-bold px-2 py-1 rounded-full bg-white/50 ${textColor}`}>
        {label}
      </span>
    </div>
    <div>
      <div className={`text-3xl font-bold ${textColor} mb-1`}>{value}</div>
      <div className="text-xs text-slate-500 opacity-80">{subtext}</div>
    </div>
  </div>
);

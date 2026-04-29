import { SentenceResult } from '../components/PracticeScreen';
import { analyzeErrors } from './errorAnalysis';
import { supabase } from '../lib/supabase';

const PENDING_SUGGESTION_KEY = 'pending_suggestion_task_v1';

export interface SuggestionTask {
  id: string;
  student_name: string;
  student_number: string;
  class_name: string;
  retry_text: string;
  summary: string;
  suggestions: string[];
  status: 'pending' | 'done' | 'dismissed';
  created_at: string;
  updated_at: string;
  wrong_sentence_count: number;
  avg_accuracy: number;
}

const buildRetryText = (results: SentenceResult[]): { text: string; wrongCount: number } => {
  const wrongSentences = results
    .filter((r) => r.accuracy < 100)
    .map((r) => r.original)
    .filter(Boolean);
  const allSentences = results.map((r) => r.original).filter(Boolean);

  if (wrongSentences.length > 0) {
    return { text: wrongSentences.join('\n'), wrongCount: wrongSentences.length };
  }
  return { text: allSentences.join('\n'), wrongCount: 0 };
};

const buildSuggestions = (results: SentenceResult[]): { summary: string; suggestions: string[] } => {
  const totalSentences = results.length;
  const avgAccuracy = Math.round(results.reduce((acc, r) => acc + r.accuracy, 0) / Math.max(totalSentences, 1));
  const stats = analyzeErrors(results);

  const categoryTotals = [
    { key: 'A', label: '漏词', total: stats.A.total, action: '先做“漏词专项”再练，重点盯冠词/介词。' },
    { key: 'B', label: '辨音', total: stats.B.total, action: '建议先做“连读弱读”专项，放慢语速听关键连接处。' },
    { key: 'C', label: '拼写', total: stats.C.total, action: '建议先做“拼写专项”，再听一遍后口头拼读关键词。' },
    { key: 'D', label: '语法', total: stats.D.total, action: '建议先做“语法形态专项”，关注时态和单复数。' },
  ].sort((a, b) => b.total - a.total);

  const top = categoryTotals.filter((c) => c.total > 0).slice(0, 2);
  if (top.length === 0) {
    return {
      summary: `本次平均正确率 ${avgAccuracy}%，表现优秀。`,
      suggestions: ['本次建议：做一轮全文巩固，保持准确率稳定。'],
    };
  }

  return {
    summary: `本次平均正确率 ${avgAccuracy}%，主要问题集中在：${top.map((t) => `${t.label}(${t.total})`).join('、')}。`,
    suggestions: top.map((t, index) => `${index + 1}. ${t.action}`),
  };
};

export const createSuggestionTask = (
  results: SentenceResult[],
  student: { studentName: string; studentNumber: string; className: string }
): SuggestionTask => {
  const now = new Date().toISOString();
  const retry = buildRetryText(results);
  const suggestion = buildSuggestions(results);
  const avgAccuracy = Math.round(results.reduce((acc, r) => acc + r.accuracy, 0) / Math.max(results.length, 1));

  return {
    id: `task_${Date.now()}`,
    student_name: student.studentName,
    student_number: student.studentNumber,
    class_name: student.className,
    retry_text: retry.text,
    summary: suggestion.summary,
    suggestions: suggestion.suggestions,
    status: 'pending',
    created_at: now,
    updated_at: now,
    wrong_sentence_count: retry.wrongCount,
    avg_accuracy: avgAccuracy,
  };
};

export const savePendingSuggestionTaskLocal = (task: SuggestionTask) => {
  localStorage.setItem(PENDING_SUGGESTION_KEY, JSON.stringify(task));
};

export const getPendingSuggestionTaskLocal = (studentNumber?: string): SuggestionTask | null => {
  const raw = localStorage.getItem(PENDING_SUGGESTION_KEY);
  if (!raw) return null;
  try {
    const task = JSON.parse(raw) as SuggestionTask;
    if (task.status !== 'pending') return null;
    if (studentNumber && task.student_number !== studentNumber) return null;
    return task;
  } catch {
    return null;
  }
};

export const updatePendingSuggestionTaskStatusLocal = (status: 'done' | 'dismissed') => {
  const raw = localStorage.getItem(PENDING_SUGGESTION_KEY);
  if (!raw) return;
  try {
    const task = JSON.parse(raw) as SuggestionTask;
    task.status = status;
    task.updated_at = new Date().toISOString();
    localStorage.setItem(PENDING_SUGGESTION_KEY, JSON.stringify(task));
  } catch {
    // ignore
  }
};

// 中期能力：同步到 Supabase（无表时自动忽略，不影响主流程）
export const syncSuggestionTaskToSupabase = async (task: SuggestionTask) => {
  const { error } = await supabase.from('suggestion_tasks').upsert(task, { onConflict: 'id' });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('suggestion_tasks') || msg.includes('does not exist')) return;
    console.warn('suggestion task sync skipped:', error.message);
  }
};

export const syncSuggestionTaskStatusToSupabase = async (taskId: string, status: 'done' | 'dismissed') => {
  const { error } = await supabase
    .from('suggestion_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('suggestion_tasks') || msg.includes('does not exist')) return;
    console.warn('suggestion task status sync skipped:', error.message);
  }
};

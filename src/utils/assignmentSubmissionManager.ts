import { SentenceResult } from '../components/PracticeScreen';
import { supabase } from '../lib/supabase';

interface SubmissionPayload {
  assignmentId: string;
  className: string;
  studentName: string;
  studentNumber: string;
  rawText: string;
  results: SentenceResult[];
}

// 反作弊聚合：从 SentenceResult[] 计算可疑标记
const aggregateSuspicious = (results: SentenceResult[]) => {
  const reasons = new Set<string>();
  let pastedCount = 0;
  let suspiciousSentenceCount = 0;
  results.forEach((r) => {
    const meta = r.inputMeta;
    if (!meta) return;
    if (meta.pasted) { pastedCount++; reasons.add('pasted'); }
    if (meta.suspicious) {
      suspiciousSentenceCount++;
      if (meta.avgKeyIntervalMs !== null && meta.avgKeyIntervalMs < 25) reasons.add('tooFast');
      if (!meta.pasted) reasons.add('tooFewKeys');
    }
  });
  // 整体可疑判定：≥30% 句子可疑 或 ≥2 句粘贴
  const overallSuspicious =
    pastedCount >= 2 ||
    (results.length > 0 && suspiciousSentenceCount / results.length >= 0.3);
  return {
    isSuspicious: overallSuspicious,
    reasons: Array.from(reasons),
    pastedCount,
    suspiciousSentenceCount,
  };
};

export const upsertAssignmentSubmission = async (payload: SubmissionPayload) => {
  const totalSentences = payload.results.length;
  const perfectSentences = payload.results.filter((r) => r.accuracy === 100).length;
  const totalWords = payload.results.reduce((sum, r) => sum + r.original.split(/\s+/).filter(Boolean).length, 0);
  const avgAccuracy =
    totalSentences > 0
      ? Math.round((payload.results.reduce((sum, r) => sum + r.accuracy, 0) / totalSentences) * 100) / 100
      : 0;

  const { isSuspicious, reasons, pastedCount, suspiciousSentenceCount } = aggregateSuspicious(payload.results);

  const tryInsert = async (includeSuspiciousFields: boolean) => {
    const baseRow: Record<string, unknown> = {
      assignment_id: payload.assignmentId,
      student_name: payload.studentName,
      student_number: payload.studentNumber,
      class_name: payload.className,
      submitted_at: new Date().toISOString(),
      accuracy_rate: avgAccuracy,
      total_sentences: totalSentences,
      perfect_sentences: perfectSentences,
      total_words: totalWords,
      raw_text: payload.rawText,
      results: payload.results,
    };
    if (includeSuspiciousFields) {
      baseRow.is_suspicious = isSuspicious;
      baseRow.suspicious_reasons = reasons;
      baseRow.pasted_count = pastedCount;
      baseRow.suspicious_sentence_count = suspiciousSentenceCount;
    }
    return supabase
      .from('assignment_submissions')
      .upsert(baseRow, { onConflict: 'assignment_id,student_name' });
  };

  let { error } = await tryInsert(true);

  // 若字段不存在，回退到不带可疑字段
  if (error && /is_suspicious|suspicious_reasons|pasted_count|suspicious_sentence_count|column.*does not exist/i.test(error.message || '')) {
    console.warn('反作弊字段未初始化，请在 Supabase 执行 alter_assignment_submissions_suspicious.sql');
    ({ error } = await tryInsert(false));
  }

  if (error) {
    const msg = String(error.message || '');
    if (
      msg.includes('assignment_submissions') ||
      msg.includes('does not exist') ||
      msg.includes('row-level security') ||
      msg.includes('permission denied')
    ) {
      console.warn('assignment submission skipped:', error.message);
      return;
    }
    throw error;
  }
};

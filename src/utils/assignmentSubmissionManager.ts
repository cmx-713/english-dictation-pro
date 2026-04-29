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

export const upsertAssignmentSubmission = async (payload: SubmissionPayload) => {
  const totalSentences = payload.results.length;
  const perfectSentences = payload.results.filter((r) => r.accuracy === 100).length;
  const totalWords = payload.results.reduce((sum, r) => sum + r.original.split(/\s+/).filter(Boolean).length, 0);
  const avgAccuracy =
    totalSentences > 0
      ? Math.round((payload.results.reduce((sum, r) => sum + r.accuracy, 0) / totalSentences) * 100) / 100
      : 0;

  const { error } = await supabase
    .from('assignment_submissions')
    .upsert(
      {
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
      },
      { onConflict: 'assignment_id,student_name' }
    );

  if (error) {
    const msg = String(error.message || '');
    if (
      msg.includes('assignment_submissions') ||
      msg.includes('does not exist') ||
      msg.includes('row-level security') ||
      msg.includes('permission denied')
    ) {
      // Step 2兼容：若表或权限未准备好，不影响主练习流程
      console.warn('assignment submission skipped:', error.message);
      return;
    }
    throw error;
  }
};

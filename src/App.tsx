import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SetupScreen } from './components/SetupScreen';
import { PracticeScreen, SentenceResult } from './components/PracticeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { TeacherDashboard } from './components/TeacherDashboard';
import { LibraryScreen, DictationMaterial } from './components/LibraryScreen';
import { saveRecord } from './utils/historyManager';
import { registerStudent } from './utils/studentManager';
import { createSuggestionTask, savePendingSuggestionTaskLocal, syncSuggestionTaskToSupabase } from './utils/suggestionTaskManager';
import { upsertAssignmentSubmission } from './utils/assignmentSubmissionManager';

type AppMode = 'setup' | 'practice' | 'results' | 'history' | 'review' | 'teacher' | 'library';
const LATEST_RESULTS_KEY = 'latest_results_report_v1';
interface LatestResultsPayload {
  results: SentenceResult[];
  savedAt: string;
}

// URL path <-> AppMode mapping
const pathToMode: Record<string, AppMode> = {
  '/': 'setup',
  '/library': 'library',
  '/practice': 'practice',
  '/results': 'results',
  '/history': 'history',
  '/review': 'review',
  '/teacher': 'teacher',
};

const modeToPath: Record<AppMode, string> = {
  setup: '/',
  library: '/library',
  practice: '/practice',
  results: '/results',
  history: '/history',
  review: '/review',
  teacher: '/teacher',
};

function getModeFromPath(): AppMode {
  const path = window.location.pathname;
  // Check for ?mode=teacher legacy support
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'teacher') return 'teacher';
  return pathToMode[path] || 'setup';
}

function App() {
  const normalizeForMaterialMatch = (text: string) => text.replace(/\s+/g, ' ').trim();
  const [mode, setMode] = useState<AppMode>(() => getModeFromPath());
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState<SentenceResult[]>([]);
  const loadLatestResults = useCallback((): LatestResultsPayload | null => {
    try {
      const raw = localStorage.getItem(LATEST_RESULTS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LatestResultsPayload | SentenceResult[];

      // 兼容旧数据格式（直接存数组）
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return null;
        return {
          results: parsed,
          savedAt: new Date().toISOString(),
        };
      }

      if (!Array.isArray(parsed.results) || parsed.results.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const [studentMetadata, setStudentMetadata] = useState<{
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
    assignmentId?: string;
    assignmentTitle?: string;
  } | null>(null);
  /** 当前练习是否关联素材库 material（用于 TTS 缓存；作业同 material_id） */
  const [practiceLibraryMaterialId, setPracticeLibraryMaterialId] = useState<string | null>(null);
  /** 当前练习的难度（影响分句粒度） */
  const [practiceDifficulty, setPracticeDifficulty] = useState<import('./utils/textProcessing').DictationDifficulty>('normal');
  /** 从听力素材库点选后缓存，用于与首页文本比对是否被改动 */
  const [libraryPickContext, setLibraryPickContext] = useState<{ id: string; content: string } | null>(null);

  // Navigate to a new mode, pushing a history entry
  const navigateTo = useCallback((newMode: AppMode) => {
    const targetPath = modeToPath[newMode];
    // Only push if path actually changes
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ mode: newMode }, '', targetPath);
    }
    setMode(newMode);
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.mode) {
        setMode(event.state.mode as AppMode);
      } else {
        // Fallback: parse from URL
        setMode(getModeFromPath());
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial state so that first back press works correctly
    window.history.replaceState({ mode }, '', modeToPath[mode]);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = (
    text: string,
    metadata?: {
      studentName: string;
      studentNumber: string;
      className: string;
      inputMethod: 'text' | 'voice' | 'image';
      assignmentId?: string;
      assignmentTitle?: string;
      libraryMaterialId?: string;
      difficulty?: import('./utils/textProcessing').DictationDifficulty;
    }
  ) => {
    setRawText(text);
    console.info('[App debug] handleStart', {
      libFromMeta: metadata?.libraryMaterialId,
      libraryPickContextId: libraryPickContext?.id,
    });
    const libFromMeta = metadata?.libraryMaterialId?.trim();
    const normalizedText = normalizeForMaterialMatch(text);
    const libFromPick =
      !libFromMeta &&
      libraryPickContext &&
      normalizedText === normalizeForMaterialMatch(libraryPickContext.content)
        ? libraryPickContext.id
        : null;
    setPracticeLibraryMaterialId(libFromMeta || libFromPick || null);
    if (metadata?.difficulty) setPracticeDifficulty(metadata.difficulty);

    if (metadata) {
      setStudentMetadata(metadata);
      registerStudent({
        studentName: metadata.studentName,
        studentNumber: metadata.studentNumber,
        className: metadata.className
      });
    }
    navigateTo('practice');
  };

  const handleFinish = (res: SentenceResult[]) => {
    setResults(res);
    localStorage.setItem(
      LATEST_RESULTS_KEY,
      JSON.stringify({
        results: res,
        savedAt: new Date().toISOString(),
      } satisfies LatestResultsPayload)
    );
    if (rawText && res.length > 0) {
      saveRecord(rawText, res, studentMetadata || undefined);
      if (studentMetadata?.studentNumber) {
        const task = createSuggestionTask(res, {
          studentName: studentMetadata.studentName,
          studentNumber: studentMetadata.studentNumber,
          className: studentMetadata.className,
        });
        savePendingSuggestionTaskLocal(task);
        void syncSuggestionTaskToSupabase(task);
      }
      if (studentMetadata?.assignmentId && studentMetadata.studentName && studentMetadata.className) {
        void upsertAssignmentSubmission({
          assignmentId: studentMetadata.assignmentId,
          className: studentMetadata.className,
          studentName: studentMetadata.studentName,
          studentNumber: studentMetadata.studentNumber,
          rawText,
          results: res,
        });
      }
    }
    navigateTo('results');
  };

  const handleViewHistory = () => {
    navigateTo('history');
  };

  const handleViewRecord = (text: string, recordResults: SentenceResult[]) => {
    setRawText(text);
    setResults(recordResults);
    navigateTo('review');
  };

  const handleRestart = () => {
    setRawText('');
    setResults([]);
    setPracticeLibraryMaterialId(null);
    setLibraryPickContext(null);
    navigateTo('setup');
  };

  const handleViewLatestReport = () => {
    const latest = loadLatestResults();
    if (!latest) {
      alert('暂无可查看的上次分析报告');
      return;
    }
    setResults(latest.results);
    navigateTo('results');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Header onRestart={handleRestart} onViewHistory={handleViewHistory} />

      <main className="py-8 relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative z-10">
          {mode === 'setup' && (
            <SetupScreen
              onStart={handleStart}
              onOpenLibrary={() => navigateTo('library')}
              initialText={rawText}
              initialLibraryMaterialId={libraryPickContext?.id || null}
              hasLatestReport={Boolean(loadLatestResults())}
              latestReportAt={loadLatestResults()?.savedAt}
              onViewLatestReport={handleViewLatestReport}
            />
          )}

          {mode === 'library' && (
            <LibraryScreen
              onBack={() => navigateTo('setup')}
              onSelect={(material: DictationMaterial) => {
                setLibraryPickContext({ id: material.id, content: material.content });
                setPracticeLibraryMaterialId(material.id);
                setRawText(material.content);
                navigateTo('setup');
              }}
              studentMetadata={studentMetadata}
            />
          )}

          {mode === 'practice' && (
            <PracticeScreen
              rawText={rawText}
              onFinish={handleFinish}
              onBack={handleRestart}
              isAssignmentMode={Boolean(studentMetadata?.assignmentId)}
              libraryMaterialId={practiceLibraryMaterialId}
              initialDifficulty={practiceDifficulty}
            />
          )}

          {mode === 'results' && (
            <ResultsScreen
              results={results}
              onRestart={handleRestart}
              studentMetadata={studentMetadata}
              onRetryRound={(retryText: string) => {
                setRawText(retryText);
                navigateTo('practice');
              }}
            />
          )}

          {mode === 'review' && (
            <ReviewScreen
              results={results}
              onBack={() => navigateTo('history')}
            />
          )}

          {mode === 'history' && (
            <HistoryScreen
              onViewRecord={handleViewRecord}
              onBack={handleRestart}
            />
          )}

          {mode === 'teacher' && (
            <TeacherDashboard onBack={handleRestart} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

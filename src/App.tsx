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

type AppMode = 'setup' | 'practice' | 'results' | 'history' | 'review' | 'teacher' | 'library';

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
  const [mode, setMode] = useState<AppMode>(() => getModeFromPath());
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState<SentenceResult[]>([]);
  const [studentMetadata, setStudentMetadata] = useState<{
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
  } | null>(null);

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
    metadata?: { studentName: string; studentNumber: string; className: string; inputMethod: 'text' | 'voice' | 'image' }
  ) => {
    setRawText(text);
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
    if (rawText && res.length > 0) {
      saveRecord(rawText, res, studentMetadata || undefined);
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
    navigateTo('setup');
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
            />
          )}

          {mode === 'library' && (
            <LibraryScreen
              onBack={() => navigateTo('setup')}
              onSelect={(material: DictationMaterial) => {
                setRawText(material.content);
                navigateTo('setup');
              }}
            />
          )}

          {mode === 'practice' && (
            <PracticeScreen
              rawText={rawText}
              onFinish={handleFinish}
              onBack={handleRestart}
            />
          )}

          {mode === 'results' && (
            <ResultsScreen
              results={results}
              onRestart={handleRestart}
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

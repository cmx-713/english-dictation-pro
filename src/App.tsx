import { useState, useEffect } from 'react';
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

function App() {
  const [mode, setMode] = useState<AppMode>('setup');
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState<SentenceResult[]>([]);
  const [studentMetadata, setStudentMetadata] = useState<{
    studentName: string;
    studentNumber: string;
    className: string;
    inputMethod: 'text' | 'voice' | 'image';
  } | null>(null);

  // Check for teacher mode in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'teacher') {
      setMode('teacher');
    }
  }, []);

  const handleStart = (
    text: string,
    metadata?: { studentName: string; studentNumber: string; className: string; inputMethod: 'text' | 'voice' | 'image' }
  ) => {
    setRawText(text);
    if (metadata) {
      setStudentMetadata(metadata);
      // Register student immediately
      registerStudent({
        studentName: metadata.studentName,
        studentNumber: metadata.studentNumber,
        className: metadata.className
      });
    }
    setMode('practice');
  };

  const handleFinish = (res: SentenceResult[]) => {
    setResults(res);
    if (rawText && res.length > 0) {
      saveRecord(rawText, res, studentMetadata || undefined);
    }
    setMode('results');
  };

  const handleViewHistory = () => {
    setMode('history');
  };

  const handleViewRecord = (text: string, recordResults: SentenceResult[]) => {
    setRawText(text);
    setResults(recordResults);
    setMode('review');
  };

  const handleRestart = () => {
    setMode('setup');
    setRawText('');
    setResults([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Header onRestart={handleRestart} onViewHistory={handleViewHistory} />

      <main className="py-8 relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative z-10">
          {mode === 'setup' && (
            <SetupScreen
              onStart={handleStart}
              onOpenLibrary={() => setMode('library')}
              initialText={rawText}
            />
          )}

          {mode === 'library' && (
            <LibraryScreen
              onBack={() => setMode('setup')}
              onSelect={(material: DictationMaterial) => {
                // Convert material to text and start
                // We need to ensure student info is captured. 
                // If coming from library, maybe we prompt for student info if missing?
                // Or we assume SetupScreen collected it? 
                // Actually Library is accessed FROM SetupScreen, so we might lose state if we unmount SetupScreen.
                // But student info is in localStorage in StudentInfo component.
                // App.tsx doesn't know student info yet until onStart is called.
                // So we need to handle this.
                setRawText(material.content);
                setMode('setup'); // Go back to setup to confirm/enter student info with pre-filled text?
                // Better: go back to setup, pre-fill text, and let user click Start.
              }}
            />
          )}

          {mode === 'practice' && (
            <PracticeScreen
              rawText={rawText}
              onFinish={handleFinish}
              // 修改点：传入 onBack 回调，点击后回到初始设置页
              onBack={handleRestart}
            />
          )}

          {mode === 'results' && (
            <ResultsScreen
              results={results}
              onRestart={handleRestart}
            />
          )}

          {mode === 'review' && (
            <ReviewScreen
              results={results}
              onBack={handleViewHistory}
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
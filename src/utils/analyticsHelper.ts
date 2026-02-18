import { SentenceResult } from '../components/PracticeScreen';

/**
 * 计算详细的学习统计数据
 */
export interface DetailedStatistics {
  // 基础统计
  totalSentences: number;
  correctSentences: number;
  accuracyRate: number;
  totalWords: number;
  correctWords: number;
  wrongWords: number;
  
  // 得分统计
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  
  // 错误分析
  errorTypes: {
    spellingErrors: number;
    missingWords: number;
    extraWords: number;
  };
  
  // 困难句子
  difficultSentences: Array<{
    index: number;
    score: number;
    text: string;
  }>;
}

/**
 * 分析听写结果并生成详细统计
 */
export function analyzeResults(
  rawText: string,
  results: SentenceResult[]
): DetailedStatistics {
  const sentences = rawText.split(/[.!?]+/).filter(s => s.trim());
  
  // 基础统计
  const totalSentences = results.length;
  const correctSentences = results.filter(r => r.score === 10).length;
  const accuracyRate = totalSentences > 0 
    ? (correctSentences / totalSentences) * 100 
    : 0;
  
  // 单词统计
  let totalWords = 0;
  let correctWords = 0;
  let wrongWords = 0;
  let spellingErrors = 0;
  let missingWords = 0;
  let extraWords = 0;
  
  results.forEach(result => {
    result.diffs.forEach(diff => {
      const words = diff[1].trim().split(/\s+/).filter((w: string) => w);
      const wordCount = words.length;
      
      if (diff[0] === 0) {
        // 正确的部分
        correctWords += wordCount;
        totalWords += wordCount;
      } else if (diff[0] === -1) {
        // 应该有但没写的
        missingWords += wordCount;
        wrongWords += wordCount;
        totalWords += wordCount;
      } else if (diff[0] === 1) {
        // 多写的
        extraWords += wordCount;
        spellingErrors += wordCount;
      }
    });
  });
  
  // 得分统计
  const scores = results.map(r => r.score);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length || 0;
  const highestScore = Math.max(...scores, 0);
  const lowestScore = Math.min(...scores, 10);
  
  // 找出困难句子（得分低于6分的）
  const difficultSentences = results
    .map((result, index) => ({
      index,
      score: result.score,
      text: sentences[index] || ''
    }))
    .filter(s => s.score < 6)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5); // 最多保存5个
  
  return {
    totalSentences,
    correctSentences,
    accuracyRate: Math.round(accuracyRate * 100) / 100,
    totalWords,
    correctWords,
    wrongWords,
    averageScore: Math.round(averageScore * 100) / 100,
    highestScore,
    lowestScore,
    errorTypes: {
      spellingErrors,
      missingWords,
      extraWords
    },
    difficultSentences
  };
}

/**
 * 获取设备信息
 */
export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  
  if (/mobile/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    deviceType = 'tablet';
  }
  
  // 获取浏览器信息
  let browser = 'Unknown';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  
  return {
    deviceType,
    browser,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    userAgent: ua
  };
}

/**
 * 获取时间段信息
 */
export function getTimeInfo() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
  else timeOfDay = 'night';
  
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  return {
    timeOfDay,
    dayOfWeek: daysOfWeek[day],
    isWeekend: day === 0 || day === 6,
    hour
  };
}

/**
 * 分析文本难度
 */
export function analyzeTextDifficulty(text: string) {
  const words = text.split(/\s+/).filter((w: string) => w.trim());
  const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim());
  
  const totalWords = words.length;
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const averageWordLength = words.reduce((sum, w) => sum + w.length, 0) / totalWords || 0;
  const averageSentenceLength = totalWords / sentences.length || 0;
  
  // 简单的难度评估
  let difficulty: 'easy' | 'medium' | 'hard';
  if (averageWordLength < 5 && averageSentenceLength < 10) {
    difficulty = 'easy';
  } else if (averageWordLength < 7 && averageSentenceLength < 15) {
    difficulty = 'medium';
  } else {
    difficulty = 'hard';
  }
  
  return {
    difficulty,
    textLength: text.length,
    totalWords,
    uniqueWords,
    totalSentences: sentences.length,
    averageWordLength: Math.round(averageWordLength * 100) / 100,
    averageSentenceLength: Math.round(averageSentenceLength * 100) / 100
  };
}

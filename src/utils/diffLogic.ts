import { diff_match_patch, Diff } from 'diff-match-patch';

export interface DiffResult {
  diffs: Diff[];
  score: number;
  accuracy: number;
  errors: ErrorAnalysis[];
}

export interface ErrorAnalysis {
  type: 'missing' | 'extra' | 'typo' | 'unknown';
  original: string;
  input?: string;
  reason: string;
}

// 移除标点符号，只保留字母、数字和空格
const removePunctuation = (text: string): string => {
  return text.replace(/[^\w\s]|_/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
};

// Word-level diff implementation
const diffWords = (text1: string, text2: string): Diff[] => {
  const dmp = new diff_match_patch();

  // Tokenize by spaces
  const words1 = text1.split(/\s+/);
  const words2 = text2.split(/\s+/);

  // Map words to characters
  const wordToChar = new Map<string, string>();
  const charToWord: string[] = [];
  let nextChar = 0;

  const getChar = (word: string) => {
    if (!wordToChar.has(word)) {
      const char = String.fromCharCode(nextChar++);
      wordToChar.set(word, char);
      charToWord.push(word);
    }
    return wordToChar.get(word)!;
  };

  const chars1 = words1.map(getChar).join('');
  const chars2 = words2.map(getChar).join('');

  // Run standard diff
  const diffs = dmp.diff_main(chars1, chars2);
  // dmp.diff_cleanupSemantic(diffs); // Disable semantic cleanup for word-level diffs to preserve exact word matches

  // Map back to words
  const wordDiffs: Diff[] = [];

  diffs.forEach(([type, text]) => {
    const chars = text.split('');
    const words = chars.map(c => charToWord[c.charCodeAt(0)]);
    // Join with spaces, but we need to handle the boundaries in UI potentially. 
    // For simple diff array, just join content.
    // Note: This loses original whitespace preservation but we are working on "cleaned" text anyway.
    if (words.length > 0) {
      wordDiffs.push([type, words.join(' ')]);
    }
  });

  return wordDiffs;
};

export const calculateDiff = (original: string, input: string): DiffResult => {
  // 移除标点符号后进行对比（忽略标点问题），并标准化为空格分隔
  const cleanOriginal = removePunctuation(original);
  const cleanInput = removePunctuation(input);

  // Use word-level diff
  const diffs = diffWords(cleanInput, cleanOriginal);

  let correctChars = 0;
  // Calculate total characters based on cleaned text for scoring
  let totalChars = cleanOriginal.replace(/\s/g, '').length;

  const errors: ErrorAnalysis[] = [];

  diffs.forEach((part) => {
    const [type, text] = part;
    if (type === 0) { // Equal
      correctChars += text.replace(/\s/g, '').length;
    } else if (type === 1) { // Insert (Missing in input, present in Original)
      // Check if it's significant
      if (/[a-zA-Z0-9]/.test(text)) {
        errors.push({
          type: 'missing',
          original: text,
          reason: '没听出来或漏写了'
        });
      }
    } else if (type === -1) { // Delete (Extra in input)
      if (/[a-zA-Z0-9]/.test(text)) {
        errors.push({
          type: 'extra',
          original: text, // what user typed
          reason: '多写了或听错了'
        });
      }
    }
  });

  // Recalculate Score
  // Note: logic was correctChars / totalChars. 
  // If user types nothing: correct 0.
  // If user types complete mismatch: correct 0.
  // If user types extra: it doesn't penalize score explicitly in previous logic, only by missing opportunity to match?
  // Previous logic: accuracy = (correctChars / totalChars) * 100.
  // This ignores extra words penalty. Ideally we should penalize extra words too (Levenstein style),
  // but let's stick to the previous simple accuracy metric for now unless requested.
  // Actually, let's max it at 100.

  const accuracy = totalChars > 0 ? Math.min(100, Math.round((correctChars / totalChars) * 100)) : 0;
  const score = Math.max(0, Math.round(accuracy / 10));

  return {
    diffs,
    score,
    accuracy,
    errors
  };
};

export const predictErrorReason = (diffs: Diff[]): string[] => {
  // 生成智能化的错误分析反馈
  const feedback: string[] = [];
  const missingWords: string[] = [];
  const extraWords: string[] = [];

  diffs.forEach(([type, text]) => {
    if (type === 1) { // Missing in user input
      if (/[a-zA-Z]+/.test(text)) {
        // With word diffs, text is already words joined by space
        const words = text.split(/\s+/).filter(w => w.length > 0);
        missingWords.push(...words);
      }
    } else if (type === -1) { // Extra in user input
      if (/[a-zA-Z]+/.test(text)) {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        extraWords.push(...words);
      }
    }
  });

  // 分析错误类型

  // 1. 漏词分析
  if (missingWords.length > 0) {
    if (missingWords.length === 1) {
      feedback.push(`❌ 漏掉了 "${missingWords[0]}"：可能是连读、弱读导致没听清楚`);
    } else if (missingWords.length <= 3) {
      feedback.push(`❌ 漏掉了 ${missingWords.length} 个词 (${missingWords.join(', ')})：建议放慢语速，逐词仔细听`);
    } else {
      feedback.push(`❌ 漏掉了 ${missingWords.length} 个词：建议分段练习，先听懂句子大意再补充细节`);
    }

    // 检查是否是常见弱读词
    const weakFormWords = ['a', 'an', 'the', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'with'];
    const missedWeakWords = missingWords.filter(w => weakFormWords.includes(w.toLowerCase()));
    if (missedWeakWords.length > 0) {
      feedback.push(`💡 提示：遗漏的 "${missedWeakWords.join(', ')}" 是常见弱读词，在句子中通常发音很轻`);
    }

    // 检查是否是复杂词汇
    const complexWords = missingWords.filter(w => w.length > 8);
    if (complexWords.length > 0) {
      feedback.push(`📚 词汇提升：建议加强 "${complexWords.join(', ')}" 等长词的发音练习`);
    }
  }

  // 2. 多词分析
  if (extraWords.length > 0) {
    if (extraWords.length === 1) {
      feedback.push(`➕ 多写了 "${extraWords[0]}"：可能是听错或脑补了，建议再听一遍确认`);
    } else {
      feedback.push(`➕ 多写了 ${extraWords.length} 个词 (${extraWords.slice(0, 3).join(', ')}...)：注意不要过度联想，以实际听到的为准`);
    }
  }

  // 3. 拼写错误分析（同时有漏词和多词，可能是拼写错误）
  // Simple check for now without complex alignment
  if (missingWords.length > 0 && extraWords.length > 0) {
    // Only show if small number of errors roughly match count
    const confusions = findSimilarWords(missingWords, extraWords);
    if (confusions.length > 0) {
      confusions.forEach(([correct, wrong]) => {
        feedback.push(`🔄 可能混淆：把 "${correct}" 听成了 "${wrong}"`);
      });
    } else if (Math.abs(missingWords.length - extraWords.length) <= 1) {
      feedback.push(`🔄 存在单词拼写错误或混淆，请仔细比对原文和您的输入。`);
    }
  }

  // 5. 根据错误率给出学习建议
  const totalErrors = missingWords.length + extraWords.length;
  if (totalErrors >= 5) {
    feedback.push(`📝 学习建议：错误较多，建议先放慢语速（0.5-0.75x）多听几遍，熟悉后再提速`);
  }

  if (feedback.length === 0) {
    feedback.push("🎉 完美！完全正确，继续保持！");
  }

  return feedback;
}

// 找出可能混淆的相似单词
const findSimilarWords = (correctWords: string[], wrongWords: string[]): [string, string][] => {
  const confusions: [string, string][] = [];
  correctWords.forEach(correct => {
    wrongWords.forEach(wrong => {
      // 必须不是同一个词
      if (correct.toLowerCase() !== wrong.toLowerCase()) {
        if (levenshteinDistance(correct.toLowerCase(), wrong.toLowerCase()) <= 2) {
          confusions.push([correct, wrong]);
        }
      }
    });
  });
  return confusions;
}

// 计算编辑距离（Levenshtein Distance）
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

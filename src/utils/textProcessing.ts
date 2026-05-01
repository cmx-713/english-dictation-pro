export interface Sentence {
  id: string;
  text: string;
  startTime?: number; // For audio alignment if we had it
  endTime?: number;
  userAnswer?: string;
  isCompleted: boolean;
}

// 难度模式：影响分句的粒度
export type DictationDifficulty = 'easy' | 'normal' | 'hard';

// 难度对应的拆分参数
interface DifficultyConfig {
  splitMaxWords: number;        // 超过多少词触发意群拆分
  splitMaxChars: number;        // 超过多少字符触发意群拆分
  strongConjMinWords: number;   // 强连词分割的最小词数
  weakConjMinWords: number;     // 弱连词分割的最小词数
  weakConjMinSide: number;      // 弱连词分割后两侧的最小词数
  mergeMinChunk: number;        // 当前累积片段过短的合并阈值
  mergeShortSeg: number;        // 短片段合并的阈值
  forceSplitWords: number;      // 超长强制拆分的阈值
  forceSplitChunk: number;      // 强制拆分时每段的目标词数
}

const DIFFICULTY_PRESETS: Record<DictationDifficulty, DifficultyConfig> = {
  // 入门：句子短、便于精听
  easy: {
    splitMaxWords: 8, splitMaxChars: 50,
    strongConjMinWords: 7, weakConjMinWords: 9, weakConjMinSide: 4,
    mergeMinChunk: 3, mergeShortSeg: 4,
    forceSplitWords: 12, forceSplitChunk: 8,
  },
  // 标准：意群完整、长度适中
  normal: {
    splitMaxWords: 12, splitMaxChars: 80,
    strongConjMinWords: 10, weakConjMinWords: 14, weakConjMinSide: 5,
    mergeMinChunk: 5, mergeShortSeg: 6,
    forceSplitWords: 20, forceSplitChunk: 12,
  },
  // 挑战：尽量保持整句、训练长句记忆
  hard: {
    splitMaxWords: 22, splitMaxChars: 150,
    strongConjMinWords: 18, weakConjMinWords: 25, weakConjMinSide: 8,
    mergeMinChunk: 8, mergeShortSeg: 10,
    forceSplitWords: 35, forceSplitChunk: 22,
  },
};

// 智能分句：根据标点和意群分割文本
export const splitTextIntoSentences = (
  text: string,
  difficulty: DictationDifficulty = 'normal'
): Sentence[] => {
  if (!text) return [];
  const cfg = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;

  // 标准化空格
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // 第一步：按照句子终止符分割（. ! ? 等）
  // 避免常见缩写词的误分割
  const abbreviations = [
    'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'vs.', 'etc.', 'e.g.', 'i.e.', 'Inc.', 'Ltd.', 'Co.',
    'St.', 'Ave.', 'Rd.', 'Blvd.', 'Dept.', 'Univ.', 'Capt.', 'Col.', 'Gen.', 'Lt.', 'Maj.', 'Sgt.', 'Rev.', 'Hon.'
  ];
  let processedText = cleanText;

  // 暂时替换缩写词中的句号，避免误分割
  abbreviations.forEach((abbr, idx) => {
    const placeholder = `<ABB${idx}>`;
    processedText = processedText.replace(new RegExp(abbr.replace('.', '\\.'), 'gi'), placeholder);
  });

  // 按句子终止符分割
  const rawSentences = processedText.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [processedText];

  // 恢复缩写词
  const sentences = rawSentences.map(s => {
    let restored = s;
    abbreviations.forEach((abbr, idx) => {
      const placeholder = `<ABB${idx}>`;
      restored = restored.replace(new RegExp(placeholder, 'g'), abbr);
    });
    return restored.trim();
  });

  // 第二步：对长句子进行意群分割
  const finalSegments: string[] = [];
  sentences.forEach(sentence => {
    if (shouldSplitByMeaningGroup(sentence, cfg)) {
      const chunks = splitByMeaningGroup(sentence, cfg);
      finalSegments.push(...chunks);
    } else {
      finalSegments.push(sentence);
    }
  });

  return finalSegments
    .filter(s => s.length > 0)
    .map((segment, index) => ({
      id: `s-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: segment.trim(),
      isCompleted: false,
      userAnswer: ''
    }));
};

// 判断是否需要按意群分割（长句子）
const shouldSplitByMeaningGroup = (sentence: string, cfg: DifficultyConfig): boolean => {
  const wordCount = sentence.split(/\s+/).length;
  const charCount = sentence.length;
  return wordCount > cfg.splitMaxWords || charCount > cfg.splitMaxChars;
};

// ── 不可拆分的固定搭配（regex 列表）─────────────────────
// 这些短语内部的 and/or/but 不应作为分割点
const NON_SPLIT_PATTERNS: RegExp[] = [
  // and/or/but 内嵌的固定搭配
  /\bmore\s+and\s+more\b/gi,
  /\bover\s+and\s+over\b/gi,
  /\bagain\s+and\s+again\b/gi,
  /\bback\s+and\s+forth\b/gi,
  /\bup\s+and\s+down\b/gi,
  /\bin\s+and\s+out\b/gi,
  /\bnow\s+and\s+then\b/gi,
  /\bnow\s+and\s+again\b/gi,
  /\bonce\s+(?:and|or)\s+twice\b/gi,
  /\bsooner\s+or\s+later\b/gi,
  /\bone\s+or\s+two\b/gi,
  /\bthree\s+or\s+four\b/gi,
  /\bblack\s+and\s+white\b/gi,
  /\bbread\s+and\s+butter\b/gi,
  /\bfish\s+and\s+chips\b/gi,
  /\bsalt\s+and\s+pepper\b/gi,
  /\bsafe\s+and\s+sound\b/gi,
  /\bsick\s+and\s+tired\b/gi,
  /\bnice\s+and\s+\w+\b/gi,           // nice and warm/cool/easy
  /\b(?:either|whether)\s+\w+\s+or\s+\w+\b/gi,    // either X or Y / whether X or Y
  /\bneither\s+\w+\s+nor\s+\w+\b/gi,              // neither X nor Y
  /\bnot\s+only\s+.{1,40}?\s+but\s+(?:also\s+)?/gi, // not only ... but (also)
  /\bas\s+well\s+as\b/gi,
  /\bas\s+a\s+result\b/gi,
  /\bfor\s+example\b/gi,
  /\bfor\s+instance\b/gi,
  /\bof\s+course\b/gi,
  /\bin\s+addition(?:\s+to)?\b/gi,
  /\bon\s+the\s+other\s+hand\b/gi,
  /\bin\s+other\s+words\b/gi,
  /\bat\s+the\s+same\s+time\b/gi,
  /\bin\s+fact\b/gi,
  /\bso\s+far\b/gi,
  /\bso\s+that\b/gi,
  /\band\s+so\s+on\b/gi,
];

// 强分割连词：明确的从属/并列从句边界，优先在此分割
const STRONG_CONJUNCTIONS =
  /\s+(because|although|though|since|while|whereas|unless|if|when|whenever|until|before|after|wherever|therefore|however|nevertheless|moreover|furthermore)\b/i;

// 弱分割连词：可能在固定短语内，需要更严格的两侧长度才能切
const WEAK_CONJUNCTIONS = /\s+(but|and|or|so|yet|nor)\b/i;

// 按意群分割长句子
const splitByMeaningGroup = (sentence: string, cfg: DifficultyConfig): string[] => {
  // 0. 保护固定搭配：用占位符替换，分割完后再还原
  const protectedSegments: { token: string; original: string }[] = [];
  let protectedSentence = sentence;
  for (const pattern of NON_SPLIT_PATTERNS) {
    protectedSentence = protectedSentence.replace(pattern, (match) => {
      const token = `\u0001K${protectedSegments.length}\u0001`;
      protectedSegments.push({ token, original: match });
      return token;
    });
  }

  // 1. 按标点分割（逗号/分号/冒号是最自然的意群边界）
  const separatorRegex = /([,;:])/;
  const initialSegments = protectedSentence.split(separatorRegex);
  const mergedSegments: string[] = [];
  for (let i = 0; i < initialSegments.length; i++) {
    const part = initialSegments[i];
    if (separatorRegex.test(part)) {
      if (mergedSegments.length > 0) {
        mergedSegments[mergedSegments.length - 1] += part;
      }
    } else if (part.trim()) {
      mergedSegments.push(part);
    }
  }

  // 2. 强连词分割（because/although 等明确从句边界）
  const splitByStrong: string[] = [];
  mergedSegments.forEach((seg) => {
    if (seg.split(/\s+/).length > cfg.strongConjMinWords && STRONG_CONJUNCTIONS.test(seg)) {
      const safe = seg.replace(STRONG_CONJUNCTIONS, (m) => `\u0001S\u0001${m}`);
      splitByStrong.push(...safe.split('\u0001S\u0001').filter((s) => s.trim()));
    } else {
      splitByStrong.push(seg);
    }
  });

  // 3. 弱连词分割（and/or/but 等，要求段落足够长，且两侧都 ≥ minSide 词）
  const splitByWeak: string[] = [];
  splitByStrong.forEach((seg) => {
    const wordCount = seg.split(/\s+/).length;
    if (wordCount > cfg.weakConjMinWords) {
      const match = WEAK_CONJUNCTIONS.exec(seg);
      if (match && typeof match.index === 'number') {
        const left = seg.slice(0, match.index).trim();
        const right = seg.slice(match.index).trim();
        if (
          left.split(/\s+/).length >= cfg.weakConjMinSide &&
          right.split(/\s+/).length >= cfg.weakConjMinSide
        ) {
          splitByWeak.push(left, right);
          return;
        }
      }
    }
    splitByWeak.push(seg);
  });

  // 4. 智能合并过短的片段
  const optimizedChunks: string[] = [];
  let currentChunk = '';
  splitByWeak.forEach((seg) => {
    const cleanSeg = seg.trim();
    if (!cleanSeg) return;

    const combined = currentChunk ? `${currentChunk} ${cleanSeg}` : cleanSeg;
    const segWordCount = cleanSeg.split(/\s+/).length;
    const endsWithPunctuation = /[,;:]$/.test(currentChunk);

    if (!currentChunk) {
      currentChunk = cleanSeg;
    } else if (
      currentChunk.split(/\s+/).length < cfg.mergeMinChunk ||
      (segWordCount < cfg.mergeShortSeg && !endsWithPunctuation)
    ) {
      currentChunk = combined;
    } else {
      optimizedChunks.push(currentChunk);
      currentChunk = cleanSeg;
    }
  });
  if (currentChunk) optimizedChunks.push(currentChunk);

  // 5. 超长强制按长度分割
  const lengthSplit: string[] = [];
  optimizedChunks.forEach((chunk) => {
    if (chunk.split(/\s+/).length > cfg.forceSplitWords) {
      const words = chunk.split(/\s+/);
      for (let i = 0; i < words.length; i += cfg.forceSplitChunk) {
        const slice = words.slice(i, i + cfg.forceSplitChunk).join(' ');
        if (slice) lengthSplit.push(slice);
      }
    } else {
      lengthSplit.push(chunk);
    }
  });

  // 6. 还原被保护的固定搭配
  const result = lengthSplit.map((chunk) => {
    let s = chunk;
    protectedSegments.forEach(({ token, original }) => {
      s = s.replace(token, original);
    });
    return s;
  });

  return result.filter((s) => s.trim().length > 0);
};

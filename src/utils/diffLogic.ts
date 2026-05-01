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

// 移除标点符号，但保留撇号（it's, don't 等缩写中的撇号是单词的一部分）
// 同时把各种 Unicode 弯撇号 ’ ‘ 统一为直撇号 '，避免 it's 与 it's 被判为不同
const removePunctuation = (text: string): string => {
  return text
    .replace(/[\u2018\u2019\u201B\u02BC]/g, "'") // 各种弯撇号 → 直撇号
    .replace(/[^\w\s']|_/g, '') // 保留 word + 空白 + 撇号
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

// ── 听力现象分类反馈（新版）──────────────────────────────────
export type FeedbackPhenomenon =
  | 'weak_form'         // 弱读词漏听
  | 'auxiliary'         // 助动词漏听
  | 'connected_speech'  // 连读/吞音
  | 'phonetic_confusion'// 音近混淆
  | 'spelling'          // 拼写错误（音对字错）
  | 'chunk_missing'     // 连续多词漏听
  | 'extra_word'        // 多写词
  | 'general';          // 通用

export interface FeedbackItem {
  phenomenon: FeedbackPhenomenon;
  label: string;       // 现象名，如"弱读词漏听"
  words: string[];     // 涉及的词
  explanation: string; // 为什么难听
  tip: string;         // 下次怎么听
}

// 弱读介词/冠词/连词/代词宾格
const WEAK_FORM_WORDS = new Set([
  'a','an','the','to','of','in','on','at','for','with','from','by','as','than','that',
  'and','or','but','so','nor',
  'us','me','him','her','them','it','its',
]);
// 助动词（弱读且常被省略）
const AUXILIARY_WORDS = new Set([
  'is','are','was','were','be','been','am',
  'have','has','had','do','does','did',
  'can','could','will','would','shall','should','may','might','must',
]);
// 人称代词集合
const PRONOUN_WORDS = new Set([
  'i','you','he','she','we','they','me','him','her','us','them','it',
]);
// 预定义音近混淆对 [正确词, 学生写的词]
const PHONETIC_PAIRS: [string, string][] = [
  ['ship','sheep'],['sheep','ship'],['bit','beat'],['beat','bit'],
  ['bad','bed'],['bed','bad'],['sit','seat'],['seat','sit'],
  ['it','eat'],['eat','it'],['full','fool'],['fool','full'],
  ['live','leave'],['leave','live'],['fill','feel'],['feel','fill'],
  ['then','than'],['than','then'],['this','these'],['these','this'],
  ['though','through'],['through','though'],['where','were'],['were','where'],
  ['their','there'],['there','their'],['hear','here'],['here','hear'],
  // 短促音混淆
  ['it','to'],['to','it'],['it','at'],['at','it'],
  ['in','on'],['on','in'],['an','and'],['and','an'],
  ['his','is'],['is','his'],['he','we'],['we','he'],
  // 第一/二人称混淆（语感不确定时）
  ['you','we'],['we','you'],['you','i'],['i','you'],
  ['your','our'],['our','your'],['they','we'],['we','they'],
  // 功能词弱读混淆（末尾辅音 /n/ vs /t/ 等）
  ['than','that'],['that','than'],['then','than'],['than','then'],
  ['when','where'],['where','when'],['what','that'],['that','what'],
];
// 词形变化后缀对（形容词↔副词、动词变形等）
const WORD_FORM_SUFFIXES: [string, string, string][] = [
  // [正确词尾, 错误词尾, 描述]
  ['ly','le','副词写成了形容词（如 probably → probable）'],
  ['le','ly','形容词写成了副词（如 probable → probably）'],
  ['ly','','副词丢失了 -ly 结尾'],
  ['ed','ing','过去式写成了进行时'],
  ['ing','ed','进行时写成了过去式'],
  ['s','','第三人称单数遗漏 -s'],
];

// 将 diff 序列合并：相邻的 del+ins / ins+del → 替换事件
type SubstEvent = { kind: 'subst'; original: string; typed: string };
type SimpleEvent = { kind: 'missing' | 'extra'; text: string };
type DiffEvent = SubstEvent | SimpleEvent;

const toDiffEvents = (diffs: Diff[]): DiffEvent[] => {
  const events: DiffEvent[] = [];
  let i = 0;
  while (i < diffs.length) {
    const [type, text] = diffs[i];
    if (type === 1) {
      // missing（原文有，学生没写）→ 看下一个是否是 extra（del）
      if (i + 1 < diffs.length && diffs[i + 1][0] === -1) {
        events.push({ kind: 'subst', original: text, typed: diffs[i + 1][1] });
        i += 2;
      } else {
        events.push({ kind: 'missing', text });
        i++;
      }
    } else if (type === -1) {
      // extra（学生多写）→ 看下一个是否是 missing（ins）
      if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
        events.push({ kind: 'subst', original: diffs[i + 1][1], typed: text });
        i += 2;
      } else {
        events.push({ kind: 'extra', text });
        i++;
      }
    } else {
      i++;
    }
  }
  return events;
};

// 判断单个替换的类型，返回一条 FeedbackItem
const classifySubstitution = (correct: string, typed: string): FeedbackItem => {
  const c = correct.toLowerCase().trim();
  const t = typed.toLowerCase().trim();

  // 0. 不完整拼写：typed 是 correct 的前缀（学生只听到了词头）
  if (t.length >= 1 && c.startsWith(t) && t.length < c.length) {
    return {
      phenomenon: 'spelling',
      label: '不完整拼写',
      words: [correct, typed],
      explanation: `你只写了 "${typed}"，正确答案是 "${correct}"。可能是语速较快时只捕捉到了词的开头音节，没有等词说完就开始写。`,
      tip: `再听时先完整听完这个词再下笔，注意 "${correct}" 的完整发音（尤其是末尾音节）。`,
    };
  }

  // 1. 预定义音近对
  const inPairs = PHONETIC_PAIRS.some(([a, b]) => a === c && b === t);
  if (inPairs) {
    const isPronouns = PRONOUN_WORDS.has(c) && PRONOUN_WORDS.has(t);
    if (isPronouns) {
      return {
        phenomenon: 'phonetic_confusion',
        label: '人称代词混淆',
        words: [correct, typed],
        explanation: `你写了 "${typed}"，但正确答案是 "${correct}"。两者都是常见人称代词，在连贯语流中发音相近（"${c}" /juː/ 与 "${t}" /wiː/ 结尾相同），听觉上容易混淆。`,
        tip: `再听时注意句子的主语：谁在说话？说话对象是谁？锁定人称逻辑后重听。`,
      };
    }
    return {
      phenomenon: 'phonetic_confusion',
      label: '音近词混淆',
      words: [correct, typed],
      explanation: `你写了 "${typed}"，正确是 "${correct}"，两者发音非常相近。`,
      tip: `专门重听这个词，注意元音的长短或辅音的清浊。`,
    };
  }

  // 2. 词形后缀错误（-ly/-le 等）
  for (const [rightSuffix, wrongSuffix, desc] of WORD_FORM_SUFFIXES) {
    if (c.endsWith(rightSuffix) && t.endsWith(wrongSuffix)) {
      const stem = c.slice(0, c.length - rightSuffix.length);
      if (t.startsWith(stem.slice(0, Math.max(2, stem.length - 1)))) {
        return {
          phenomenon: 'spelling',
          label: '词形错误',
          words: [correct, typed],
          explanation: `你写了 "${typed}"，正确是 "${correct}"（${desc}）。音可能听对了，但词尾形式有误。`,
          tip: `记住 "${correct}" 是${rightSuffix === 'ly' ? '副词' : '名词/形容词'}形式；遇到修饰动词的词时，优先考虑副词（-ly 结尾）。`,
        };
      }
    }
  }

  // 3. 代词替换（不在预定义对里）
  if (PRONOUN_WORDS.has(c) && PRONOUN_WORDS.has(t)) {
    return {
      phenomenon: 'phonetic_confusion',
      label: '人称代词混淆',
      words: [correct, typed],
      explanation: `你写了 "${typed}"，但正确是 "${correct}"。在快速语流中人称代词容易混淆，尤其是弱读时。`,
      tip: `重听时关注上下文：谁是动作的主语或宾语？`,
    };
  }

  // 4. 编辑距离接近 → 拼写
  const dist = levenshteinDistance(c, t);
  if (dist <= 1) {
    return {
      phenomenon: 'spelling',
      label: '拼写错误',
      words: [correct, typed],
      explanation: `你写了 "${typed}"，正确答案是 "${correct}"，差一个字母——音可能听对了，但拼写有误。`,
      tip: `注意 "${correct}" 的完整拼写，可课后单独记忆。`,
    };
  }
  if (dist <= 2) {
    return {
      phenomenon: 'phonetic_confusion',
      label: '音近词混淆',
      words: [correct, typed],
      explanation: `你写了 "${typed}"，正确是 "${correct}"，两者读音相近，连读时更难区分。`,
      tip: `单独朗读这两个词，感受发音差异，再放回句子里听。`,
    };
  }

  // 5. 通用替换
  return {
    phenomenon: 'general',
    label: '词语替换',
    words: [correct, typed],
    explanation: `你写了 "${typed}"，正确是 "${correct}"，可能在快速语流中将两者混淆。`,
    tip: `重听这一段，把注意力集中在 "${correct}" 出现的位置。`,
  };
};

export const predictErrorReason = (diffs: Diff[]): FeedbackItem[] => {
  const items: FeedbackItem[] = [];
  const events = toDiffEvents(diffs);

  const usedMissing = new Set<string>();
  const usedExtra = new Set<string>();

  // 1. 替换事件（优先处理，避免被漏词/多词规则拆开）
  events.forEach(ev => {
    if (ev.kind !== 'subst') return;
    const origWords = ev.original.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    const typedWords = ev.typed.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));

    if (origWords.length === 1 && typedWords.length === 1) {
      // 单词替换 → 分类
      items.push(classifySubstitution(origWords[0], typedWords[0]));
      usedMissing.add(origWords[0].toLowerCase());
      usedExtra.add(typedWords[0].toLowerCase());
    } else {
      // 多词替换 → 标记使用，后续统一处理
      origWords.forEach(w => usedMissing.add(w.toLowerCase()));
      typedWords.forEach(w => usedExtra.add(w.toLowerCase()));
      // 判断是否属于"听到了部分词、漏掉了剩余词"的固定搭配截断
      const typedLower = typedWords.map(w => w.toLowerCase());
      const partialMatch = origWords.some(w =>
        typedLower.some(t => levenshteinDistance(w.toLowerCase(), t) <= 1)
      );
      const missedPart = origWords.filter(w =>
        !typedLower.some(t => levenshteinDistance(w.toLowerCase(), t) <= 1)
      );
      // 检测 N-linking 连读：an + 元音词 → a + n词（如 "an ear" → "a near"）
      const isNLinking = (
        origWords.length === 2 && typedWords.length === 2 &&
        origWords[0].toLowerCase() === 'an' &&
        typedWords[0].toLowerCase() === 'a' &&
        typedWords[1].toLowerCase() === 'n' + origWords[1].toLowerCase()
      );
      if (isNLinking) {
        items.push({
          phenomenon: 'connected_speech',
          label: '连读音变（N-linking）',
          words: origWords,
          explanation: `"an ear" 连读时，"an" 末尾的 /n/ 会滑向下一个词，听起来像 "a near"。这是英语中非常典型的 N-linking（辅音连读）现象。`,
          tip: `遇到 "an + 元音开头的词" 时（如 an apple、an orange、an ear），留意这个连读规律——/n/ 属于 "an"，不是下个词的开头。`,
        });
      } else if (partialMatch && missedPart.length > 0) {
        items.push({
          phenomenon: 'connected_speech',
          label: '搭配词漏听',
          words: origWords,
          explanation: `"${ev.original}" 是一个固定搭配或词组，你捕捉到了其中一部分，但漏掉了 "${missedPart.join(' ')}"。语流中词组常被连在一起读，边界模糊。`,
          tip: `重听时把 "${ev.original}" 当成一个整体意群来感知，而不是逐词辨别。`,
        });
      } else {
        items.push({
          phenomenon: 'phonetic_confusion',
          label: '词组替换',
          words: [...origWords, ...typedWords],
          explanation: `你写了 "${ev.typed}"，正确是 "${ev.original}"，可能是在语流中对这段内容产生了误判。`,
          tip: `重听这一段，放慢速度逐词确认。`,
        });
      }
    }
  });

  // 收集剩余漏词/多词（非替换）
  const missingWords: string[] = [];
  const extraWords: string[] = [];
  events.forEach(ev => {
    if (ev.kind === 'missing') {
      ev.text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
        .filter(w => !usedMissing.has(w.toLowerCase()))
        .forEach(w => missingWords.push(w));
    } else if (ev.kind === 'extra') {
      ev.text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
        .filter(w => !usedExtra.has(w.toLowerCase()))
        .forEach(w => extraWords.push(w));
    }
  });

  // 2. 助动词漏听
  const missedAux = missingWords.filter(
    w => AUXILIARY_WORDS.has(w.toLowerCase()) && !usedMissing.has(w.toLowerCase())
  );
  if (missedAux.length > 0) {
    missedAux.forEach(w => usedMissing.add(w.toLowerCase()));
    items.push({
      phenomenon: 'auxiliary',
      label: '助动词漏听',
      words: missedAux,
      explanation: `助动词 "${missedAux.join('、')}" 在口语中通常弱化为极轻的短促音（如 are → /ə/），紧贴相邻词，很容易被大脑自动过滤。`,
      tip: `再听时把注意力放在"${missedAux[0]}"出现的位置，感受那个轻微的气流或元音。`,
    });
  }

  // 3. 弱读词漏听（冠词/介词/连词）
  const missedWeak = missingWords.filter(
    w => WEAK_FORM_WORDS.has(w.toLowerCase()) && !usedMissing.has(w.toLowerCase())
  );
  if (missedWeak.length > 0) {
    missedWeak.forEach(w => usedMissing.add(w.toLowerCase()));
    items.push({
      phenomenon: 'weak_form',
      label: '弱读词漏听',
      words: missedWeak,
      explanation: `"${missedWeak.join('、')}" 是典型的弱读词，在连贯语流中发音极短，常被省略为 /ə/ 或直接与相邻词连在一起。`,
      tip: `不必强求每个弱读词都听得很清，但要知道它们"存在"。再听时预判句子结构，遇到名词/动词前可能有冠词或介词。`,
    });
  }

  // 4. 连续多词 / 单词漏听
  const remainMissing = missingWords.filter(w => !usedMissing.has(w.toLowerCase()));
  if (remainMissing.length >= 2) {
    const hasChunk = diffs.some(([type, text]) => {
      if (type !== 1) return false;
      return text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length >= 2;
    });
    remainMissing.forEach(w => usedMissing.add(w.toLowerCase()));
    items.push(hasChunk ? {
      phenomenon: 'connected_speech',
      label: '连读语块漏听',
      words: remainMissing,
      explanation: `"${remainMissing.join(' ')}" 这几个词在语流中被连读成一个语块，整体发音与逐词读法差异较大，导致整段漏听。`,
      tip: `把语速调到 0.75x，专门听这段。先理解语块整体的意思，再逐词辨认。`,
    } : {
      phenomenon: 'chunk_missing',
      label: '多词漏听',
      words: remainMissing,
      explanation: `漏掉了 ${remainMissing.length} 个词（"${remainMissing.join('、')}"），可能是语速较快时注意力短暂分散。`,
      tip: `把语速调低，分两段练习：先听句子前半段，确认正确后再听后半段。`,
    });
  } else if (remainMissing.length === 1) {
    const w = remainMissing[0];
    usedMissing.add(w.toLowerCase());
    items.push({
      phenomenon: 'general',
      label: '单词漏听',
      words: [w],
      explanation: `漏掉了 "${w}"，可能是这个词与相邻词连读时边界不清晰。`,
      tip: `再听时在预期位置主动等待这个词出现。`,
    });
  }

  // 5. 多写词（无法配对的 extra）
  const remainExtra = extraWords.filter(w => !usedExtra.has(w.toLowerCase()));
  if (remainExtra.length > 0) {
    items.push({
      phenomenon: 'extra_word',
      label: '多写了词',
      words: remainExtra,
      explanation: `写了原文没有的词 "${remainExtra.join('、')}"，可能是根据上下文语义猜测填入，而非实际听到。`,
      tip: `听写时忠实于"听到的声音"，减少语义推断，有疑问宁可留空。`,
    });
  }

  return items;
};


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

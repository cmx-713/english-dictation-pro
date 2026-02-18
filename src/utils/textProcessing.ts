export interface Sentence {
  id: string;
  text: string;
  startTime?: number; // For audio alignment if we had it
  endTime?: number;
  userAnswer?: string;
  isCompleted: boolean;
}

// 智能分句：根据标点和意群分割文本
export const splitTextIntoSentences = (text: string): Sentence[] => {
  if (!text) return [];

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
    if (shouldSplitByMeaningGroup(sentence)) {
      const chunks = splitByMeaningGroup(sentence);
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
const shouldSplitByMeaningGroup = (sentence: string): boolean => {
  const wordCount = sentence.split(/\s+/).length;
  const charCount = sentence.length;
  // 超过12个单词或80个字符的句子需要分割（降低阈值，更积极地分割）
  return wordCount > 12 || charCount > 80;
};

// 按意群分割长句子
const splitByMeaningGroup = (sentence: string): string[] => {
  // 1. 定义分割符：标点符号 + 常见连词
  // regex: 分割标点 [,;:] 
  const separatorRegex = /([,;:])/;

  // 初步分割
  let initialSegments = sentence.split(separatorRegex);

  // 重新组合，将分割符附着在前一个片段上
  let mergedSegments: string[] = [];
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

  // 2. 如果片段仍然过长，尝试按连词分割
  let splitByConjunctions: string[] = [];
  // 匹配常见连词 (前面必须有空格)
  // 增加更多连接词，提高分割能力
  const conjunctions = /\s+(because|although|however|since|while|therefore|nevertheless|if|unless|but|and|or|so)\b/i;

  mergedSegments.forEach(seg => {
    // 如果片段长于10个词，且包含连词
    if (seg.split(/\s+/).length > 10 && conjunctions.test(seg)) {
      // 使用特殊标记分割
      const splitMarker = '|||';
      // 注意：简单的 replace 可能会破坏包含连词的单词，但 used \b boundary above
      // 为避免破坏 "bread and butter" 这种短结构，我们仅在连词前后有足够上下文时分割
      // 但 regex 已经限制了 \s+ ... \b
      const safeSeg = seg.replace(conjunctions, (match) => `${splitMarker}${match}`);
      const sub = safeSeg.split(splitMarker).filter(s => s.trim());
      splitByConjunctions.push(...sub);
    } else {
      splitByConjunctions.push(seg);
    }
  });

  // 3. 智能合并过短的片段
  const optimizedChunks: string[] = [];
  let currentChunk = '';

  splitByConjunctions.forEach(seg => {
    // 移除可能的前导标点（虽然一般附着在上一段，但防止万一）
    const cleanSeg = seg.trim();
    if (!cleanSeg) return;

    const combined = currentChunk ? `${currentChunk} ${cleanSeg}` : cleanSeg;
    const segWordCount = cleanSeg.split(/\s+/).length;

    // 判断是否以标点结尾
    const endsWithPunctuation = /[,;:]$/.test(currentChunk);

    if (!currentChunk) {
      currentChunk = cleanSeg;
    } else if (
      // 如果当前累积片段很短 (<5词)
      currentChunk.split(/\s+/).length < 5 ||
      // 或者当前片段是以连词开头的短句 (<8词)，且前一段没有标点结尾（连贯的）
      (segWordCount < 8 && !endsWithPunctuation)
    ) {
      // 合并
      currentChunk = combined;
    } else {
      // 输出当前片段，开始新片段
      optimizedChunks.push(currentChunk);
      currentChunk = cleanSeg;
    }
  });
  if (currentChunk) optimizedChunks.push(currentChunk);

  // 4. 最后检查：如果还是有超长片段（>20词），强制按长度分割
  const result: string[] = [];
  optimizedChunks.forEach(chunk => {
    if (chunk.split(/\s+/).length > 20) {
      const words = chunk.split(/\s+/);
      // 每 12 个词一组
      for (let i = 0; i < words.length; i += 12) {
        const slice = words.slice(i, i + 12).join(' ');
        if (slice) result.push(slice);
      }
    } else {
      result.push(chunk);
    }
  });

  return result.filter(s => s.trim().length > 0);
};

import { SentenceResult } from '../components/PracticeScreen';

// 错误统计接口
export interface ErrorStats {
    A: ErrorCategory;
    B: ErrorCategory;
    C: ErrorCategory;
    D: ErrorCategory;
}

export interface ErrorCategory {
    total: number;
    subtypes: {
        [key: string]: {
            count: number;
            trend: 'up' | 'down' | 'flat' | 'new' | 'good' | 'alert';
            label: string;
            desc: string;
        }
    }
}

// 词汇库定义
const VOCAB = {
    // A类：漏词相关
    articles: ['a', 'an', 'the'],
    prepositions: ['in', 'on', 'at', 'of', 'for', 'with', 'by', 'to', 'from', 'up', 'down', 'about', 'into', 'over', 'after', 'before', 'under', 'between', 'among', 'through', 'during', 'without', 'within', 'around', 'near', 'off', 'above', 'below'],
    conjunctions: ['and', 'but', 'or', 'so', 'because', 'if', 'that', 'when', 'while', 'although', 'though', 'unless', 'since', 'as', 'where', 'whether', 'until'],
    pronouns: ['he', 'she', 'it', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves', 'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what'],
    auxiliaries: ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'should', 'would'],

    // B类：弱读/缩读
    weakForms: ['to', 'of', 'and', 'that', 'but', 'as', 'than', 'at', 'for', 'from', 'was', 'were', 'do', 'does', 'can', 'could', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'must'],
};

// 工具函数：计算 Levenshtein 距离
const levenshteinDistance = (str1: string, str2: string): number => {
    const track = Array(str2.length + 1).fill(null).map(() =>
        Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) { track[0][i] = i; }
    for (let j = 0; j <= str2.length; j += 1) { track[j][0] = j; }
    for (let j = 1; j <= str2.length; j += 1) {
        for (let i = 1; i <= str1.length; i += 1) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator, // substitution
            );
        }
    }
    return track[str2.length][str1.length];
};

// 辅助函数：根据统计数据更新计数
const increment = (stats: ErrorStats, category: keyof ErrorStats, subtype: string) => {
    // @ts-ignore
    if (stats[category] && stats[category].subtypes[subtype]) {
        stats[category].total++;
        // @ts-ignore
        stats[category].subtypes[subtype].count++;
    }
};

// 分析一对一的替换
const analyzeSubstitution = (stats: ErrorStats, original: string, user: string) => {
    // 1. D2 单复数 (word <-> words)
    if (original + 's' === user || user + 's' === original ||
        original + 'es' === user || user + 'es' === original ||
        (original.endsWith('y') && original.slice(0, -1) + 'ies' === user)) {
        increment(stats, 'D', 'D2');
        return;
    }

    // 2. D1 时态 (ed, d) - 简单判断
    if ((original.endsWith('ed') && !user.endsWith('ed')) ||
        (!original.endsWith('ed') && user.endsWith('ed'))) {
        increment(stats, 'D', 'D1');
        return;
    }

    // 3. B5 缩读误解 (should've <-> should have)
    if (original.includes("'") !== user.includes("'")) {
        increment(stats, 'B', 'B5');
        return;
    }

    // 4. B4 尾音丢失 (Original 包含 User 且只差尾部字符)
    if (original.startsWith(user) && original.length > user.length) {
        // 比如 start -> star
        increment(stats, 'B', 'B4');
        return;
    }

    // 5. C1 拼写错误 (编辑距离很小)
    const dist = levenshteinDistance(original, user);
    const len = Math.max(original.length, user.length);
    // 允许 1-2 个字母错误
    if (dist === 1 || (dist === 2 && len > 5)) {
        increment(stats, 'C', 'C1');
        return;
    }

    // 6. B3 同音混淆 (这就是个兜底，如果长得不像但被替换了，可能是听错了)
    // 假设未命中以上规则的替换都是听力混淆
    increment(stats, 'B', 'B3');
};

const calculateTrends = (stats: ErrorStats, totalSentences: number) => {
    Object.values(stats).forEach(cat => {
        Object.values(cat.subtypes).forEach((sub: any) => {
            const ratio = totalSentences > 0 ? sub.count / totalSentences : 0;

            // 模拟趋势逻辑
            if (sub.count === 0) {
                sub.trend = 'good';
            } else if (ratio > 0.5 || sub.count >= 3) {
                // 错误率高 -> 重点关注
                sub.trend = 'alert';
            } else if (sub.count === 1) {
                // 偶尔一次 -> 持平
                sub.trend = 'flat';
            } else {
                // 比如 2 次 -> 上升?
                // 为了演示效果，我们简单交替一下，或者默认 up
                sub.trend = Math.random() > 0.5 ? 'up' : 'down';
            }
        });
    });
};

// 主分析函数
export const analyzeErrors = (results: SentenceResult[]): ErrorStats => {
    const stats: ErrorStats = {
        A: {
            total: 0, subtypes: {
                A1: { count: 0, trend: 'flat', label: '漏冠词', desc: 'Missed Articles' },
                A2: { count: 0, trend: 'flat', label: '漏介词', desc: 'Missed Prepositions' },
                A3: { count: 0, trend: 'flat', label: '漏连词', desc: 'Missed Conjunctions' },
                A4: { count: 0, trend: 'flat', label: '漏代词', desc: 'Missed Pronouns' },
                A5: { count: 0, trend: 'flat', label: '漏助动词', desc: 'Missed Auxiliaries' }
            }
        },
        B: {
            total: 0, subtypes: {
                B1: { count: 0, trend: 'flat', label: '连读误判', desc: 'Linking' },
                B2: { count: 0, trend: 'flat', label: '弱读误判', desc: 'Weak Forms' },
                B3: { count: 0, trend: 'flat', label: '同音混淆', desc: 'Homophones' },
                B4: { count: 0, trend: 'flat', label: '尾音丢失', desc: 'End Sounds' },
                B5: { count: 0, trend: 'flat', label: '缩读误解', desc: 'Contractions' }
            }
        },
        C: {
            total: 0, subtypes: {
                C1: { count: 0, trend: 'flat', label: '单词拼错', desc: 'Spelling' },
                C2: { count: 0, trend: 'flat', label: '大小写错误', desc: 'Case' },
                C3: { count: 0, trend: 'flat', label: '标点缺失', desc: 'Punctuation' }
            }
        },
        D: {
            total: 0, subtypes: {
                D1: { count: 0, trend: 'flat', label: '时态错误', desc: 'Tense' },
                D2: { count: 0, trend: 'flat', label: '单复数错误', desc: 'Plurality' },
                D3: { count: 0, trend: 'flat', label: '主谓不一致', desc: 'Agreement' }
            }
        }
    };

    results.forEach(result => {
        const diffs = result.diffs;

        // 检查标点缺失 (C3)
        const hasMissingPunctuation = diffs.some(d => d[0] === 1 && /[.,?!]/.test(d[1]));
        if (hasMissingPunctuation) increment(stats, 'C', 'C3');

        // 检查大小写 (C2) - 简单的对比
        if (result.original.toLowerCase() === result.userAnswer.toLowerCase() && result.original !== result.userAnswer) {
            // 只有在没有其他错误时才确定是 C2
            const letterDiffs = diffs.filter(d => d[0] !== 0 && /[a-zA-Z]/.test(d[1]));
            if (letterDiffs.length === 0) {
                if (/[A-Z]/.test(result.original) && result.userAnswer.length > 0) {
                    if (result.original[0] !== result.userAnswer[0] &&
                        result.original[0].toLowerCase() === result.userAnswer[0].toLowerCase()) {
                        increment(stats, 'C', 'C2');
                    }
                }
            }
        }

        // 遍历 diffs 分析单词错误
        for (let i = 0; i < diffs.length; i++) {
            const [type, text] = diffs[i];

            // 我们只关注单词
            const words = text.toLowerCase().match(/[a-z']+/g);
            if (!words) continue;

            // 【Type 1: 漏词】 (Original 有, User 没有)
            if (type === 1) {
                // 检查是否是一组替换 (Substitution)
                let isSubstitution = false;
                let userTexts: string[] = [];

                if (i + 1 < diffs.length && diffs[i + 1][0] === -1) {
                    const nextText = diffs[i + 1][1];
                    const nextWords = nextText.toLowerCase().match(/[a-z']+/g);
                    if (nextWords && nextWords.length > 0) {
                        isSubstitution = true;
                        userTexts = nextWords;
                    }
                }

                words.forEach((word: string, idx: number) => {
                    let handled = false;

                    if (isSubstitution) {
                        // 取对应的 userWord
                        const userWord = userTexts[idx] || userTexts[0];
                        if (userWord) {
                            analyzeSubstitution(stats, word, userWord);
                            handled = true;
                        }
                    }

                    if (!handled) {
                        // 纯漏词分析
                        if (VOCAB.articles.includes(word)) { increment(stats, 'A', 'A1'); }
                        else if (VOCAB.prepositions.includes(word)) { increment(stats, 'A', 'A2'); }
                        else if (VOCAB.conjunctions.includes(word)) { increment(stats, 'A', 'A3'); }
                        else if (VOCAB.pronouns.includes(word)) { increment(stats, 'A', 'A4'); }
                        else if (VOCAB.auxiliaries.includes(word)) { increment(stats, 'A', 'A5'); }
                        else if (VOCAB.weakForms.includes(word)) { increment(stats, 'B', 'B2'); }
                        else {
                            increment(stats, 'B', 'B1');
                        }
                    }
                });

                // 如果是替换，跳过下一个 -1
                if (isSubstitution) {
                    i++;
                }
            }

            // 【Type -1: 多词】 (User 有, Original 没有)
            else if (type === -1) {
                // 纯多词归为 B1
                increment(stats, 'B', 'B1');
            }
        }
    });

    // 计算趋势和状态
    calculateTrends(stats, results.length);

    return stats;
};

/**
 * LLM 驱动的逐句听写反馈
 * 调用 ai-chat Edge Function（DeepSeek），返回结构化 FeedbackItem[]。
 * 失败时抛出异常，由调用方决定降级策略。
 */

import type { FeedbackItem } from './diffLogic';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

const SYSTEM_PROMPT = `你是专业英语听力教师，负责分析学生听写时犯的具体错误。

请根据「原文」和「学生写的内容」，找出所有错误，以 JSON 数组格式返回分析结果。
只返回 JSON 数组，不要包含任何其他文字、标题或代码块标记。

数组中每个错误对应一个对象，格式如下：
{
  "phenomenon": "phenomenon_code",
  "label": "简短中文标签（4字以内）",
  "words": ["正确的词", "学生写的词"],
  "explanation": "结合这句话的具体语音环境解释难点（连读位置、弱读程度、相邻词的影响等），禁止使用"辨识不敏感"、"没有注意"、"容易忽略"等空泛表述",
  "tip": "一个可立即执行的具体方法（如：用语法判断单复数、听/z/与下一词的连读、放慢0.75x专听词尾），禁止使用"多注意"、"仔细听"等无操作性的建议"
}

phenomenon_code 必须是以下之一：
- weak_form        → 弱读词漏听（冠词/介词/连词等）
- auxiliary        → 助动词漏听
- connected_speech → 连读/吞音/N-linking 导致误听
- phonetic_confusion → 音近词混淆（如 ship/sheep、than/that、most/mostly）
- spelling         → 拼写/词形错误（音听对了但写错，如 probable→probably）
- chunk_missing    → 多词连续漏听
- extra_word       → 多写了原文没有的词
- general          → 其他难以归类的错误

写 explanation 的要求（必须满足其中一项）：
A. 说明该词在这句话中的具体发音变化（如：-s 在 "sounds of" 中与 of 连读成 /z-ɒ/，尾音被淹没）
B. 说明相邻词如何干扰了这个词的感知（如：'an adult' 中 /n/ 滑向 adult，听起来像 'a-nadult'）
C. 说明语速/位置如何导致误听（如：句末弱位置、语速加快后某音节被吞掉）

写 tip 的要求：
- 必须给出一个具体动作，例如"用语法推断：the + 名词 + of 结构通常是复数"
- 或给出一个对比方法，例如"单独听 'mostly' 和 'most' 的区别：前者有两个音节 /moʊst-li/"
- 不得只说"注意X"或"仔细辨别X"

其他注意事项：
1. 如果学生写得完全正确，返回 []
2. 标点和大小写不算错误，不要反馈
3. words 数组先写正确词，再写学生写的词，每个词只写一次，不要重复
4. 数字的文字写法（ten）和阿拉伯数字（10）视为相同，不算错误`;

/**
 * 解析 LLM 返回的文本，提取 JSON 数组
 */
function parseFeedbackJson(raw: string): FeedbackItem[] {
  // 去掉可能包裹的 markdown code block
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  // 过滤无效项，确保字段完整；并对 words 去重
  return parsed
    .filter(
      (item) =>
        item &&
        typeof item.phenomenon === 'string' &&
        typeof item.label === 'string' &&
        Array.isArray(item.words) &&
        typeof item.explanation === 'string' &&
        typeof item.tip === 'string'
    )
    .map((item) => ({
      ...item,
      words: [...new Set((item.words as string[]).map((w: string) => w.toLowerCase()))],
    })) as FeedbackItem[];
}

/**
 * 调用 LLM 生成逐句听力反馈
 * @param original  原文句子
 * @param studentInput 学生输入
 * @returns FeedbackItem[]，或抛出异常
 */
export async function getLlmFeedback(
  original: string,
  studentInput: string
): Promise<FeedbackItem[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase 未配置，无法调用 LLM 反馈');
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/ai-chat`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `原文：${original.trim()}\n学生写的：${studentInput.trim()}`,
        },
      ],
      stream: false,
      temperature: 0.2, // 低温度保证输出格式稳定
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ai-chat ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('LLM 返回内容为空');

  return parseFeedbackJson(content);
}

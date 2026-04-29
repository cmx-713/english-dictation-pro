// =====================================================================
// 智能教学建议引擎
// 双模式：规则模板（LLM_ENABLED=false）/ LLM 增强（LLM_ENABLED=true）
// =====================================================================
import { supabase } from '../lib/supabase';

export interface TeachingInput {
  className: string;
  /** 错因分布 */
  errorProfile: { A: number; B: number; C: number; D: number; total: number };
  /** 作业完成率 0-100，null 表示无作业 */
  assignmentCompletionRate: number | null;
  /** 作业平均正确率，null 表示无数据 */
  assignmentAvgAccuracy: number | null;
  /** 最近 7 天练习次数趋势 */
  recentTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  /** 班级平均正确率 */
  avgAccuracy: number | null;
  /** 近 7 天总练习次数 */
  weeklyPracticeCount: number;
}

export interface TeachingSuggestion {
  /** 本地临时 id（未保存时为空） */
  id?: string;
  className: string;
  generatedAt: string;
  /** 'rule' = 规则生成；'llm' = LLM 生成 */
  source: 'rule' | 'llm';
  /** 一句话总结 */
  summary: string;
  /** 本周优先讲解点（2-3 条） */
  priorityPoints: string[];
  /** 课堂活动建议（1-2 条） */
  classroomActivities: string[];
  /** 课后作业建议（1-2 条） */
  homeworkSuggestions: string[];
  /** 执行状态 */
  status?: 'generated' | 'adopted' | 'ignored';
  adoptedAt?: string;
  /** 采纳时的班级基线正确率 */
  baselineAccuracy?: number | null;
  /** 效果检查时的班级正确率 */
  followupAccuracy?: number | null;
  effectCheckedAt?: string;
  /** 进步幅度（followup - baseline） */
  accuracyDelta?: number | null;
}

// =====================================================================
// 数据库操作（teaching_suggestions 表）
// =====================================================================

/** 将生成的建议保存到 Supabase，返回带 id 的建议 */
export async function saveSuggestion(
  suggestion: TeachingSuggestion
): Promise<TeachingSuggestion> {
  const weekLabel = getWeekLabel(new Date());
  const { data, error } = await supabase
    .from('teaching_suggestions')
    .insert({
      class_name: suggestion.className,
      generated_at: suggestion.generatedAt,
      source: suggestion.source,
      week_label: weekLabel,
      summary: suggestion.summary,
      priority_points: suggestion.priorityPoints,
      classroom_activities: suggestion.classroomActivities,
      homework_suggestions: suggestion.homeworkSuggestions,
      status: 'generated',
    })
    .select('id')
    .single();

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('does not exist') || msg.includes('permission') || msg.includes('security')) {
      // 表未初始化时，静默降级（本地模式）
      console.warn('[TeachingSuggestion] 表未初始化，本地模式运行');
      return suggestion;
    }
    throw error;
  }
  return { ...suggestion, id: data?.id, status: 'generated' };
}

/** 采纳建议：更新状态 + 记录基线正确率 */
export async function adoptSuggestion(
  id: string,
  baselineAccuracy: number | null
): Promise<void> {
  const { error } = await supabase
    .from('teaching_suggestions')
    .update({
      status: 'adopted',
      adopted_at: new Date().toISOString(),
      baseline_accuracy: baselineAccuracy,
    })
    .eq('id', id);
  if (error) throw error;
}

/** 忽略建议 */
export async function ignoreSuggestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('teaching_suggestions')
    .update({ status: 'ignored', ignored_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** 检查效果：记录 followup 正确率并计算 delta */
export async function checkEffect(
  id: string,
  followupAccuracy: number | null,
  baselineAccuracy: number | null
): Promise<number | null> {
  const delta =
    followupAccuracy != null && baselineAccuracy != null
      ? Math.round((followupAccuracy - baselineAccuracy) * 10) / 10
      : null;
  const { error } = await supabase
    .from('teaching_suggestions')
    .update({
      followup_accuracy: followupAccuracy,
      effect_checked_at: new Date().toISOString(),
      accuracy_delta: delta,
    })
    .eq('id', id);
  if (error) throw error;
  return delta;
}

/** 加载某班历史建议（最近 20 条，含所有状态） */
export async function loadSuggestionsForClass(
  className: string
): Promise<TeachingSuggestion[]> {
  const { data, error } = await supabase
    .from('teaching_suggestions')
    .select('*')
    .eq('class_name', className)
    .order('generated_at', { ascending: false })
    .limit(20);

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('does not exist') || msg.includes('permission') || msg.includes('security')) return [];
    throw error;
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    className: row.class_name as string,
    generatedAt: row.generated_at as string,
    source: (row.source ?? 'rule') as 'rule' | 'llm',
    summary: row.summary as string,
    priorityPoints: (row.priority_points as string[]) || [],
    classroomActivities: (row.classroom_activities as string[]) || [],
    homeworkSuggestions: (row.homework_suggestions as string[]) || [],
    status: (row.status ?? 'generated') as TeachingSuggestion['status'],
    adoptedAt: row.adopted_at as string | undefined,
    baselineAccuracy: row.baseline_accuracy as number | null,
    followupAccuracy: row.followup_accuracy as number | null,
    effectCheckedAt: row.effect_checked_at as string | undefined,
    accuracyDelta: row.accuracy_delta as number | null,
  }));
}

// =====================================================================
// 工具函数
// =====================================================================

function getWeekLabel(date: Date): string {
  const year = date.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// =====================================================================
// 辅助常量
// =====================================================================

const ERROR_LABELS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '语音辨音',
  B: '词汇拼写',
  C: '语法句式',
  D: '语义理解',
};

const ACTIVITY_MAP: Record<'A' | 'B' | 'C' | 'D', { classroom: string; homework: string }> = {
  A: {
    classroom: '课堂跟读对比练习（最小对立对 minimal pairs），专项训练元音/辅音混淆音',
    homework: '布置"连读与弱读"专项素材，要求学生完成后截图错误句上交',
  },
  B: {
    classroom: '词汇拼写抢答赛：教师口述单词，学生快速拼写并展示',
    homework: '布置高频错词"默写-订正"作业，建议选取本周出错率前 10 词汇',
  },
  C: {
    classroom: '语法句式填空练习：聚焦冠词、介词、时态等高频错误，课堂小组互评',
    homework: '布置含目标句式的素材，要求学生重点关注功能词听写正确率',
  },
  D: {
    classroom: '二次精听练习：播放 2 遍后复述大意，训练语义理解与上下文推断',
    homework: '布置词汇量适中的新材料，要求学生课后独立完成并反思理解偏差',
  },
};

// =====================================================================
// 规则引擎
// =====================================================================

function ruleBasedSuggestion(input: TeachingInput): TeachingSuggestion {
  const { errorProfile, assignmentCompletionRate, assignmentAvgAccuracy, recentTrend, avgAccuracy } = input;

  // 找出最高占比的错误类型
  const cats = (['A', 'B', 'C', 'D'] as const).filter(() => errorProfile.total > 0);
  const sorted = cats.sort(
    (a, b) => (errorProfile[b] / errorProfile.total) - (errorProfile[a] / errorProfile.total)
  );
  const top1 = sorted[0] ?? 'B';
  const top2 = sorted[1] ?? 'A';
  const top1Pct = errorProfile.total > 0 ? Math.round((errorProfile[top1] / errorProfile.total) * 100) : 0;
  const top2Pct = errorProfile.total > 0 ? Math.round((errorProfile[top2] / errorProfile.total) * 100) : 0;

  // 完成率评价
  const completionNote =
    assignmentCompletionRate === null ? ''
    : assignmentCompletionRate < 40 ? `（注意：本班作业完成率仅 ${assignmentCompletionRate}%，建议课堂跟进动员）`
    : assignmentCompletionRate < 70 ? `（作业完成率 ${assignmentCompletionRate}%，有提升空间）`
    : `（作业完成率 ${assignmentCompletionRate}%，表现良好）`;

  // 趋势评价
  const trendNote =
    recentTrend === 'improving' ? '近期练习正确率呈上升趋势，继续保持。'
    : recentTrend === 'declining' ? '⚠ 近期正确率有所下滑，需加强练习频率。'
    : recentTrend === 'stable' ? '近期练习数据较稳定。'
    : '';

  // 正确率评价
  const accuracyNote =
    avgAccuracy === null ? ''
    : avgAccuracy >= 85 ? `班级平均正确率 ${avgAccuracy}%，整体水平良好。`
    : avgAccuracy >= 70 ? `班级平均正确率 ${avgAccuracy}%，中等水平，仍有提升空间。`
    : `班级平均正确率仅 ${avgAccuracy}%，建议适当降低素材难度或增加讲练结合。`;

  const priorityPoints: string[] = [];
  if (errorProfile.total > 0) {
    priorityPoints.push(
      `重点讲解"${ERROR_LABELS[top1]}"类错误（占本周所有错误的 ${top1Pct}%），常见问题包括${top1 === 'A' ? '元音混淆、连读漏听' : top1 === 'B' ? '单词拼写与形态变化' : top1 === 'C' ? '冠词/介词/时态细节' : '关键词遗漏与语义推断'}`
    );
    if (top2Pct >= 20) {
      priorityPoints.push(
        `次要关注"${ERROR_LABELS[top2]}"类错误（占 ${top2Pct}%），可结合${top2 === 'A' ? '跟读练习' : top2 === 'B' ? '词汇复习' : top2 === 'C' ? '句式操练' : '精听训练'}在课堂穿插训练`
      );
    }
  } else {
    priorityPoints.push('暂无本周错因数据，建议鼓励学生完成更多练习以获取分析依据');
  }
  if (trendNote) priorityPoints.push(trendNote);
  if (accuracyNote) priorityPoints.push(accuracyNote);

  const activities = ACTIVITY_MAP[top1];
  const classroomActivities = [activities.classroom];
  if (assignmentCompletionRate !== null && assignmentCompletionRate < 60) {
    classroomActivities.push('课堂开始前留 5 分钟展示上次作业优秀学生名单，增强正向激励');
  }

  const homeworkSuggestions = [activities.homework];
  if (assignmentAvgAccuracy !== null && assignmentAvgAccuracy < 70) {
    homeworkSuggestions.push(
      `上次作业平均正确率 ${assignmentAvgAccuracy}%，建议本次作业选择难度略低一档的素材，帮助学生建立信心`
    );
  }

  const summary =
    errorProfile.total > 0
      ? `本班本周主要弱项为"${ERROR_LABELS[top1]}"（${top1Pct}%），${completionNote ? `作业完成情况${completionNote.replace(/[（）]/g, '')}，` : ''}建议课堂重点讲练。`
      : `本班本周暂无足够错因数据，建议持续收集后再制定专项计划。`;

  return {
    className: input.className,
    generatedAt: new Date().toISOString(),
    source: 'rule',
    summary,
    priorityPoints,
    classroomActivities,
    homeworkSuggestions,
  };
}

// =====================================================================
// LLM 引擎
// =====================================================================

async function llmBasedSuggestion(input: TeachingInput): Promise<TeachingSuggestion> {
  const apiKey = localStorage.getItem('user_ai_api_key');
  if (!apiKey) throw new Error('未配置 API Key，请在 AI 助教中先填写 Key');

  const errorSummary =
    input.errorProfile.total === 0
      ? '暂无错因数据'
      : (['A', 'B', 'C', 'D'] as const)
          .map(k => `${ERROR_LABELS[k]}(${input.errorProfile[k]}次, ${Math.round((input.errorProfile[k] / input.errorProfile.total) * 100)}%)`)
          .join('、');

  const prompt = `你是一位专业的大学英语教师，请根据以下班级数据为"${input.className}"班生成本周教学建议：

【错因分布】${errorSummary}（共 ${input.errorProfile.total} 个错误）
【班级平均正确率】${input.avgAccuracy != null ? input.avgAccuracy + '%' : '暂无'}
【作业完成率】${input.assignmentCompletionRate != null ? input.assignmentCompletionRate + '%' : '暂无作业'}
【作业平均正确率】${input.assignmentAvgAccuracy != null ? input.assignmentAvgAccuracy + '%' : '暂无'}
【近期趋势】${input.recentTrend === 'improving' ? '上升' : input.recentTrend === 'declining' ? '下降' : input.recentTrend === 'stable' ? '稳定' : '未知'}
【本周练习次数】${input.weeklyPracticeCount}

请严格按以下 JSON 格式输出（不要添加多余文字）：
{
  "summary": "一句话班级诊断（30字以内）",
  "priorityPoints": ["讲解点1", "讲解点2", "讲解点3"],
  "classroomActivities": ["活动1", "活动2"],
  "homeworkSuggestions": ["作业建议1", "作业建议2"]
}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API 请求失败：${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '';

  // 提取 JSON（LLM 有时会在前后加 markdown 代码块）
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM 返回格式异常，无法解析');

  const parsed = JSON.parse(jsonMatch[0]) as {
    summary: string;
    priorityPoints: string[];
    classroomActivities: string[];
    homeworkSuggestions: string[];
  };

  return {
    className: input.className,
    generatedAt: new Date().toISOString(),
    source: 'llm',
    summary: parsed.summary || '',
    priorityPoints: parsed.priorityPoints || [],
    classroomActivities: parsed.classroomActivities || [],
    homeworkSuggestions: parsed.homeworkSuggestions || [],
  };
}

// =====================================================================
// 公开接口
// =====================================================================

export const TEACHING_LLM_KEY = 'teaching_llm_enabled';

export function isLlmEnabled(): boolean {
  return localStorage.getItem(TEACHING_LLM_KEY) === 'true';
}

export function setLlmEnabled(enabled: boolean): void {
  localStorage.setItem(TEACHING_LLM_KEY, enabled ? 'true' : 'false');
}

/**
 * 生成教学建议。
 * LLM 失败时自动降级为规则引擎并在返回结果的 source 字段体现。
 */
export async function generateTeachingSuggestion(
  input: TeachingInput
): Promise<TeachingSuggestion> {
  if (isLlmEnabled()) {
    try {
      return await llmBasedSuggestion(input);
    } catch (err) {
      console.warn('[TeachingSuggestion] LLM 失败，回退规则引擎：', err);
      const rule = ruleBasedSuggestion(input);
      return { ...rule, source: 'rule' };
    }
  }
  return ruleBasedSuggestion(input);
}

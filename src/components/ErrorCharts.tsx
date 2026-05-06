/**
 * ErrorCharts
 * 听力错误可视化组件：
 *  1. 大类频次分布条形图（A/B/C/D，本次）
 *  2. 现象进步追踪（本次 vs 7天历史均值，仅对有历史数据的子类型展示）
 *  3. 子类型细节折叠表（保留原 ErrorStatsTable 信息）
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { ErrorStats } from '../utils/errorAnalysis';

interface WeeklyProfile {
  totalSessions: number;
  topErrors: Array<{ key: string; count: number; trend: 'up' | 'down' | 'flat' }>;
}

interface ErrorChartsProps {
  stats: ErrorStats;
  weeklyProfile: WeeklyProfile | null;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const CATEGORY_META = [
  { key: 'A', short: 'A 漏词', color: 'bg-red-400',    dimColor: 'bg-red-100',    textColor: 'text-red-700',    borderColor: 'border-red-200' },
  { key: 'B', short: 'B 辨音', color: 'bg-orange-400', dimColor: 'bg-orange-100', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
  { key: 'C', short: 'C 拼写', color: 'bg-amber-400',   dimColor: 'bg-amber-100',  textColor: 'text-amber-700',  borderColor: 'border-amber-200' },
  { key: 'D', short: 'D 语法', color: 'bg-blue-400',    dimColor: 'bg-blue-100',   textColor: 'text-blue-700',   borderColor: 'border-blue-200' },
] as const;

const SUBTYPE_LABEL: Record<string, string> = {
  A1: '漏冠词', A2: '漏介词', A3: '漏连词', A4: '漏代词', A5: '漏助动词',
  B1: '连读误判', B2: '弱读误判', B3: '同音混淆', B4: '尾音丢失', B5: '缩读误解',
  C1: '单词拼错', C2: '大小写', C3: '标点缺失',
  D1: '时态错误', D2: '单复数', D3: '主谓不一致',
};

// ── 子组件：大类条形图 ─────────────────────────────────────────────────────────

const CategoryBar: React.FC<{ short: string; count: number; maxCount: number; color: string; dimColor: string; textColor: string }> = ({
  short, count, maxCount, color, dimColor, textColor,
}) => {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 text-xs font-semibold text-slate-600 shrink-0 hidden sm:block">{short}</span>
      <span className="w-14 text-xs font-semibold text-slate-600 shrink-0 sm:hidden">{short}</span>
      <div className="flex-1 h-5 rounded-full overflow-hidden bg-slate-100 relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${count > 0 ? color : dimColor}`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className={`w-12 text-right text-xs font-bold shrink-0 ${count > 0 ? textColor : 'text-slate-400'}`}>
        {count} 次
      </span>
    </div>
  );
};

// ── 子组件：进步追踪行 ─────────────────────────────────────────────────────────

const ProgressRow: React.FC<{
  subtypeKey: string;
  current: number;
  histAvg: number;        // 历史每场均值（可带小数）
}> = ({ subtypeKey, current, histAvg }) => {
  const label = SUBTYPE_LABEL[subtypeKey] ?? subtypeKey;
  const max = Math.max(current, histAvg, 1);
  const currentPct = Math.round((current / max) * 100);
  const histPct   = Math.round((histAvg  / max) * 100);

  // 进步判定：本次比历史均值少 → 进步
  const improved = current < histAvg - 0.4;
  const regressed = current > histAvg + 0.4;

  return (
    <div className="py-2 border-b border-slate-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-700">
          <span className="mr-1 font-mono text-slate-400 text-[10px]">{subtypeKey}</span>
          {label}
        </span>
        <span className={`text-xs font-bold flex items-center gap-1 ${improved ? 'text-emerald-600' : regressed ? 'text-red-500' : 'text-slate-500'}`}>
          {improved
            ? <><TrendingDown size={12} /> 在进步</>
            : regressed
            ? <><TrendingUp size={12} /> 需关注</>
            : <><Minus size={12} /> 持平</>}
        </span>
      </div>
      {/* 双排柱 */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] text-slate-500 shrink-0">本次</span>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${improved ? 'bg-emerald-400' : regressed ? 'bg-red-400' : 'bg-slate-400'}`}
              style={{ width: `${Math.max(currentPct, current > 0 ? 6 : 0)}%` }}
            />
          </div>
          <span className="w-8 text-right text-[11px] font-bold text-slate-600 shrink-0">{current}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] text-slate-400 shrink-0">历史均</span>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-slate-300"
              style={{ width: `${Math.max(histPct, histAvg > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span className="w-8 text-right text-[11px] text-slate-400 shrink-0">{histAvg.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

// ── 主组件 ────────────────────────────────────────────────────────────────────

export const ErrorCharts: React.FC<ErrorChartsProps> = ({ stats, weeklyProfile }) => {
  const [showDetail, setShowDetail] = useState(false);

  // 1. 大类总次数
  const catCounts = CATEGORY_META.map(c => ({
    ...c,
    count: (stats[c.key as keyof ErrorStats] as any)?.total ?? 0,
  }));
  const maxCat = Math.max(...catCounts.map(c => c.count), 1);
  const totalErrors = catCounts.reduce((s, c) => s + c.count, 0);

  // 2. 进步追踪数据：将 weeklyProfile.topErrors 转为"子类型 → 历史每场均值"
  const histMap: Record<string, number> = {};
  if (weeklyProfile && weeklyProfile.totalSessions > 0) {
    weeklyProfile.topErrors.forEach(e => {
      histMap[e.key] = e.count / weeklyProfile.totalSessions;
    });
  }

  // 只展示：本次有错误 或 历史有记录 的子类型（至少本次 > 0）
  const progressRows: Array<{ key: string; current: number; histAvg: number }> = [];
  CATEGORY_META.forEach(cat => {
    const catData = stats[cat.key as keyof ErrorStats] as any;
    if (!catData) return;
    Object.entries(catData.subtypes).forEach(([subKey]) => {
      const current = (catData.subtypes[subKey] as any).count as number;
      const histAvg = histMap[subKey] ?? 0;
      if (current === 0 && histAvg === 0) return;
      if (current === 0) return; // 本次没错就不展示进步行
      progressRows.push({ key: subKey, current, histAvg });
    });
  });
  // 按本次次数降序
  progressRows.sort((a, b) => b.current - a.current);

  const hasHistory = weeklyProfile && weeklyProfile.totalSessions >= 2 && Object.keys(histMap).length > 0;

  return (
    <div className="space-y-5">
      {/* ── Chart 1: 大类频次分布 ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-800">听力错误分布（本次）</h4>
          <span className="text-xs text-slate-400">共 {totalErrors} 处</span>
        </div>
        {totalErrors === 0 ? (
          <p className="text-sm text-emerald-600 py-2 text-center">本次无错误，表现出色 🎉</p>
        ) : (
          <div className="space-y-0.5">
            {catCounts.map(c => (
              <CategoryBar
                key={c.key}
                short={c.short}
                count={c.count}
                maxCount={maxCat}
                color={c.color}
                dimColor={c.dimColor}
                textColor={c.textColor}
              />
            ))}
          </div>
        )}
        {/* 各类占比说明 */}
        {totalErrors > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {catCounts.filter(c => c.count > 0).map(c => (
              <span key={c.key} className={`px-2 py-0.5 text-[11px] rounded-full border ${c.dimColor} ${c.textColor} ${c.borderColor}`}>
                {c.short} {Math.round(c.count / totalErrors * 100)}%
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Chart 2: 进步追踪（本次 vs 历史均值）── */}
      {progressRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-bold text-slate-800">现象进步追踪</h4>
            {hasHistory ? (
              <span className="text-xs text-slate-400">
                历史均值来自近 {weeklyProfile!.totalSessions} 次练习
              </span>
            ) : (
              <span className="text-xs text-slate-400">完成 2 次以上可查看历史对比</span>
            )}
          </div>
          {!hasHistory && (
            <p className="text-xs text-slate-400 mb-3">暂时只显示本次情况，历史数据积累后将自动出现对比柱。</p>
          )}
          <div className="divide-y divide-slate-50">
            {progressRows.map(row => (
              <ProgressRow
                key={row.key}
                subtypeKey={row.key}
                current={row.current}
                histAvg={hasHistory ? row.histAvg : 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 折叠：完整子类型细节 ── */}
      <div>
        <button
          onClick={() => setShowDetail(v => !v)}
          className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 py-1 px-1"
        >
          <span className="font-medium">完整错误明细</span>
          {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showDetail && (
          <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-3 py-2 font-semibold text-slate-500">
              <div className="col-span-6">类型</div>
              <div className="col-span-3 text-center">本次</div>
              <div className="col-span-3 text-center">历史均</div>
            </div>
            {CATEGORY_META.map(cat => {
              const catData = stats[cat.key as keyof ErrorStats] as any;
              if (!catData) return null;
              const subtypes = Object.entries(catData.subtypes) as [string, any][];
              const anyCount = subtypes.some(([, d]) => d.count > 0);
              return (
                <React.Fragment key={cat.key}>
                  <div className={`px-3 py-1.5 font-bold border-b border-slate-100 ${cat.dimColor} ${cat.textColor}`}>
                    {cat.short}（{catData.total} 次）
                  </div>
                  {subtypes.map(([subKey, subData]) => {
                    const hAvg = hasHistory && histMap[subKey] ? histMap[subKey] : null;
                    if (!anyCount && subData.count === 0) return null;
                    return (
                      <div key={subKey} className="grid grid-cols-12 px-3 py-1.5 border-b border-slate-50 hover:bg-slate-50 items-center">
                        <div className="col-span-6 flex items-center gap-1.5 pl-3">
                          <span className="font-mono text-slate-400 text-[10px]">{subKey}</span>
                          <span className="text-slate-700">{subData.label}</span>
                        </div>
                        <div className="col-span-3 text-center font-bold text-slate-600">{subData.count}</div>
                        <div className="col-span-3 text-center text-slate-400">
                          {hAvg != null ? hAvg.toFixed(1) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

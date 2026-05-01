
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book, Clock, BarChart, ChevronRight, Loader2, ArrowLeft, Sparkles, ChevronDown, ChevronUp, Zap, CheckCircle2 } from 'lucide-react';
import { splitTextIntoSentences } from '../utils/textProcessing';
import { ensureTtsAudioUrl, TTS_PROVIDER, computeTtsContentHash } from '../utils/ttsAudioCache';

export interface DictationMaterial {
    id: string;
    title: string;
    content: string;
    category: string;
    difficulty_level: string;
    word_count: number;
}

interface LibraryScreenProps {
    onSelect: (material: DictationMaterial) => void;
    onBack: () => void;
    studentMetadata?: {
        studentName: string;
        studentNumber: string;
        className: string;
        inputMethod: 'text' | 'voice' | 'image';
    } | null;
}

type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

/** 兼容数据库中的多种难度写法，统一成三档 */
function normalizeMaterialDifficulty(level: string): DifficultyLevel {
    const normalized = String(level || '').trim().toLowerCase();

    if (
        normalized.includes('advanced') ||
        normalized.includes('挑战') ||
        normalized.includes('hard') ||
        normalized.includes('cet-6') ||
        normalized.includes('cet6')
    ) {
        return 'advanced';
    }

    if (
        normalized.includes('intermediate') ||
        normalized.includes('进阶') ||
        normalized.includes('medium')
    ) {
        return 'intermediate';
    }

    return 'beginner';
}

/** 根据历史平均正确率推算推荐难度 */
function getRecommendedDifficulty(avgAccuracy: number): DifficultyLevel {
    if (avgAccuracy >= 85) return 'advanced';
    if (avgAccuracy >= 65) return 'intermediate';
    return 'beginner';
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
    beginner: '入门',
    intermediate: '进阶',
    advanced: '挑战',
};

const DIFFICULTY_ACCURACY_HINT: Record<DifficultyLevel, string> = {
    beginner: '正确率 < 65%，建议夯实基础',
    intermediate: '正确率 65–85%，稳步提升',
    advanced: '正确率 > 85%，挑战高难度',
};

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ onSelect, onBack, studentMetadata }) => {
    const [materials, setMaterials] = useState<DictationMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<string>('All');

    // 推荐相关状态
    const [recommendedDifficulty, setRecommendedDifficulty] = useState<DifficultyLevel | null>(null);
    const [studentAvgAccuracy, setStudentAvgAccuracy] = useState<number | null>(null);
    const [recommendLoading, setRecommendLoading] = useState(false);
    const [showAllRecommended, setShowAllRecommended] = useState(false);
    // 兜底：prop 未传时从 localStorage 读学生姓名
    const resolvedStudentName =
        studentMetadata?.studentName ||
        localStorage.getItem('student_name') ||
        null;

    useEffect(() => {
        fetchMaterials();
    }, []);

    useEffect(() => {
        if (resolvedStudentName) {
            fetchStudentAccuracy(resolvedStudentName);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedStudentName]);

    const fetchMaterials = async () => {
        try {
            const { data, error } = await supabase
                .from('dictation_materials')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMaterials(data || []);
        } catch (error) {
            console.error('Error fetching materials:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStudentAccuracy = async (studentName: string) => {
        setRecommendLoading(true);
        try {
            // 优先从 student_summary 视图取
            const { data: summaryData, error: summaryError } = await supabase
                .from('student_summary')
                .select('avg_accuracy')
                .eq('student_name', studentName)
                .maybeSingle();

            if (!summaryError && summaryData?.avg_accuracy != null) {
                const acc = Number(summaryData.avg_accuracy);
                setStudentAvgAccuracy(acc);
                setRecommendedDifficulty(getRecommendedDifficulty(acc));
                return;
            }

            // 兜底：直接从 practice_records 汇总
            const { data: records, error: recordsError } = await supabase
                .from('practice_records')
                .select('accuracy_rate')
                .eq('student_name', studentName);

            if (recordsError) {
                console.warn('[LibraryScreen] practice_records 查询失败:', recordsError.message);
                return;
            }

            const rows = (records || []).filter(r => r.accuracy_rate != null);
            if (rows.length === 0) {
                console.info('[LibraryScreen] 该学生暂无练习记录，不显示推荐。studentName:', studentName);
                return;
            }

            const avg = rows.reduce((sum: number, r: { accuracy_rate: number }) => sum + Number(r.accuracy_rate), 0) / rows.length;
            setStudentAvgAccuracy(avg);
            setRecommendedDifficulty(getRecommendedDifficulty(avg));
        } catch (e) {
            console.error('[LibraryScreen] 获取学生历史正确率异常:', e);
        } finally {
            setRecommendLoading(false);
        }
    };

    const categories = ['All', ...Array.from(new Set(materials.map(m => m.category)))];
    const filteredMaterials = category === 'All'
        ? materials
        : materials.filter(m => m.category === category);

    // 推荐材料：匹配难度，最多先展示4张
    const recommendedMaterials = recommendedDifficulty
        ? materials.filter(m => normalizeMaterialDifficulty(m.difficulty_level) === recommendedDifficulty)
        : [];
    const visibleRecommended = showAllRecommended ? recommendedMaterials : recommendedMaterials.slice(0, 4);

    const getDifficultyColor = (level: string) => {
        switch (normalizeMaterialDifficulty(level)) {
            case 'beginner': return 'text-green-600 bg-green-50';
            case 'intermediate': return 'text-yellow-600 bg-yellow-50';
            case 'advanced': return 'text-red-600 bg-red-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const getDifficultyBadgeStyle = (level: DifficultyLevel) => {
        switch (level) {
            case 'beginner': return 'bg-green-100 text-green-700 border-green-200';
            case 'intermediate': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'advanced': return 'bg-red-100 text-red-700 border-red-200';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
            {/* 顶栏 */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 text-slate-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Book className="w-8 h-8 text-blue-600" />
                        听力素材库
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">精选英语听力材料，助你提升听力水平</p>
                </div>
            </div>

            {/* ── 为你推荐区块 ── */}
            {resolvedStudentName && (
                <div className="mb-8">
                    {recommendLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            正在分析你的历史表现，生成推荐…
                        </div>
                    ) : recommendedDifficulty && recommendedMaterials.length > 0 ? (
                        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                            {/* 标题行 */}
                            <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-blue-500" />
                                    <h2 className="text-base font-bold text-blue-900">为你推荐</h2>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getDifficultyBadgeStyle(recommendedDifficulty)}`}>
                                        {DIFFICULTY_LABELS[recommendedDifficulty]}难度
                                    </span>
                                </div>
                                {studentAvgAccuracy !== null && (
                                    <span className="text-xs text-blue-600 font-medium">
                                        历史正确率 {Math.round(studentAvgAccuracy)}%
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-blue-700 mb-4">
                                {DIFFICULTY_ACCURACY_HINT[recommendedDifficulty]}，共 {recommendedMaterials.length} 套材料适合你
                            </p>

                            {/* 推荐卡片网格 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {visibleRecommended.map(material => (
                                    <MaterialCard
                                        key={material.id}
                                        material={material}
                                        onSelect={onSelect}
                                        getDifficultyColor={getDifficultyColor}
                                        isRecommended
                                    />
                                ))}
                            </div>

                            {/* 展开/收起更多 */}
                            {recommendedMaterials.length > 4 && (
                                <button
                                    onClick={() => setShowAllRecommended(v => !v)}
                                    className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mx-auto"
                                >
                                    {showAllRecommended ? (
                                        <><ChevronUp className="w-3.5 h-3.5" />收起</>
                                    ) : (
                                        <><ChevronDown className="w-3.5 h-3.5" />查看全部 {recommendedMaterials.length} 套推荐材料</>
                                    )}
                                </button>
                            )}
                        </div>
                    ) : recommendedDifficulty && recommendedMaterials.length === 0 ? (
                        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                            <Sparkles className="inline w-4 h-4 mr-1" />
                            根据你的历史正确率（{Math.round(studentAvgAccuracy ?? 0)}%），推荐练习
                            <span className="font-semibold mx-1">{DIFFICULTY_LABELS[recommendedDifficulty]}</span>
                            难度材料，但该难度暂无素材，可浏览全部材料自由选择。
                        </div>
                    ) : null}
                </div>
            )}

            {/* ── 全部材料（按主题筛选）── */}
            <h2 className="text-base font-bold text-slate-700 mb-3">全部材料</h2>

            {/* 分类筛选 */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${category === cat
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        {cat === 'All' ? '全部' : cat}
                    </button>
                ))}
            </div>

            {/* 材料网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMaterials.map(material => (
                    <MaterialCard
                        key={material.id}
                        material={material}
                        onSelect={onSelect}
                        getDifficultyColor={getDifficultyColor}
                        isRecommended={false}
                        highlightDifficulty={recommendedDifficulty ?? undefined}
                    />
                ))}

                {filteredMaterials.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        暂无该分类的素材
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── 预热状态类型 ── */
type WarmupStatus = 'idle' | 'running' | 'done' | 'error' | 'partial';

/* ── 抽离出来的材料卡片组件 ── */
interface MaterialCardProps {
    material: DictationMaterial;
    onSelect: (m: DictationMaterial) => void;
    getDifficultyColor: (level: string) => string;
    isRecommended?: boolean;
    highlightDifficulty?: DifficultyLevel;
}

const MaterialCard: React.FC<MaterialCardProps> = ({
    material, onSelect, getDifficultyColor, isRecommended = false, highlightDifficulty
}) => {
    const normalizedDifficulty = normalizeMaterialDifficulty(material.difficulty_level);
    const isMatch = highlightDifficulty && normalizedDifficulty === highlightDifficulty;

    const [warmupStatus, setWarmupStatus] = useState<WarmupStatus>('idle');
    const [warmupProgress, setWarmupProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

    // 挂载时检测：根据 tts_audio_cache 中已存在的 hash 数量推断状态
    useEffect(() => {
        if (TTS_PROVIDER === 'none') return;
        let cancelled = false;

        (async () => {
            const sentences = splitTextIntoSentences(material.content);
            if (sentences.length === 0) return;

            const hashes = await Promise.all(
                sentences.map((s) => computeTtsContentHash(s.text))
            );
            if (cancelled) return;

            const { data, error } = await supabase
                .from('tts_audio_cache')
                .select('content_hash')
                .in('content_hash', hashes);
            if (cancelled || error) return;

            const cachedCount = data?.length || 0;
            const total = hashes.length;
            setWarmupProgress({ done: cachedCount, total });
            if (cachedCount === 0) {
                setWarmupStatus('idle');
            } else if (cachedCount >= total) {
                setWarmupStatus('done');
            } else {
                setWarmupStatus('partial');
            }
        })();

        return () => { cancelled = true; };
    }, [material.id, material.content]);

    const handleWarmup = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (warmupStatus === 'running') return;
        const sentences = splitTextIntoSentences(material.content);
        if (sentences.length === 0) return;
        setWarmupStatus('running');
        setWarmupProgress({ done: 0, total: sentences.length });
        let failed = 0;
        for (let i = 0; i < sentences.length; i++) {
            try {
                await ensureTtsAudioUrl({
                    sentenceText: sentences[i].text,
                    libraryMaterialId: material.id,
                });
            } catch {
                failed++;
            }
            setWarmupProgress({ done: i + 1, total: sentences.length });
        }
        setWarmupStatus(failed === sentences.length ? 'error' : 'done');
    };

    return (
        <div
            onClick={() => onSelect(material)}
            className={`group bg-white rounded-xl p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden
                ${isRecommended
                    ? 'border-blue-200 hover:border-blue-400 ring-1 ring-blue-100'
                    : isMatch
                        ? 'border-blue-100 hover:border-blue-300'
                        : 'border-slate-200 hover:border-blue-200'
                }`}
        >
            <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="text-blue-400" />
            </div>

            <div className="flex justify-between items-start mb-3">
                <span className={`text-xs px-2.5 py-1 rounded-md font-medium capitalize ${getDifficultyColor(material.difficulty_level)}`}>
                    {normalizedDifficulty === 'beginner' ? '入门'
                        : normalizedDifficulty === 'intermediate' ? '进阶'
                            : '挑战'}
                </span>
                <div className="flex items-center gap-1.5">
                    {isRecommended && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-semibold flex items-center gap-0.5">
                            <Sparkles className="w-3 h-3" />推荐
                        </span>
                    )}
                    {!isRecommended && isMatch && (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-500 rounded-full font-medium">
                            适合你
                        </span>
                    )}
                    <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded">
                        {material.category}
                    </span>
                </div>
            </div>

            <h3 className="text-base font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-blue-700 transition-colors">
                {material.title}
            </h3>

            <p className="text-slate-500 text-sm line-clamp-2 mb-4 h-10">
                {material.content}
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                <div className="flex items-center gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                        <BarChart className="w-3.5 h-3.5" />
                        <span>{material.word_count} 词</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>~{Math.ceil(material.word_count / 150)} 分钟</span>
                    </div>
                </div>

                {TTS_PROVIDER !== 'none' && (
                    <button
                        onClick={handleWarmup}
                        disabled={warmupStatus === 'running'}
                        title={
                            warmupStatus === 'done'
                                ? `已全部预热 (${warmupProgress.total}/${warmupProgress.total})`
                                : warmupStatus === 'partial'
                                    ? `已部分预热 ${warmupProgress.done}/${warmupProgress.total}，点击补全`
                                    : '预生成全文 Azure 音频，学生上课时直接播放无需等待'
                        }
                        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-all
                            ${warmupStatus === 'idle' ? 'text-slate-400 bg-slate-50 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200'
                            : warmupStatus === 'running' ? 'text-blue-600 bg-blue-50 border border-blue-200 cursor-not-allowed'
                            : warmupStatus === 'done' ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
                            : warmupStatus === 'partial' ? 'text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                            : 'text-red-500 bg-red-50 border border-red-200'}`}
                    >
                        {warmupStatus === 'idle' && <><Zap className="w-3 h-3" />预热音频</>}
                        {warmupStatus === 'running' && (
                            <><Loader2 className="w-3 h-3 animate-spin" />{warmupProgress.done}/{warmupProgress.total} 句</>
                        )}
                        {warmupStatus === 'done' && <><CheckCircle2 className="w-3 h-3" />已预热</>}
                        {warmupStatus === 'partial' && (
                            <><Zap className="w-3 h-3" />部分预热 {warmupProgress.done}/{warmupProgress.total}</>
                        )}
                        {warmupStatus === 'error' && <><Zap className="w-3 h-3" />预热失败</>}
                    </button>
                )}
            </div>
        </div>
    );
};

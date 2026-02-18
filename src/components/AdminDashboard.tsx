import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SentenceResult } from './PracticeScreen';
import { ArrowLeft, RefreshCcw, Database } from 'lucide-react';

interface PracticeRecord {
    id: string;
    created_at: string;
    raw_text: string;
    results: SentenceResult[];
    student_name?: string;
    ip_address?: string;
}

interface AdminDashboardProps {
    onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
    const [records, setRecords] = useState<PracticeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('practice_records')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRecords(data || []);
        } catch (err: any) {
            console.error('Error fetching records:', err);
            setError(err.message || 'Failed to fetch records. Make sure the table exists and Supabase is configured.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, []);

    // Calculate stats for a record
    const getScore = (results: SentenceResult[]) => {
        if (!results || results.length === 0) return 0;
        // Calculate average score (assuming max score per sentence is 10)
        const totalMaxScore = results.length * 10;
        const currentTotalScore = results.reduce((acc, r) => acc + (r.score || 0), 0);
        return Math.round((currentTotalScore / totalMaxScore) * 100);
    };

    // Helper to count "correct" sentences (e.g. accuracy >= 90%)
    const countCorrect = (results: SentenceResult[]) => {
        return results.filter(r => (r.accuracy || 0) >= 90).length;
    };

    return (
        <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden min-h-[50vh]">
            <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                    <Database size={24} className="text-blue-400" />
                    <h2 className="text-2xl font-bold">学生练习数据后台</h2>
                </div>
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-800 rounded-full transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
            </div>

            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold text-slate-700">最新提交记录</h3>
                    <div className="flex gap-3">
                        <button
                            onClick={async () => {
                                try {
                                    const { error } = await supabase.from('practice_records').select('count', { count: 'exact', head: true });
                                    if (error) {
                                        alert(`连接失败!\n错误代码: ${error.code}\n错误信息: ${error.message}\n提示: 请检查你的 URL 和 Anon Key 是否正确。Key 通常是以 "ey" 开头的长字符串。`);
                                    } else {
                                        alert('连接成功! 你的 Supabase 配置是正确的。');
                                    }
                                } catch (e: any) {
                                    alert(`连接错误: ${e.message}`);
                                }
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                        >
                            <RefreshCcw size={16} />
                            测试连接
                        </button>
                        <button
                            onClick={fetchRecords}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                            <RefreshCcw size={16} />
                            刷新数据
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="text-center py-12 text-slate-500">
                        加载中...
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
                        {error}
                        <br />
                        <span className="text-sm mt-2 block text-red-500">
                            请确保已经在 Supabase创建了 `practice_records` 表并且设置了 RLS 策略。
                        </span>
                    </div>
                )}

                {!loading && !error && records.length === 0 && (
                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        暂无数据
                    </div>
                )}

                {!loading && !error && records.length > 0 && (
                    <div className="space-y-4">
                        {records.map((record) => (
                            <div key={record.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-400 font-mono">
                                            {new Date(record.created_at).toLocaleString('zh-CN')}
                                        </span>
                                        <span className="font-medium text-slate-700 mt-1">
                                            {record.student_name || '匿名学生'}
                                        </span>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${getScore(record.results) >= 80 ? 'bg-green-100 text-green-700' :
                                        getScore(record.results) >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                        {getScore(record.results)}分
                                    </div>
                                </div>

                                <div className="text-slate-600 text-sm mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                    "{record.raw_text.substring(0, 100)}{record.raw_text.length > 100 ? '...' : ''}"
                                </div>

                                <div className="flex gap-4 text-xs text-slate-500 border-t pt-2 mt-2">
                                    <div>句子数量: {record.results.length}</div>
                                    <div>优秀(≥90%): {countCorrect(record.results)}</div>
                                    <div>需改进: {record.results.length - countCorrect(record.results)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

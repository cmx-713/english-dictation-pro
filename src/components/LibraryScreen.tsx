
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book, Clock, BarChart, ChevronRight, Loader2, ArrowLeft } from 'lucide-react';

export interface DictationMaterial {
    id: string;
    title: string;
    content: string;
    category: string;
    difficulty_level: 'beginner' | 'intermediate' | 'advanced';
    word_count: number;
}

interface LibraryScreenProps {
    onSelect: (material: DictationMaterial) => void;
    onBack: () => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ onSelect, onBack }) => {
    const [materials, setMaterials] = useState<DictationMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<string>('All');

    useEffect(() => {
        fetchMaterials();
    }, []);

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

    const categories = ['All', ...Array.from(new Set(materials.map(m => m.category)))];
    const filteredMaterials = category === 'All'
        ? materials
        : materials.filter(m => m.category === category);

    const getDifficultyColor = (level: string) => {
        switch (level) {
            case 'beginner': return 'text-green-600 bg-green-50';
            case 'intermediate': return 'text-yellow-600 bg-yellow-50';
            case 'advanced': return 'text-red-600 bg-red-50';
            default: return 'text-gray-600 bg-gray-50';
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
            <div className="flex items-center gap-4 mb-8">
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

            {/* Category Filter */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
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

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMaterials.map(material => (
                    <div
                        key={material.id}
                        onClick={() => onSelect(material)}
                        className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="text-blue-400" />
                        </div>

                        <div className="flex justify-between items-start mb-3">
                            <span className={`text-xs px-2.5 py-1 rounded-md font-medium capitalize ${getDifficultyColor(material.difficulty_level)}`}>
                                {material.difficulty_level}
                            </span>
                            <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded">
                                {material.category}
                            </span>
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-blue-700 transition-colors">
                            {material.title}
                        </h3>

                        <p className="text-slate-500 text-sm line-clamp-2 mb-4 h-10">
                            {material.content}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-slate-400 pt-4 border-t border-slate-50">
                            <div className="flex items-center gap-1">
                                <BarChart className="w-3.5 h-3.5" />
                                <span>{material.word_count} 词</span>
                            </div>
                            {/* 预估时长：假设 150 wpm */}
                            <div className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>~{Math.ceil(material.word_count / 150)} 分钟</span>
                            </div>
                        </div>
                    </div>
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

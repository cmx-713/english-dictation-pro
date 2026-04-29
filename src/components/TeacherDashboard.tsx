import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeClassName } from '../utils/classNameNormalizer';
import {
  ArrowLeft,
  Users,
  BookOpen,
  TrendingUp,
  Award,
  Calendar,
  Download,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Edit2,
  X,
  Save,
  ClipboardList,
  CheckCircle2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface TeacherDashboardProps {
  onBack: () => void;
}

interface StudentSummary {
  student_number?: string;
  student_name: string;
  class_name: string;
  total_practices: number;
  avg_accuracy: number;
  total_words_practiced: number;
  perfect_sentence_count: number;
  last_practice_date: string;
  recent_practices: number;
  best_accuracy: number;
  worst_accuracy: number;
}

interface ClassStats {
  class_name: string;
  student_count: number;
  total_practices: number;
  avg_accuracy: number;
  total_words_practiced: number;
}

interface DailyStats {
  practice_date: string;
  practice_count: number;
  active_students: number;
  avg_accuracy: number;
  words_practiced: number;
}

interface DifficultyStats {
  difficulty_level: string;
  practice_count: number;
  avg_accuracy: number;
  avg_word_count: number;
}

interface SuggestionTask {
  id: string;
  student_name: string;
  class_name: string;
  status: 'pending' | 'done' | 'dismissed';
  created_at: string;
  avg_accuracy: number;
  wrong_sentence_count: number;
}

interface SuggestionStats {
  total: number;
  done: number;
  dismissed: number;
  pending: number;
  byClass: Array<{ class_name: string; total: number; done: number; rate: number }>;
  topStudents: Array<{ student_name: string; class_name: string; done: number; total: number; rate: number }>;
  loading: boolean;
  unsupported: boolean;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onBack }) => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [classes, setClasses] = useState<ClassStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [difficultyStats, setDifficultyStats] = useState<DifficultyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('全部');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'classes' | 'trends' | 'suggestions' | 'assignments'>('overview');
  const [suggestionStats, setSuggestionStats] = useState<SuggestionStats>({
    total: 0, done: 0, dismissed: 0, pending: 0,
    byClass: [], topStudents: [], loading: false, unsupported: false,
  });

  // 班级错因分布：class_name → { A, B, C, D, total }
  const [classErrorProfiles, setClassErrorProfiles] = useState<Record<string, { A: number; B: number; C: number; D: number; total: number }>>({});
  const [classErrorLoading, setClassErrorLoading] = useState(false);

  // 作业相关状态
  interface LibraryMaterial { id: string; title: string; difficulty_level: string; category: string; word_count: number; }
  interface ClassAssignment { id: string; class_name: string; material_id: string; material_title: string; due_date: string | null; is_active: boolean; created_at: string; }
  interface AssignmentSubmission { id: string; student_name: string; student_number: string | null; submitted_at: string; accuracy_rate: number | null; }
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignClass, setAssignClass] = useState('');
  const [assignMaterialId, setAssignMaterialId] = useState('');
  const [assignMaterialTitle, setAssignMaterialTitle] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [libraryMaterials, setLibraryMaterials] = useState<LibraryMaterial[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [activeAssignments, setActiveAssignments] = useState<ClassAssignment[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<ClassAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [showAssignmentHistory, setShowAssignmentHistory] = useState(false);
  // 提交名单：assignmentId → 提交列表
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<Record<string, AssignmentSubmission[]>>({});
  const [submissionsLoading, setSubmissionsLoading] = useState<Record<string, boolean>>({});
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);
  // 作业看板：批量加载所有作业的提交汇总
  const [allSubmissionsLoaded, setAllSubmissionsLoaded] = useState(false);
  const [allSubmissionsLoading, setAllSubmissionsLoading] = useState(false);

  
  // 编辑学生信息的状态
  const [editingStudent, setEditingStudent] = useState<StudentSummary | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 学生详细练习记录
  const [studentRecords, setStudentRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // 加载所有数据
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 获取学生摘要
      const { data: studentsData, error: studentsError } = await supabase
        .from('student_summary')
        .select('*')
        .order('avg_accuracy', { ascending: false });

      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      // 获取班级统计
      const { data: classesData, error: classesError } = await supabase
        .from('class_stats')
        .select('*')
        .order('avg_accuracy', { ascending: false });

      if (classesError) throw classesError;
      setClasses(classesData || []);

      // 获取每日统计（最近7天）
      const { data: dailyData, error: dailyError } = await supabase
        .from('daily_stats')
        .select('*')
        .limit(7)
        .order('practice_date', { ascending: true });

      if (dailyError) throw dailyError;
      setDailyStats(dailyData || []);

      // 获取难度统计
      const { data: difficultyData, error: difficultyError } = await supabase
        .from('difficulty_stats')
        .select('*');

      if (difficultyError) throw difficultyError;
      setDifficultyStats(difficultyData || []);

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    void loadActiveAssignments();
  }, []);

  // 更新学生班级
  const updateStudentClass = async () => {
    if (!editingStudent || !editClassName.trim()) {
      alert('请输入班级名称');
      return;
    }

    // 标准化班级名称
    const normalizedClassName = normalizeClassName(editClassName.trim());

    setSaving(true);
    try {
      // 1. 更新 practice_records 表中该学生的所有记录
      const { error: recordsError } = await supabase
        .from('practice_records')
        .update({ class_name: normalizedClassName })
        .eq('student_name', editingStudent.student_name);

      if (recordsError) throw recordsError;

      // 2. 更新 students 表
      const { error: studentsError } = await supabase
        .from('students')
        .update({ class_name: normalizedClassName })
        .eq('student_name', editingStudent.student_name);

      if (studentsError) throw studentsError;

      // 3. 刷新数据
      await fetchData();
      
      // 4. 关闭对话框
      setEditingStudent(null);
      setEditClassName('');
      
      alert(`班级更新成功！\n已将 "${editingStudent.student_name}" 的 ${editingStudent.total_practices} 条记录更新为班级 "${normalizedClassName}"`);
    } catch (err: any) {
      console.error('更新班级失败:', err);
      alert('更新失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 打开编辑对话框
  const handleEditStudent = (student: StudentSummary) => {
    setEditingStudent(student);
    setEditClassName(student.class_name || '');
  };

  // 加载学生的详细练习记录
  const loadStudentRecords = async (studentName: string) => {
    setLoadingRecords(true);
    try {
      const { data, error } = await supabase
        .from('practice_records')
        .select('*')
        .eq('student_name', studentName)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudentRecords(data || []);
    } catch (err) {
      console.error('加载学生记录失败:', err);
      setStudentRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  };

  // 加载建议执行率数据
  const loadSuggestionStats = async () => {
    setSuggestionStats(prev => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase
        .from('suggestion_tasks')
        .select('id, student_name, class_name, status, created_at, avg_accuracy, wrong_sentence_count')
        .order('created_at', { ascending: false });

      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('suggestion_tasks') || msg.includes('does not exist') || msg.includes('relation')) {
          setSuggestionStats(prev => ({ ...prev, loading: false, unsupported: true }));
          return;
        }
        throw error;
      }

      const tasks = (data || []) as SuggestionTask[];
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      const dismissed = tasks.filter(t => t.status === 'dismissed').length;
      const pending = tasks.filter(t => t.status === 'pending').length;

      // 按班级汇总
      const classMap = new Map<string, { total: number; done: number }>();
      tasks.forEach(t => {
        const cls = t.class_name || '未知班级';
        const cur = classMap.get(cls) || { total: 0, done: 0 };
        classMap.set(cls, { total: cur.total + 1, done: cur.done + (t.status === 'done' ? 1 : 0) });
      });
      const byClass = Array.from(classMap.entries())
        .map(([class_name, v]) => ({ class_name, ...v, rate: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0 }))
        .sort((a, b) => b.rate - a.rate);

      // 按学生汇总
      const stuMap = new Map<string, { class_name: string; total: number; done: number }>();
      tasks.forEach(t => {
        const key = t.student_name;
        const cur = stuMap.get(key) || { class_name: t.class_name || '', total: 0, done: 0 };
        stuMap.set(key, { ...cur, total: cur.total + 1, done: cur.done + (t.status === 'done' ? 1 : 0) });
      });
      const topStudents = Array.from(stuMap.entries())
        .map(([student_name, v]) => ({ student_name, ...v, rate: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0 }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10);

      setSuggestionStats({ total, done, dismissed, pending, byClass, topStudents, loading: false, unsupported: false });
    } catch (e) {
      console.error('加载建议执行率失败:', e);
      setSuggestionStats(prev => ({ ...prev, loading: false }));
    }
  };

  // 打开布置作业弹框时加载素材库
  const openAssignModal = async () => {
    setShowAssignModal(true);
    setAssignClass(classes[0]?.class_name || '');
    setAssignMaterialId('');
    setAssignMaterialTitle('');
    setAssignDueDate('');
    if (libraryMaterials.length > 0) return;
    setLibraryLoading(true);
    try {
      const { data } = await supabase
        .from('dictation_materials')
        .select('id, title, difficulty_level, category, word_count')
        .order('created_at', { ascending: false });
      setLibraryMaterials(data || []);
    } catch (e) { console.error(e); }
    finally { setLibraryLoading(false); }
  };

  // 提交作业
  const submitAssignment = async () => {
    if (!assignClass || !assignMaterialId) {
      alert('请选择班级和素材');
      return;
    }
    setAssignSaving(true);
    try {
      const { error } = await supabase.from('class_assignments').insert({
        class_name: assignClass,
        material_id: assignMaterialId,
        material_title: assignMaterialTitle,
        due_date: assignDueDate || null,
        is_active: true,
      });
      if (error) {
        const msg = String(error.message || '').toLowerCase();
        const code = String((error as any).code || '');
        const isTableMissing =
          code === '42P01' ||
          msg.includes('relation "class_assignments" does not exist') ||
          msg.includes("relation 'class_assignments' does not exist") ||
          msg.includes('does not exist');
        const isPermissionError =
          code === '42501' ||
          msg.includes('permission denied') ||
          msg.includes('row-level security') ||
          msg.includes('violates row-level security policy');

        if (isTableMissing) {
          alert('请先在 Supabase 中执行 create_class_assignments_table.sql 初始化作业表');
          return;
        }
        if (isPermissionError) {
          alert('class_assignments 表存在，但当前账号没有写入权限（RLS/Policy）。请在 Supabase 给该表加 INSERT/SELECT/UPDATE 策略。');
          return;
        }
        throw error;
      }
      alert(`✅ 已成功为「${assignClass}」布置作业：${assignMaterialTitle}`);
      setShowAssignModal(false);
      void loadActiveAssignments();
    } catch (e: any) {
      alert('布置失败：' + e.message);
    } finally { setAssignSaving(false); }
  };

  // 加载作业：当前生效 + 历史
  const loadActiveAssignments = async () => {
    setAssignmentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_assignments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        const msg = String(error.message || '').toLowerCase();
        const code = String((error as any).code || '');
        const isTableMissing =
          code === '42P01' ||
          msg.includes('relation "class_assignments" does not exist') ||
          msg.includes("relation 'class_assignments' does not exist") ||
          msg.includes('does not exist');
        if (isTableMissing) return;
        throw error;
      }
      const list = (data || []) as ClassAssignment[];
      const today = new Date().toISOString().split('T')[0];
      const active = list.filter((a) => a.is_active && (!a.due_date || a.due_date >= today));
      const history = list.filter((a) => !a.is_active || Boolean(a.due_date && a.due_date < today));
      setActiveAssignments(active);
      setAssignmentHistory(history);
    } catch (e) { console.error(e); }
    finally { setAssignmentsLoading(false); }
  };

  // 批量加载所有作业的提交数据（看板用）
  const loadAllSubmissions = async (assignmentIds: string[]) => {
    if (assignmentIds.length === 0) { setAllSubmissionsLoaded(true); return; }
    setAllSubmissionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('id, assignment_id, student_name, student_number, submitted_at, accuracy_rate')
        .in('assignment_id', assignmentIds)
        .order('submitted_at', { ascending: false });
      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('does not exist') || msg.includes('permission denied') || msg.includes('row-level security')) {
          setAllSubmissionsLoaded(true);
          return;
        }
        throw error;
      }
      const grouped: Record<string, AssignmentSubmission[]> = {};
      assignmentIds.forEach(id => { grouped[id] = []; });
      (data || []).forEach((row: AssignmentSubmission & { assignment_id: string }) => {
        if (grouped[row.assignment_id]) grouped[row.assignment_id].push(row);
      });
      setAssignmentSubmissions(grouped);
      setAllSubmissionsLoaded(true);
    } catch (e) {
      console.error('批量加载提交失败', e);
    } finally {
      setAllSubmissionsLoading(false);
    }
  };

  // 加载某条作业的提交名单
  const loadSubmissions = async (assignmentId: string) => {
    if (assignmentSubmissions[assignmentId]) {
      // 已加载过，切换展开/收起
      setExpandedAssignmentId(prev => prev === assignmentId ? null : assignmentId);
      return;
    }
    setSubmissionsLoading(prev => ({ ...prev, [assignmentId]: true }));
    setExpandedAssignmentId(assignmentId);
    try {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('id, student_name, student_number, submitted_at, accuracy_rate')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });
      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('does not exist') || msg.includes('permission denied') || msg.includes('row-level security')) {
          setAssignmentSubmissions(prev => ({ ...prev, [assignmentId]: [] }));
          return;
        }
        throw error;
      }
      setAssignmentSubmissions(prev => ({ ...prev, [assignmentId]: (data || []) as AssignmentSubmission[] }));
    } catch (e) {
      console.error('加载提交名单失败', e);
    } finally {
      setSubmissionsLoading(prev => ({ ...prev, [assignmentId]: false }));
    }
  };

  // 强制刷新某条作业的提交名单
  const refreshSubmissions = async (assignmentId: string) => {
    setAssignmentSubmissions(prev => {
      const next = { ...prev };
      delete next[assignmentId];
      return next;
    });
    await loadSubmissions(assignmentId);
  };

  // 下架作业
  const deactivateAssignment = async (id: string) => {
    if (!confirm('确认下架这条作业？学生将不再看到它。')) return;
    await supabase.from('class_assignments').update({ is_active: false }).eq('id', id);
    setActiveAssignments(prev => prev.filter(a => a.id !== id));
    void loadActiveAssignments();
  };

  // 重新激活历史作业
  const reactivateAssignment = async (id: string) => {
    await supabase.from('class_assignments').update({ is_active: true }).eq('id', id);
    void loadActiveAssignments();
  };

  // 永久删除作业（及关联提交记录）
  const deleteAssignment = async (id: string) => {
    if (!confirm('确认永久删除该作业？相关提交记录也将一并删除，不可恢复。')) return;
    await supabase.from('class_assignments').delete().eq('id', id);
    setAssignmentHistory(prev => prev.filter(a => a.id !== id));
    setActiveAssignments(prev => prev.filter(a => a.id !== id));
    setAssignmentSubmissions(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // 加载各班错因分布（聚合 error_summary by_subtype）
  const loadClassErrorProfiles = async () => {
    setClassErrorLoading(true);
    try {
      const { data, error } = await supabase
        .from('practice_records')
        .select('class_name, error_summary')
        .not('class_name', 'is', null)
        .not('error_summary', 'is', null);

      if (error) {
        // 若 error_summary 列不存在则静默忽略
        const msg = String(error.message || '');
        if (msg.includes('error_summary') || msg.includes('does not exist')) return;
        throw error;
      }

      const profiles: Record<string, { A: number; B: number; C: number; D: number; total: number }> = {};

      (data || []).forEach((row: { class_name: string | null; error_summary: { by_subtype?: Record<string, number> } | null }) => {
        const cls = row.class_name || '未知班级';
        if (!profiles[cls]) profiles[cls] = { A: 0, B: 0, C: 0, D: 0, total: 0 };
        const bySubtype = row.error_summary?.by_subtype || {};
        Object.entries(bySubtype).forEach(([key, cnt]) => {
          const cat = key[0] as 'A' | 'B' | 'C' | 'D';
          if (['A', 'B', 'C', 'D'].includes(cat)) {
            profiles[cls][cat] += Number(cnt) || 0;
            profiles[cls].total += Number(cnt) || 0;
          }
        });
      });

      setClassErrorProfiles(profiles);
    } catch (e) {
      console.error('加载班级错因分布失败:', e);
    } finally {
      setClassErrorLoading(false);
    }
  };


  // 生成某班建议（并尝试保存到 DB）
  // 展开/收起学生详情
  const toggleStudent = async (studentName: string) => {
    if (expandedStudent === studentName) {
      setExpandedStudent(null);
      setStudentRecords([]);
    } else {
      setExpandedStudent(studentName);
      await loadStudentRecords(studentName);
    }
  };

  // 导出数据为 CSV
  const exportToCSV = () => {
    const csv = [
      ['学号', '学生姓名', '班级', '练习次数', '平均正确率', '总单词数', '完美句数', '最后练习时间'],
      ...students.map(s => [
        s.student_number || '-',
        s.student_name,
        s.class_name || '-',
        s.total_practices,
        s.avg_accuracy,
        s.total_words_practiced,
        s.perfect_sentence_count,
        new Date(s.last_practice_date).toLocaleDateString('zh-CN')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `学生数据_${new Date().toLocaleDateString('zh-CN')}.csv`;
    link.click();
  };

  // 筛选学生
  const filteredStudents = selectedClass === '全部'
    ? students
    : students.filter(s => s.class_name === selectedClass);

  // 计算总体统计
  const totalStats = {
    totalStudents: students.length,
    totalPractices: students.reduce((sum, s) => sum + s.total_practices, 0),
    avgAccuracy: students.length > 0
      ? Math.round(students.reduce((sum, s) => sum + s.avg_accuracy, 0) / students.length * 10) / 10
      : 0,
    activeStudents: students.filter(s => s.recent_practices > 0).length
  };

  // 图表颜色
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCcw className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">加载数据中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-10 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* 头部 */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">教师分析后台</h1>
                <p className="text-sm text-slate-500">学生学习数据分析与管理</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCcw className="w-4 h-4" />
                刷新
              </button>
              <button
                onClick={() => void openAssignModal()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                布置作业
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                导出数据
              </button>
            </div>
          </div>

          {/* 标签页 */}
          <div className="flex gap-2 mt-4 border-b border-slate-200 flex-wrap">
            {[
              { key: 'overview', label: '总览', icon: BarChart3 },
              { key: 'students', label: '学生', icon: Users },
              { key: 'classes', label: '班级', icon: BookOpen },
              { key: 'trends', label: '趋势', icon: TrendingUp },
              { key: 'suggestions', label: '建议执行率', icon: Award },
              { key: 'assignments', label: '作业看板', icon: ClipboardList }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key as any);
                  if (tab.key === 'suggestions' && suggestionStats.total === 0 && !suggestionStats.loading && !suggestionStats.unsupported) {
                    void loadSuggestionStats();
                  }
                  if (tab.key === 'classes' && Object.keys(classErrorProfiles).length === 0 && !classErrorLoading) {
                    void loadClassErrorProfiles();
                  }
                  if (tab.key === 'assignments' && !allSubmissionsLoaded && !allSubmissionsLoading) {
                    const allIds = [...activeAssignments, ...assignmentHistory].map(a => a.id);
                    void loadAllSubmissions(allIds);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 总览标签页 */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{totalStats.totalStudents}</span>
                </div>
                <p className="text-sm text-slate-600">总学生数</p>
                <p className="text-xs text-green-600 mt-1">
                  {totalStats.activeStudents} 人本周活跃
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <BookOpen className="w-6 h-6 text-emerald-600" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{totalStats.totalPractices}</span>
                </div>
                <p className="text-sm text-slate-600">总练习次数</p>
                <p className="text-xs text-slate-500 mt-1">
                  平均 {Math.round(totalStats.totalPractices / Math.max(totalStats.totalStudents, 1))} 次/人
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-amber-600" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{totalStats.avgAccuracy}%</span>
                </div>
                <p className="text-sm text-slate-600">平均正确率</p>
                <p className="text-xs text-slate-500 mt-1">全体学生平均</p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Award className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{classes.length}</span>
                </div>
                <p className="text-sm text-slate-600">班级数量</p>
                <p className="text-xs text-slate-500 mt-1">已有数据的班级</p>
              </div>
            </div>

            {/* 图表区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 每日练习趋势 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  最近7天练习趋势
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="practice_date"
                      stroke="#64748b"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="practice_count"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      name="练习次数"
                      dot={{ fill: '#3B82F6', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_accuracy"
                      stroke="#10B981"
                      strokeWidth={2}
                      name="平均正确率(%)"
                      dot={{ fill: '#10B981', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 难度分布 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-amber-600" />
                  难度等级分布
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={difficultyStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ difficulty_level, practice_count }) =>
                        `${difficulty_level} (${practice_count})`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="practice_count"
                    >
                      {difficultyStats.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ===== 班级学情监控 ===== */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  班级学情监控
                </h3>
                <button
                  onClick={() => { void loadClassErrorProfiles(); void fetchData(); }}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> 刷新
                </button>
              </div>

            {classes.length === 0 ? (
              <p className="text-sm text-slate-400">暂无班级数据</p>
            ) : (() => {
              const today = new Date();
              const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
              const ERROR_LABELS_SHORT: Record<string, string> = { A: '语音', B: '拼写', C: '语法', D: '理解' };
              const ERROR_COLORS: Record<string, string> = { A: 'bg-red-400', B: 'bg-amber-400', C: 'bg-blue-400', D: 'bg-purple-400' };

              return (
                <div className="space-y-4">
                  {classes.map(cls => {
                    const clsStudents = students.filter(s => s.class_name === cls.class_name);
                    const profile = classErrorProfiles[cls.class_name];
                    const clsAvg = cls.avg_accuracy != null ? Math.round(Number(cls.avg_accuracy)) : null;

                    // 需关注学生：正确率 < 65% 或 7 天未练习
                    const atRiskLowAcc = clsStudents
                      .filter(s => s.avg_accuracy < 65)
                      .sort((a, b) => a.avg_accuracy - b.avg_accuracy)
                      .slice(0, 5);
                    const atRiskInactive = clsStudents
                      .filter(s => s.last_practice_date < sevenDaysAgo)
                      .sort((a, b) => a.last_practice_date.localeCompare(b.last_practice_date))
                      .slice(0, 5);


                    // 错因排序
                    const errorEntries = profile && profile.total > 0
                      ? (['A', 'B', 'C', 'D'] as const)
                          .map(k => ({ key: k, count: profile[k], pct: Math.round((profile[k] / profile.total) * 100) }))
                          .sort((a, b) => b.count - a.count)
                      : [];
                    const topError = errorEntries[0];

                    return (
                      <div key={cls.class_name} className="border border-slate-200 rounded-xl overflow-hidden">
                        {/* 班级标题行 */}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-800">{cls.class_name}</span>
                            <span className="text-xs text-slate-500">{cls.student_count} 人</span>
                          </div>
                          {/* 整体正确率 */}
                          {clsAvg != null && (
                            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                              clsAvg >= 85 ? 'bg-emerald-100 text-emerald-700'
                              : clsAvg >= 70 ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-600'
                            }`}>
                              均 {clsAvg}%
                            </span>
                          )}
                        </div>

                        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">

                          {/* ① 错因分布 */}
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-2">错因分布</p>
                            {!profile || profile.total === 0 ? (
                              <p className="text-xs text-slate-400">暂无错因数据</p>
                            ) : (
                              <div className="space-y-1.5">
                                {errorEntries.map(({ key, count, pct }) => (
                                  <div key={key} className="flex items-center gap-2">
                                    <span className="w-8 text-xs text-slate-500 shrink-0">{ERROR_LABELS_SHORT[key]}</span>
                                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${ERROR_COLORS[key]}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-600 w-12 text-right">{pct}% ({count})</span>
                                  </div>
                                ))}
                                {topError && (
                                  <p className="text-xs text-amber-600 mt-1 font-medium">
                                    ⚠ 主要弱项：{ERROR_LABELS_SHORT[topError.key]}类（{topError.pct}%）
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* ② 需关注学生 */}
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-2">
                              需关注学生
                              {(atRiskLowAcc.length + atRiskInactive.length) > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">
                                  {new Set([...atRiskLowAcc, ...atRiskInactive].map(s => s.student_name)).size}
                                </span>
                              )}
                            </p>
                            {atRiskLowAcc.length === 0 && atRiskInactive.length === 0 ? (
                              <p className="text-xs text-emerald-600">✓ 全班学情良好</p>
                            ) : (
                              <div className="space-y-1">
                                {atRiskLowAcc.map(s => (
                                  <div key={`acc-${s.student_name}`} className="flex items-center justify-between text-xs bg-red-50 border border-red-100 rounded px-2 py-1">
                                    <span className="font-medium text-slate-800">{s.student_name}</span>
                                    <span className="text-red-600 font-bold">{Math.round(s.avg_accuracy)}% ↓低</span>
                                  </div>
                                ))}
                                {atRiskInactive
                                  .filter(s => !atRiskLowAcc.find(a => a.student_name === s.student_name))
                                  .map(s => {
                                    const daysAgo = Math.floor((today.getTime() - new Date(s.last_practice_date).getTime()) / 86400000);
                                    return (
                                      <div key={`inactive-${s.student_name}`} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1">
                                        <span className="font-medium text-slate-800">{s.student_name}</span>
                                        <span className="text-amber-600">{daysAgo}天未练</span>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* ③ 本班作业 & 练习量 */}
                          <div className="space-y-3">
                            {/* 练习量 */}
                            <div>
                              <p className="text-xs font-semibold text-slate-600 mb-1.5">本班练习概况</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 text-center">
                                  <p className="text-lg font-bold text-blue-700">{cls.total_practices ?? 0}</p>
                                  <p className="text-[10px] text-blue-500">总练习次</p>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-center">
                                  <p className="text-lg font-bold text-slate-700">{cls.student_count}</p>
                                  <p className="text-[10px] text-slate-500">班级人数</p>
                                </div>
                              </div>
                            </div>

                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
        )}

        {/* 学生标签页 */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            {/* 筛选器 */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-slate-700">筛选班级：</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="全部">全部班级</option>
                  {classes.map(c => (
                    <option key={c.class_name} value={c.class_name}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-slate-500">
                  共 {filteredStudents.length} 名学生
                </span>
              </div>
            </div>

            {/* 学生列表 */}
            <div className="space-y-3">
              {filteredStudents.map((student, index) => (
                <div
                  key={student.student_name}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md"
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleStudent(student.student_name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${index === 0 ? 'bg-yellow-500' :
                          index === 1 ? 'bg-slate-400' :
                            index === 2 ? 'bg-amber-600' :
                              'bg-blue-500'
                          }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {student.student_name}
                              {student.student_number && <span className="ml-2 text-xs text-slate-400 font-normal">#{student.student_number}</span>}
                            </h3>
                            {student.class_name && (
                              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                                {student.class_name}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditStudent(student);
                              }}
                              className="ml-2 p-1 hover:bg-slate-100 rounded transition-colors"
                              title="编辑班级"
                            >
                              <Edit2 className="w-4 h-4 text-slate-400 hover:text-blue-600" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            练习 {student.total_practices} 次 ·
                            {student.total_words_practiced} 单词 ·
                            完美句 {student.perfect_sentence_count}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-900">
                            {student.avg_accuracy}%
                          </div>
                          <div className="text-xs text-slate-500">平均正确率</div>
                        </div>
                        {expandedStudent === student.student_name ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 展开的详细信息 */}
                  {expandedStudent === student.student_name && (
                    <div className="border-t border-slate-200 bg-slate-50">
                      {/* 统计摘要 */}
                      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-200">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">最高正确率</p>
                          <p className="text-lg font-semibold text-green-600">
                            {student.best_accuracy}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">最低正确率</p>
                          <p className="text-lg font-semibold text-red-600">
                            {student.worst_accuracy}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">本周练习</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {student.recent_practices} 次
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">最后练习</p>
                          <p className="text-sm font-medium text-slate-700">
                            {new Date(student.last_practice_date).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>

                      {/* 详细练习记录 */}
                      <div className="p-4">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <BookOpen className="w-4 h-4" />
                          练习记录详情
                        </h4>
                        
                        {loadingRecords ? (
                          <div className="text-center py-8">
                            <RefreshCcw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">加载中...</p>
                          </div>
                        ) : studentRecords.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <p className="text-sm">暂无练习记录</p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {studentRecords.map((record, idx) => (
                              <div
                                key={record.id}
                                className="bg-white rounded-lg p-4 border border-slate-200 hover:border-blue-300 transition-colors"
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                                      {idx + 1}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">
                                        {new Date(record.created_at).toLocaleString('zh-CN', {
                                          year: 'numeric',
                                          month: '2-digit',
                                          day: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                          {record.difficulty_level || '未知难度'}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                          {record.input_method === 'voice' ? '语音' : record.input_method === 'image' ? '图片' : '文本'}输入
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-2xl font-bold ${
                                      record.accuracy_rate >= 90 ? 'text-green-600' :
                                      record.accuracy_rate >= 70 ? 'text-blue-600' :
                                      record.accuracy_rate >= 60 ? 'text-orange-600' :
                                      'text-red-600'
                                    }`}>
                                      {record.accuracy_rate}%
                                    </div>
                                    <div className="text-xs text-slate-500">正确率</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 mb-3">
                                  <div className="text-center p-2 bg-slate-50 rounded">
                                    <p className="text-xs text-slate-500">总句子</p>
                                    <p className="text-lg font-semibold text-slate-900">{record.total_sentences || 0}</p>
                                  </div>
                                  <div className="text-center p-2 bg-slate-50 rounded">
                                    <p className="text-xs text-slate-500">完美句</p>
                                    <p className="text-lg font-semibold text-green-600">{record.perfect_sentences || 0}</p>
                                  </div>
                                  <div className="text-center p-2 bg-slate-50 rounded">
                                    <p className="text-xs text-slate-500">总单词</p>
                                    <p className="text-lg font-semibold text-blue-600">{record.total_words || 0}</p>
                                  </div>
                                </div>

                                {record.raw_text && (
                                  <div className="mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs text-slate-500 mb-2">听写内容：</p>
                                    <div className="text-sm text-slate-700 bg-slate-50 rounded p-3 max-h-32 overflow-y-auto">
                                      {record.raw_text.split('\n').slice(0, 3).join('\n')}
                                      {record.raw_text.split('\n').length > 3 && (
                                        <span className="text-slate-400">...</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filteredStudents.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  暂无学生数据
                </div>
              )}
            </div>
          </div>
        )}

        {/* 班级标签页 */}
        {activeTab === 'classes' && (
          <div className="space-y-4">
            {classes.map((classItem) => (
              <div
                key={classItem.class_name}
                className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <BookOpen className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{classItem.class_name}</h3>
                      <p className="text-sm text-slate-500">{classItem.student_count} 名学生</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600">
                      {classItem.avg_accuracy}%
                    </div>
                    <p className="text-xs text-slate-500">班级平均正确率</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">总练习次数</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {classItem.total_practices}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">总单词数</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {classItem.total_words_practiced.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">人均练习</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {Math.round(classItem.total_practices / classItem.student_count)}
                    </p>
                  </div>
                </div>

                {/* 错因热力条 */}
                {(() => {
                  const profile = classErrorProfiles[classItem.class_name];
                  if (classErrorLoading) {
                    return (
                      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">正在加载错因分布...</div>
                    );
                  }
                  if (!profile || profile.total === 0) {
                    return (
                      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
                        暂无错因数据（需学生练习后写入 error_summary 才可显示）
                      </div>
                    );
                  }
                  const categories = [
                    { key: 'A', label: '漏词', color: 'bg-orange-400', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
                    { key: 'B', label: '辨音', color: 'bg-blue-400',   light: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
                    { key: 'C', label: '拼写', color: 'bg-rose-400',   light: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
                    { key: 'D', label: '语法', color: 'bg-violet-400', light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
                  ] as const;
                  const maxCnt = Math.max(...categories.map(c => profile[c.key]));
                  return (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-600">错因分布热力图</p>
                        <p className="text-xs text-slate-400">共 {profile.total} 个错误</p>
                      </div>
                      {/* 堆叠横条 */}
                      <div className="flex h-5 rounded-full overflow-hidden mb-3">
                        {categories.map(c => {
                          const pct = profile.total > 0 ? (profile[c.key] / profile.total) * 100 : 0;
                          return pct > 0 ? (
                            <div
                              key={c.key}
                              className={`${c.color} transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${c.label}：${profile[c.key]} (${Math.round(pct)}%)`}
                            />
                          ) : null;
                        })}
                      </div>
                      {/* 各类指标 */}
                      <div className="grid grid-cols-4 gap-2">
                        {categories.map(c => {
                          const cnt = profile[c.key];
                          const pct = profile.total > 0 ? Math.round((cnt / profile.total) * 100) : 0;
                          const intensity = maxCnt > 0 ? cnt / maxCnt : 0;
                          return (
                            <div
                              key={c.key}
                              className={`rounded-lg border ${c.border} ${c.light} p-2 text-center`}
                              style={{ opacity: cnt === 0 ? 0.4 : 0.5 + intensity * 0.5 }}
                            >
                              <p className={`text-xs font-bold ${c.text}`}>{c.label}</p>
                              <p className={`text-lg font-extrabold ${c.text}`}>{cnt}</p>
                              <p className={`text-xs ${c.text} opacity-75`}>{pct}%</p>
                            </div>
                          );
                        })}
                      </div>
                      {/* 主要弱项提示 */}
                      {maxCnt > 0 && (() => {
                        const top = categories.reduce((a, b) => profile[a.key] >= profile[b.key] ? a : b);
                        return (
                          <p className={`mt-2 text-xs font-medium ${top.text}`}>
                            ⚠ 该班主要弱项：{top.label}类（占 {Math.round((profile[top.key] / profile.total) * 100)}%），建议课堂重点讲解。
                          </p>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            ))}

            {classes.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                暂无班级数据
              </div>
            )}

            {/* 作业管理已移至"作业看板"Tab */}
            {false && <div>
              {assignmentsLoading ? (
                <p className="text-sm text-slate-400">加载中...</p>
              ) : activeAssignments.length === 0 ? (
                <p className="text-sm text-slate-400">暂无生效作业，点击"布置新作业"开始。</p>
              ) : (
                <div className="space-y-3">
                  {activeAssignments.map(a => {
                    const subs = assignmentSubmissions[a.id] || [];
                    const isExpanded = expandedAssignmentId === a.id;
                    const isLoadingSubs = submissionsLoading[a.id];
                    const classStudentCount = classes.find(c => c.class_name === a.class_name)?.student_count ?? '?';
                    const submittedCount = assignmentSubmissions[a.id] !== undefined ? subs.length : null;
                    return (
                      <div key={a.id} className="bg-emerald-50 border border-emerald-100 rounded-xl overflow-hidden">
                        {/* 作业主信息行 */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-emerald-900">{a.class_name}</p>
                              {submittedCount !== null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  submittedCount === 0 ? 'bg-slate-100 text-slate-500'
                                  : submittedCount >= Number(classStudentCount) ? 'bg-emerald-600 text-white'
                                  : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {submittedCount}/{classStudentCount} 已完成
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-emerald-700 mt-0.5">
                              📖 {a.material_title}
                              {a.due_date && <span className="ml-2 text-slate-500">截止：{a.due_date}</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">布置于 {new Date(a.created_at).toLocaleDateString('zh-CN')}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-2 shrink-0">
                            <button
                              onClick={() => void loadSubmissions(a.id)}
                              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${
                                isExpanded
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              }`}
                              title="查看完成名单"
                            >
                              {isLoadingSubs ? (
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                              ) : (
                                <Users className="w-3 h-3" />
                              )}
                              {isExpanded ? '收起' : '名单'}
                            </button>
                            <button
                              onClick={() => void deactivateAssignment(a.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="下架作业"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* 展开：提交名单 */}
                        {isExpanded && (
                          <div className="border-t border-emerald-100 bg-white px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-600">
                                已提交名单（{subs.length} 人）
                              </p>
                              <button
                                onClick={() => void refreshSubmissions(a.id)}
                                className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" /> 刷新
                              </button>
                            </div>
                            {isLoadingSubs ? (
                              <p className="text-xs text-slate-400 py-2">加载中...</p>
                            ) : subs.length === 0 ? (
                              <p className="text-xs text-slate-400 py-2">暂无学生提交</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-100">
                                      <th className="text-left py-1.5 pr-4 font-medium">姓名</th>
                                      <th className="text-left py-1.5 pr-4 font-medium">学号</th>
                                      <th className="text-left py-1.5 pr-4 font-medium">正确率</th>
                                      <th className="text-left py-1.5 font-medium">提交时间</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subs.map(s => (
                                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="py-1.5 pr-4 font-medium text-slate-800">{s.student_name}</td>
                                        <td className="py-1.5 pr-4 text-slate-500">{s.student_number || '—'}</td>
                                        <td className="py-1.5 pr-4">
                                          {s.accuracy_rate != null ? (
                                            <span className={`font-semibold ${
                                              s.accuracy_rate >= 90 ? 'text-emerald-600'
                                              : s.accuracy_rate >= 70 ? 'text-amber-600'
                                              : 'text-red-500'
                                            }`}>
                                              {s.accuracy_rate}%
                                            </span>
                                          ) : '—'}
                                        </td>
                                        <td className="py-1.5 text-slate-400">
                                          {new Date(s.submitted_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 历史作业 */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowAssignmentHistory((v) => !v)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-900"
                >
                  <span>历史作业（已下架/已过期）</span>
                  {showAssignmentHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAssignmentHistory && (
                  <div className="mt-3 space-y-2">
                    {assignmentHistory.length === 0 ? (
                      <p className="text-xs text-slate-400">暂无历史作业</p>
                    ) : (
                      assignmentHistory.map((a) => (
                        <div key={a.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.class_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              📖 {a.material_title}
                              {a.due_date && <span className="ml-2">截止：{a.due_date}</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">布置于 {new Date(a.created_at).toLocaleDateString('zh-CN')}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => void reactivateAssignment(a.id)}
                              className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                              title="重新生效"
                            >
                              重新激活
                            </button>
                            <button
                              onClick={() => void deleteAssignment(a.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="永久删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>}
          </div>
        )}

        {/* 趋势标签页 */}
        {activeTab === 'trends' && (
          <div className="space-y-6">
            {/* 练习活跃度趋势 */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">练习活跃度趋势</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="practice_date"
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="practice_count" fill="#3B82F6" name="练习次数" />
                  <Bar dataKey="active_students" fill="#10B981" name="活跃学生" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 正确率趋势 */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">正确率趋势</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="practice_date"
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avg_accuracy"
                    stroke="#F59E0B"
                    strokeWidth={3}
                    name="平均正确率(%)"
                    dot={{ fill: '#F59E0B', r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 难度分析 */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">难度级别分析</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={difficultyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="difficulty_level"
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="practice_count" fill="#8B5CF6" name="练习次数" />
                  <Bar dataKey="avg_accuracy" fill="#EC4899" name="平均正确率(%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 建议执行率标签页 */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            {suggestionStats.unsupported ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <p className="text-amber-800 font-semibold mb-1">建议执行率功能尚未启用</p>
                <p className="text-amber-700 text-sm">请先在 Supabase 中执行 <code className="font-mono bg-amber-100 px-1 rounded">create_suggestion_tasks_table.sql</code> 初始化数据表。</p>
              </div>
            ) : suggestionStats.loading ? (
              <div className="text-center py-12 text-slate-500">正在加载建议执行率数据...</div>
            ) : suggestionStats.total === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="font-medium mb-1">暂无建议执行数据</p>
                <p className="text-sm">学生完成练习后系统会自动生成建议任务，执行数据将在此处统计。</p>
              </div>
            ) : (
              <>
                {/* 总体执行率卡片 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: '总建议数', value: suggestionStats.total, color: 'bg-blue-50 text-blue-700', sub: '' },
                    { label: '已完成', value: suggestionStats.done, color: 'bg-emerald-50 text-emerald-700',
                      sub: `完成率 ${suggestionStats.total > 0 ? Math.round((suggestionStats.done / suggestionStats.total) * 100) : 0}%` },
                    { label: '已忽略', value: suggestionStats.dismissed, color: 'bg-slate-50 text-slate-600',
                      sub: `忽略率 ${suggestionStats.total > 0 ? Math.round((suggestionStats.dismissed / suggestionStats.total) * 100) : 0}%` },
                    { label: '待执行', value: suggestionStats.pending, color: 'bg-amber-50 text-amber-700',
                      sub: `待处理率 ${suggestionStats.total > 0 ? Math.round((suggestionStats.pending / suggestionStats.total) * 100) : 0}%` },
                  ].map(card => (
                    <div key={card.label} className={`rounded-xl p-4 ${card.color} border border-current/10`}>
                      <p className="text-sm font-medium opacity-75">{card.label}</p>
                      <p className="text-3xl font-bold mt-1">{card.value}</p>
                      {card.sub && <p className="text-xs mt-1 opacity-75">{card.sub}</p>}
                    </div>
                  ))}
                </div>

                {/* 总完成率进度条 */}
                {suggestionStats.total > 0 && (() => {
                  const rate = Math.round((suggestionStats.done / suggestionStats.total) * 100);
                  return (
                    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                      <h3 className="text-base font-semibold text-slate-900 mb-3">整体建议完成率</h3>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-4 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="text-lg font-bold text-emerald-700 w-12 text-right">{rate}%</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">共 {suggestionStats.total} 条建议，已完成 {suggestionStats.done} 条</p>
                    </div>
                  );
                })()}

                {/* 按班级分组 */}
                {suggestionStats.byClass.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                    <h3 className="text-base font-semibold text-slate-900 mb-4">各班完成率</h3>
                    <div className="space-y-3">
                      {suggestionStats.byClass.map(cls => (
                        <div key={cls.class_name} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-700 w-28 shrink-0">{cls.class_name || '未知班级'}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-3 rounded-full bg-blue-500 transition-all"
                              style={{ width: `${cls.rate}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-blue-700 w-10 text-right">{cls.rate}%</span>
                          <span className="text-xs text-slate-400 w-16 text-right">{cls.done}/{cls.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 学生执行排行 */}
                {suggestionStats.topStudents.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-slate-900">学生执行率排行（Top 10）</h3>
                      <button
                        onClick={() => void loadSuggestionStats()}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        刷新
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-100">
                            <th className="pb-2 pr-3">排名</th>
                            <th className="pb-2 pr-3">姓名</th>
                            <th className="pb-2 pr-3">班级</th>
                            <th className="pb-2 pr-3 text-right">完成/总数</th>
                            <th className="pb-2 text-right">完成率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suggestionStats.topStudents.map((stu, idx) => (
                            <tr key={stu.student_name} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 pr-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="py-2 pr-3 font-medium text-slate-900">{stu.student_name}</td>
                              <td className="py-2 pr-3 text-slate-500">{stu.class_name || '-'}</td>
                              <td className="py-2 pr-3 text-right text-slate-600">{stu.done}/{stu.total}</td>
                              <td className="py-2 text-right">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  stu.rate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                  stu.rate >= 50 ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {stu.rate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
      </div>
    )}

        {/* ===== 作业看板 Tab ===== */}
        {activeTab === 'assignments' && (() => {
          const allAssignments = [...activeAssignments, ...assignmentHistory];
          const today = new Date().toISOString().split('T')[0];

          // 每条作业的统计
          const stats = allAssignments.map(a => {
            const subs = assignmentSubmissions[a.id] || [];
            const classInfo = classes.find(c => c.class_name === a.class_name);
            const classTotal = classInfo?.student_count ?? 0;
            const submitted = subs.length;
            const completionRate = classTotal > 0 ? Math.round((submitted / classTotal) * 100) : 0;
            const isOverdue = Boolean(a.due_date && a.due_date < today);
            const overdueCount = isOverdue ? Math.max(classTotal - submitted, 0) : 0;
            const avgAccuracy = subs.length > 0
              ? Math.round(subs.reduce((sum, s) => sum + (s.accuracy_rate ?? 0), 0) / subs.length * 10) / 10
              : null;
            return { ...a, subs, classTotal, submitted, completionRate, isOverdue, overdueCount, avgAccuracy };
          });

          // 班级对比：每个班的作业完成情况汇总
          const classSummary: Record<string, { total: number; sumRate: number; overdueTotal: number; assignments: number }> = {};
          stats.forEach(s => {
            if (!classSummary[s.class_name]) classSummary[s.class_name] = { total: 0, sumRate: 0, overdueTotal: 0, assignments: 0 };
            classSummary[s.class_name].assignments += 1;
            classSummary[s.class_name].sumRate += s.completionRate;
            classSummary[s.class_name].overdueTotal += s.overdueCount;
          });

          // 顶部汇总指标
          const totalActive = activeAssignments.length;
          const avgCompletionRate = allSubmissionsLoaded && stats.length > 0
            ? Math.round(stats.reduce((sum, s) => sum + s.completionRate, 0) / stats.length)
            : null;
          const totalOverdue = stats.reduce((sum, s) => sum + s.overdueCount, 0);

          return (
            <div className="space-y-6">
              {/* 顶部按钮行 */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">作业看板</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAllSubmissionsLoaded(false);
                      setAssignmentSubmissions({});
                      const allIds = [...activeAssignments, ...assignmentHistory].map(a => a.id);
                      void loadAllSubmissions(allIds);
                    }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> 刷新数据
                  </button>
                  <button
                    onClick={() => void openAssignModal()}
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                  >
                    <ClipboardList className="w-3 h-3" /> 布置新作业
                  </button>
                </div>
              </div>

              {/* 汇总卡片 */}
              {allSubmissionsLoaded && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                    <p className="text-2xl font-bold text-blue-600">{totalActive}</p>
                    <p className="text-xs text-slate-500 mt-1">生效作业数</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                    <p className={`text-2xl font-bold ${avgCompletionRate != null && avgCompletionRate >= 80 ? 'text-emerald-600' : avgCompletionRate != null && avgCompletionRate >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>
                      {avgCompletionRate != null ? `${avgCompletionRate}%` : '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">平均完成率</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                    <p className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{totalOverdue}</p>
                    <p className="text-xs text-slate-500 mt-1">逾期未提交</p>
                  </div>
                </div>
              )}

              {allSubmissionsLoading && (
                <div className="text-center py-8 text-slate-400 text-sm">正在加载提交数据...</div>
              )}

              {/* 班级对比 */}
              {allSubmissionsLoaded && Object.keys(classSummary).length > 1 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-800 mb-4">班级完成率对比</h4>
                  <div className="space-y-3">
                    {Object.entries(classSummary)
                      .map(([cls, info]) => ({
                        cls,
                        avgRate: info.assignments > 0 ? Math.round(info.sumRate / info.assignments) : 0,
                        overdueTotal: info.overdueTotal,
                        assignments: info.assignments,
                      }))
                      .sort((a, b) => b.avgRate - a.avgRate)
                      .map(({ cls, avgRate, overdueTotal, assignments }) => (
                        <div key={cls} className="flex items-center gap-3">
                          <div className="w-24 text-xs font-medium text-slate-700 text-right shrink-0">{cls}</div>
                          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${avgRate >= 80 ? 'bg-emerald-500' : avgRate >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${avgRate}%` }}
                            />
                          </div>
                          <div className="w-24 flex items-center gap-1.5 text-xs shrink-0">
                            <span className={`font-bold ${avgRate >= 80 ? 'text-emerald-600' : avgRate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{avgRate}%</span>
                            <span className="text-slate-400">({assignments}条作业)</span>
                          </div>
                          {overdueTotal > 0 && (
                            <span className="text-xs text-red-500 font-medium shrink-0">⚠ {overdueTotal}人逾期</span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 每条作业详情 */}
              <div className="space-y-4">
                {stats.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">暂无作业，点击"布置新作业"开始</div>
                ) : (
                  stats.map(a => {
                    const isExpanded = expandedAssignmentId === a.id;
                    return (
                      <div key={a.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        {/* 作业头部 */}
                        <div className="px-5 pt-4 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-bold text-slate-900">{a.class_name}</span>
                                {a.is_active && (!a.due_date || a.due_date >= today) ? (
                                  <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">生效中</span>
                                ) : a.isOverdue ? (
                                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">已逾期</span>
                                ) : (
                                  <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">已结束</span>
                                )}
                                {a.overdueCount > 0 && (
                                  <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full">⚠ {a.overdueCount}人未交</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600">📖 {a.material_title}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                布置于 {new Date(a.created_at).toLocaleDateString('zh-CN')}
                                {a.due_date && <span className="ml-2">截止：{a.due_date}</span>}
                              </p>
                            </div>
                            {/* 右侧：效果指标 + 删除 */}
                            <div className="flex items-start gap-3 shrink-0">
                              {allSubmissionsLoaded && a.avgAccuracy != null && (
                                <div className="text-center">
                                  <p className={`text-lg font-bold ${a.avgAccuracy >= 85 ? 'text-emerald-600' : a.avgAccuracy >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                                    {a.avgAccuracy}%
                                  </p>
                                  <p className="text-xs text-slate-400">平均正确率</p>
                                </div>
                              )}
                              <button
                                onClick={() => void deleteAssignment(a.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-0.5"
                                title="永久删除作业"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* 完成率进度条 */}
                          {allSubmissionsLoaded && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                <span>完成率</span>
                                <span className="font-semibold text-slate-700">{a.submitted}/{a.classTotal > 0 ? a.classTotal : '?'} 人已提交</span>
                              </div>
                              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    a.completionRate >= 80 ? 'bg-emerald-500'
                                    : a.completionRate >= 50 ? 'bg-amber-400'
                                    : 'bg-red-400'
                                  }`}
                                  style={{ width: a.classTotal > 0 ? `${a.completionRate}%` : '0%' }}
                                />
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className={`text-xs font-bold ${a.completionRate >= 80 ? 'text-emerald-600' : a.completionRate >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                                  {a.classTotal > 0 ? `${a.completionRate}%` : '班级人数未知'}
                                </span>
                                <button
                                  onClick={() => {
                                    if (isExpanded) {
                                      setExpandedAssignmentId(null);
                                    } else {
                                      void loadSubmissions(a.id);
                                    }
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  <Users className="w-3 h-3" />
                                  {isExpanded ? '收起名单' : '查看名单'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 展开：提交名单 */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-600">已提交名单（{a.subs.length} 人）</p>
                              <button
                                onClick={() => void refreshSubmissions(a.id)}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" /> 刷新
                              </button>
                            </div>
                            {a.subs.length === 0 ? (
                              <p className="text-xs text-slate-400 py-2">暂无学生提交</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-200">
                                      <th className="text-left py-1.5 pr-4 font-medium">姓名</th>
                                      <th className="text-left py-1.5 pr-4 font-medium">学号</th>
                                      <th className="text-left py-1.5 pr-4 font-medium">正确率</th>
                                      <th className="text-left py-1.5 font-medium">提交时间</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {a.subs
                                      .slice()
                                      .sort((x, y) => (y.accuracy_rate ?? 0) - (x.accuracy_rate ?? 0))
                                      .map((s, idx) => (
                                        <tr key={s.id} className="border-b border-slate-100 hover:bg-white">
                                          <td className="py-1.5 pr-4 font-medium text-slate-800">
                                            {idx === 0 && a.subs.length > 1 && <span className="mr-1">🥇</span>}
                                            {s.student_name}
                                          </td>
                                          <td className="py-1.5 pr-4 text-slate-500">{s.student_number || '—'}</td>
                                          <td className="py-1.5 pr-4">
                                            {s.accuracy_rate != null ? (
                                              <span className={`font-bold ${s.accuracy_rate >= 90 ? 'text-emerald-600' : s.accuracy_rate >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                                                {s.accuracy_rate}%
                                              </span>
                                            ) : '—'}
                                          </td>
                                          <td className="py-1.5 text-slate-400">
                                            {new Date(s.submitted_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 布置作业模态框 */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                布置班级作业
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* 选班级 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">选择班级 <span className="text-red-500">*</span></label>
                <select
                  value={assignClass}
                  onChange={e => setAssignClass(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none bg-white"
                >
                  <option value="">请选择班级</option>
                  {classes.map(c => (
                    <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                  ))}
                </select>
              </div>

              {/* 选素材 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">选择听力素材 <span className="text-red-500">*</span></label>
                {libraryLoading ? (
                  <p className="text-sm text-slate-400">加载素材库...</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {libraryMaterials.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setAssignMaterialId(m.id); setAssignMaterialTitle(m.title); }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2
                          ${assignMaterialId === m.id ? 'bg-emerald-50 border-l-4 border-emerald-500' : ''}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900 line-clamp-1">{m.title}</p>
                          <p className="text-xs text-slate-400">{m.category} · {m.word_count} 词</p>
                        </div>
                        {assignMaterialId === m.id && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                      </button>
                    ))}
                    {libraryMaterials.length === 0 && (
                      <p className="px-4 py-6 text-sm text-slate-400 text-center">素材库暂无内容</p>
                    )}
                  </div>
                )}
              </div>

              {/* 截止日期（可选） */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">截止日期（可选）</label>
                <input
                  type="date"
                  value={assignDueDate}
                  onChange={e => setAssignDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                />
              </div>

              {/* 预览 */}
              {assignClass && assignMaterialId && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-emerald-800">
                  📚 将为 <strong>{assignClass}</strong> 布置：{assignMaterialTitle}
                  {assignDueDate && <>，截止 <strong>{assignDueDate}</strong></>}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void submitAssignment()}
                disabled={!assignClass || !assignMaterialId || assignSaving}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {assignSaving ? '布置中...' : <><Save className="w-4 h-4" />确认布置</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑学生班级对话框 */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">编辑学生班级</h3>
                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setEditClassName('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  disabled={saving}
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    学生姓名
                  </label>
                  <div className="px-4 py-3 bg-slate-50 rounded-lg text-slate-900 font-medium">
                    {editingStudent.student_name}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    当前班级
                  </label>
                  <div className="px-4 py-3 bg-slate-50 rounded-lg text-slate-600">
                    {editingStudent.class_name || '(未设置)'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新班级名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editClassName}
                    onChange={(e) => setEditClassName(e.target.value)}
                    placeholder="例如：A甲2"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    autoFocus
                    disabled={saving}
                  />
                  {editClassName && normalizeClassName(editClassName) !== editClassName && (
                    <div className="mt-2 flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm">
                        <span className="text-blue-700">将标准化为：</span>
                        <span className="font-semibold text-blue-900 ml-1">
                          {normalizeClassName(editClassName)}
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    💡 提示：更新后会同时修改该学生的所有历史记录
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  <p className="font-semibold mb-1">📊 影响范围：</p>
                  <ul className="text-xs space-y-1">
                    <li>• 该学生的 {editingStudent.total_practices} 条练习记录</li>
                    <li>• 学生信息表中的班级字段</li>
                    <li>• 班级统计数据将自动更新</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={updateStudentClass}
                  disabled={!editClassName.trim() || saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      保存更改
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setEditClassName('');
                  }}
                  disabled={saving}
                  className="px-6 py-3 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeClassName } from '../utils/classNameNormalizer';
import ClassManagement from './ClassManagement';
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
  Lightbulb,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Shield,
} from 'lucide-react';
import {
  generateTeachingSuggestion,
  saveSuggestion,
  adoptSuggestion as adoptSuggestionDB,
  ignoreSuggestion as ignoreSuggestionDB,
  loadSuggestionsForClass,
  isLlmEnabled,
  setLlmEnabled,
} from '../utils/teachingSuggestionEngine';
import type { TeachingInput, TeachingSuggestion } from '../utils/teachingSuggestionEngine';
import {
  listTeachers,
  createTeacher,
  deleteTeacher,
  resetTeacherPassword,
} from '../utils/teacherManager';
import type { TeacherInfo } from '../utils/teacherManager';
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
  isSuperAdmin?: boolean;
  teacherUserId?: string | null;
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

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onBack, isSuperAdmin = false, teacherUserId = null }) => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [classes, setClasses] = useState<ClassStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [difficultyStats, setDifficultyStats] = useState<DifficultyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('全部');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  // 当前登录教师"自己的"学号集合（用于判断是否可编辑该学生）
  const [ownedStudentNumbers, setOwnedStudentNumbers] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'classes' | 'trends' | 'suggestions' | 'assignments' | 'teachers' | 'classManagement'>('overview');
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
  interface AssignmentSubmission {
    id: string;
    student_name: string;
    student_number: string | null;
    submitted_at: string;
    accuracy_rate: number | null;
    is_suspicious?: boolean | null;
    suspicious_reasons?: string[] | null;
    pasted_count?: number | null;
    suspicious_sentence_count?: number | null;
  }
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignClass, setAssignClass] = useState('');
  const [assignMaterialId, setAssignMaterialId] = useState('');
  const [assignMaterialTitle, setAssignMaterialTitle] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  interface AssignWeakness {
    topSubtypes: Array<{ key: string; label: string; count: number }>;
    loading: boolean;
    hasData: boolean;
  }
  const [assignClassWeakness, setAssignClassWeakness] = useState<AssignWeakness | null>(null);
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

  // ── 班级周报（完全独立，不影响任何已有功能）──────────────────────────────
  interface ClassReportData {
    className: string;
    generatedAt: string;
    weekRange: string;
    assignmentStats: { total: number; avgCompletion: number; avgAccuracy: number; suspiciousCount: number };
    errorDistribution: { A: number; B: number; C: number; D: number; total: number; topSubtypes: Array<{ key: string; label: string; count: number }> };
    practiceStats: { totalRecords: number; activeStudents: number };
    inactiveStudents: string[];
    classTotal: number;
  }
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [classReport, setClassReport] = useState<ClassReportData | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);

  // ── 教学建议标签页（teachingSuggestionEngine 接入）──────────────────────
  const [suggestionClass, setSuggestionClass] = useState('');
  const [suggestionGenerating, setSuggestionGenerating] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<TeachingSuggestion | null>(null);
  const [suggestionHistory, setSuggestionHistory] = useState<TeachingSuggestion[]>([]);
  const [suggestionHistoryLoading, setSuggestionHistoryLoading] = useState(false);
  const [suggLlmEnabled, setSuggLlmEnabled] = useState(isLlmEnabled());

  // 编辑学生信息的状态
  const [editingStudent, setEditingStudent] = useState<StudentSummary | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [saving, setSaving] = useState(false);

  // 修改密码
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // ── 教师管理（仅超管可见）────────────────────────────────────
  const [teacherList, setTeacherList] = useState<TeacherInfo[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');

  // 新增教师表单
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherSchool, setNewTeacherSchool] = useState('');
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [addTeacherError, setAddTeacherError] = useState('');
  const [addTeacherSuccess, setAddTeacherSuccess] = useState('');

  // 重置某教师密码
  const [resetTargetId, setResetTargetId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resettingId, setResettingId] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const fetchTeachers = async () => {
    setTeachersLoading(true);
    setTeachersError('');
    try {
      const list = await listTeachers();
      setTeacherList(list);
    } catch (e: unknown) {
      setTeachersError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setTeachersLoading(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!newTeacherName.trim()) { setAddTeacherError('请输入教师姓名'); return; }
    if (!newTeacherPassword.trim() || newTeacherPassword.length < 6) {
      setAddTeacherError('密码至少 6 位'); return;
    }
    setAddingTeacher(true);
    setAddTeacherError('');
    setAddTeacherSuccess('');
    try {
      const t = await createTeacher(newTeacherName.trim(), newTeacherSchool.trim(), newTeacherPassword);
      setTeacherList(prev => [...prev, t]);
      setAddTeacherSuccess(`已成功创建教师账号：${t.name}`);
      setNewTeacherName('');
      setNewTeacherSchool('');
      setNewTeacherPassword('');
    } catch (e: unknown) {
      setAddTeacherError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setAddingTeacher(false);
    }
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!window.confirm(`确认删除教师"${name}"的账号？此操作不可恢复。`)) return;
    try {
      await deleteTeacher(id);
      setTeacherList(prev => prev.filter(t => t.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword.trim() || resetPassword.length < 6) {
      setResetError('密码至少 6 位'); return;
    }
    setResettingId(resetTargetId);
    setResetError('');
    setResetSuccess('');
    try {
      await resetTeacherPassword(resetTargetId, resetPassword);
      setResetSuccess('密码已重置');
      setResetPassword('');
      setTimeout(() => { setResetTargetId(''); setResetSuccess(''); }, 1500);
    } catch (e: unknown) {
      setResetError(e instanceof Error ? e.message : '重置失败');
    } finally {
      setResettingId('');
    }
  };
  // ─────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!newPassword) { setPasswordError('请输入新密码'); return; }
    if (newPassword.length < 6) { setPasswordError('密码至少 6 位'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('两次输入的密码不一致'); return; }
    setPasswordLoading(true);
    setPasswordError('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      setPasswordError('修改失败，请重试');
    } else {
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 1500);
    }
  };
  
  // 学生详细练习记录
  const [studentRecords, setStudentRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // 加载所有数据
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Step 1: 从 students 表取当前教师自己的学生名单（超管也只看自己的）──
      // 设计原则：每位教师（含超管）的统计分析只显示自己的数据
      // 超管的特权仅限于"教师管理"Tab，不扩展到统计范围
      let rosterQuery = supabase
        .from('students')
        .select('student_name, student_number, class_name, teacher_id');
      if (teacherUserId) {
        rosterQuery = rosterQuery.eq('teacher_id', teacherUserId);
      }
      const { data: rosterData } = await rosterQuery;
      const roster = rosterData ?? [];

      // 用于前端过滤的 key 集合
      const allowedStudentKeys: Set<string> = new Set(
        roster.map(s => `${s.student_name}|${s.class_name ?? ''}`)
      );

      // ── Step 2: 从 student_summary 视图获取有练习记录的统计，前端按名单过滤 ──
      const { data: studentsData, error: studentsError } = await supabase
        .from('student_summary')
        .select('*')
        .order('avg_accuracy', { ascending: false });

      if (studentsError) throw studentsError;
      const filteredSummary = (studentsData || []).filter(s =>
        allowedStudentKeys.has(`${s.student_name}|${s.class_name ?? ''}`)
      );

      // ── Step 3: 将名单与统计合并——名单中有、统计中没有的学生补零 ──
      const summaryMap = new Map<string, StudentSummary>();
      for (const s of filteredSummary) {
        summaryMap.set(`${s.student_name}|${s.class_name ?? ''}`, s as StudentSummary);
      }
      const mergedStudents: StudentSummary[] = [...filteredSummary as StudentSummary[]];
      const seenKeys = new Set(filteredSummary.map(s => `${s.student_name}|${s.class_name ?? ''}`));

      for (const r of roster) {
        const key = `${r.student_name}|${r.class_name ?? ''}`;
        if (!seenKeys.has(key)) {
          mergedStudents.push({
            student_name: r.student_name,
            student_number: r.student_number,
            class_name: r.class_name ?? '',
            total_practices: 0,
            avg_accuracy: 0,
            total_words_practiced: 0,
            perfect_sentence_count: 0,
            last_practice_date: '',
            recent_practices: 0,
            best_accuracy: 0,
            worst_accuracy: 0,
          });
          seenKeys.add(key);
        }
      }
      setStudents(mergedStudents);

      // 记录"自己的"学号集合，用于控制编辑按钮是否可见
      setOwnedStudentNumbers(
        new Set(roster.map(r => r.student_number).filter(Boolean))
      );

      // ── Step 4: 班级统计——只取自己学生所在的班级 ──
      const { data: classesData, error: classesError } = await supabase
        .from('class_stats')
        .select('*')
        .order('avg_accuracy', { ascending: false });

      if (classesError) throw classesError;
      const allowedClassNames = new Set(mergedStudents.map(s => s.class_name).filter(Boolean));
      const filteredClasses = (classesData || []).filter(c => allowedClassNames.has(c.class_name));

      // 把名单里有但 class_stats 没有的班级补进来（零练习）
      const classStatsMap = new Map<string, ClassStats>(
        filteredClasses.map(c => [c.class_name, c as ClassStats])
      );
      const rosterClassMap = new Map<string, number>();
      for (const s of mergedStudents) {
        const cn = s.class_name ?? '';
        if (cn) rosterClassMap.set(cn, (rosterClassMap.get(cn) ?? 0) + 1);
      }
      const mergedClasses: ClassStats[] = [...filteredClasses as ClassStats[]];
      for (const [cn, count] of rosterClassMap.entries()) {
        if (!classStatsMap.has(cn)) {
          mergedClasses.push({
            class_name: cn,
            student_count: count,
            total_practices: 0,
            avg_accuracy: 0,
            total_words_practiced: 0,
          });
        }
      }
      setClasses(mergedClasses);

      // ── Step 5: 每日趋势——按自己的学生名单过滤 practice_records 后前端聚合 ──
      const allowedNames = mergedStudents.map(s => s.student_name).filter(Boolean);
      if (allowedNames.length === 0) {
        setDailyStats([]);
      } else {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data: rawRecords } = await supabase
          .from('practice_records')
          .select('created_at, accuracy_rate, total_words, student_name')
          .in('student_name', allowedNames)
          .gte('created_at', since.toISOString());

        const dayMap: Record<string, { count: number; students: Set<string>; accSum: number; words: number }> = {};
        for (const r of rawRecords || []) {
          const day = (r.created_at as string).slice(0, 10);
          if (!dayMap[day]) dayMap[day] = { count: 0, students: new Set(), accSum: 0, words: 0 };
          dayMap[day].count++;
          dayMap[day].students.add(r.student_name);
          dayMap[day].accSum += r.accuracy_rate ?? 0;
          dayMap[day].words += r.total_words ?? 0;
        }
        const aggregated = Object.entries(dayMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-7)
          .map(([day, v]) => ({
            practice_date: day,
            practice_count: v.count,
            active_students: v.students.size,
            avg_accuracy: v.count > 0 ? Math.round((v.accSum / v.count) * 10) / 10 : 0,
            words_practiced: v.words,
          }));
        setDailyStats(aggregated);
      }

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

  // 作业弹框打开且选定班级时，自动拉取该班近两周弱点
  useEffect(() => {
    if (showAssignModal && assignClass) {
      void loadAssignClassWeakness(assignClass);
    } else if (!showAssignModal) {
      setAssignClassWeakness(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAssignModal, assignClass]);

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
      //    加 teacher_id 过滤，避免误改其他教师同名学生的记录
      let prQuery = supabase
        .from('practice_records')
        .update({ class_name: normalizedClassName })
        .eq('student_name', editingStudent.student_name);
      if (!isSuperAdmin && teacherUserId) {
        prQuery = prQuery.eq('teacher_id', teacherUserId);
      } else if (editingStudent.student_number) {
        // 超管：通过学号+姓名精确定位，避免跨租户误改
        prQuery = prQuery.eq('student_number', editingStudent.student_number);
      }
      const { error: recordsError } = await prQuery;

      if (recordsError) throw recordsError;

      // 2. 更新 students 表（同样精确过滤）
      let stQuery = supabase
        .from('students')
        .update({ class_name: normalizedClassName })
        .eq('student_name', editingStudent.student_name);
      if (!isSuperAdmin && teacherUserId) {
        stQuery = stQuery.eq('teacher_id', teacherUserId);
      } else if (editingStudent.student_number) {
        stQuery = stQuery.eq('student_number', editingStudent.student_number);
      }
      const { error: studentsError } = await stQuery;

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
        teacher_id: teacherUserId ?? null,
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
      // 普通教师只能查自己创建的作业（按 teacher_id 过滤）
      let query = supabase
        .from('class_assignments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isSuperAdmin && teacherUserId) {
        query = query.eq('teacher_id', teacherUserId);
      }

      const { data, error } = await query;
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

  // ── 生成班级周报 ────────────────────────────────────────────────────────────
  const REPORT_SUBTYPE_LABELS: Record<string, string> = {
    A1: '漏冠词', A2: '漏介词', A3: '漏连词', A4: '漏代词', A5: '漏助动词',
    B1: '连读误判', B2: '弱读误判', B3: '同音混淆', B4: '尾音丢失', B5: '缩读误解',
    C1: '单词拼错', C2: '大小写', C3: '标点缺失',
    D1: '时态错误', D2: '单复数', D3: '主谓不一致',
  };

  // 加载指定班级近两周的高频错误子类型（用于作业推荐）
  const loadAssignClassWeakness = async (className: string) => {
    if (!className) { setAssignClassWeakness(null); return; }
    setAssignClassWeakness({ topSubtypes: [], loading: true, hasData: false });
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      // 普通教师：额外限制只查自己学生的记录（RLS 已在数据库层过滤，此处作前端保险）
      let q = supabase
        .from('practice_records')
        .select('error_summary, student_name')
        .eq('class_name', className)
        .gte('created_at', since.toISOString());
      // 若 RLS 未生效，前端用学生名单再过滤
      const allowedNames = !isSuperAdmin
        ? students.map(s => s.student_name).filter(Boolean)
        : null;
      const { data: records } = await q;
      const filteredRecords = allowedNames && allowedNames.length > 0
        ? (records || []).filter((r: any) => allowedNames.includes(r.student_name))
        : (records || []);

      const subtypeCounts: Record<string, number> = {};
      filteredRecords.forEach((r: any) => {
        const bySubtype = r.error_summary?.by_subtype || {};
        Object.entries(bySubtype).forEach(([k, v]) => {
          subtypeCounts[k] = (subtypeCounts[k] || 0) + (Number(v) || 0);
        });
      });

      const topSubtypes = Object.entries(subtypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => ({ key, label: REPORT_SUBTYPE_LABELS[key] || key, count }));

      setAssignClassWeakness({
        topSubtypes,
        loading: false,
        hasData: filteredRecords.length > 0,
      });
    } catch {
      setAssignClassWeakness({ topSubtypes: [], loading: false, hasData: false });
    }
  };

  // ── 教学建议标签页：加载历史 ──────────────────────────────────────────────
  const loadSuggestionHistory = async (className: string) => {
    if (!className) { setSuggestionHistory([]); return; }
    setSuggestionHistoryLoading(true);
    try {
      const history = await loadSuggestionsForClass(className);
      setSuggestionHistory(history);
    } catch { setSuggestionHistory([]); }
    finally { setSuggestionHistoryLoading(false); }
  };

  // ── 生成班级教学建议 ─────────────────────────────────────────────────────
  const handleGenerateSuggestion = async () => {
    if (!suggestionClass) return;
    setSuggestionGenerating(true);
    setActiveSuggestion(null);
    try {
      // 错因分布：优先使用已加载数据，否则临时查一次
      let errorProfile = classErrorProfiles[suggestionClass] ?? { A: 0, B: 0, C: 0, D: 0, total: 0 };
      if (errorProfile.total === 0 && Object.keys(classErrorProfiles).length === 0) {
        // classErrorProfiles 未加载时，快速拉一次近14天数据
        const since14 = new Date(); since14.setDate(since14.getDate() - 14);
        const { data: recs } = await supabase
          .from('practice_records').select('error_summary').eq('class_name', suggestionClass)
          .gte('created_at', since14.toISOString());
        const ep = { A: 0, B: 0, C: 0, D: 0, total: 0 };
        (recs || []).forEach((r: any) => {
          const bc = r.error_summary?.by_category || {};
          (['A', 'B', 'C', 'D'] as const).forEach(k => {
            ep[k] += Number(bc[k]) || 0;
            ep.total += Number(bc[k]) || 0;
          });
        });
        errorProfile = ep;
      }

      // 班级基础数据
      const cls = classes.find(c => c.class_name === suggestionClass);
      const avgAccuracy = cls?.avg_accuracy ?? null;

      // 近7天练习次数 & 趋势
      const since7 = new Date(); since7.setDate(since7.getDate() - 7);
      const since14 = new Date(); since14.setDate(since14.getDate() - 14);
      const { data: weekRecs } = await supabase
        .from('practice_records').select('accuracy_rate, created_at')
        .eq('class_name', suggestionClass).gte('created_at', since14.toISOString());
      const weekPractice = (weekRecs || []).filter(r => new Date(r.created_at) >= since7);
      const prevPractice = (weekRecs || []).filter(r => new Date(r.created_at) < since7);
      const weeklyPracticeCount = weekPractice.length;
      const weekAvg = weekPractice.length > 0 ? weekPractice.reduce((s: number, r: any) => s + (r.accuracy_rate || 0), 0) / weekPractice.length : null;
      const prevAvg = prevPractice.length > 0 ? prevPractice.reduce((s: number, r: any) => s + (r.accuracy_rate || 0), 0) / prevPractice.length : null;
      const recentTrend: TeachingInput['recentTrend'] =
        weekAvg == null || prevAvg == null ? 'unknown'
        : weekAvg - prevAvg > 3 ? 'improving'
        : prevAvg - weekAvg > 3 ? 'declining' : 'stable';

      // 作业数据：复用已加载的 assignmentSubmissions
      const classAssigns = [...activeAssignments, ...assignmentHistory].filter(a => a.class_name === suggestionClass);
      const classSubs = classAssigns.flatMap(a => assignmentSubmissions[a.id] || []);
      const classStudents = students.filter(s => s.class_name === suggestionClass);
      const classSize = classStudents.length || 1;
      const completionRate = classAssigns.length > 0
        ? Math.round((new Set(classSubs.map((s: any) => s.student_name)).size / classSize) * 100)
        : null;
      const avgAcc = classSubs.length > 0
        ? Math.round(classSubs.reduce((s: number, sub: any) => s + (sub.accuracy_rate || 0), 0) / classSubs.length)
        : null;

      const input: TeachingInput = {
        className: suggestionClass,
        errorProfile,
        assignmentCompletionRate: completionRate,
        assignmentAvgAccuracy: avgAcc,
        recentTrend,
        avgAccuracy,
        weeklyPracticeCount,
      };

      const suggestion = await generateTeachingSuggestion(input);
      const saved = await saveSuggestion(suggestion);
      setActiveSuggestion(saved);
      // 刷新历史
      void loadSuggestionHistory(suggestionClass);
    } catch (e: any) {
      alert('生成失败：' + e.message);
    } finally {
      setSuggestionGenerating(false);
    }
  };

  const handleAdoptSuggestion = async (id: string) => {
    try {
      const cls = classes.find(c => c.class_name === suggestionClass);
      await adoptSuggestionDB(id, cls?.avg_accuracy ?? null);
      setSuggestionHistory(prev => prev.map(s => s.id === id ? { ...s, status: 'adopted' } : s));
      if (activeSuggestion?.id === id) setActiveSuggestion(prev => prev ? { ...prev, status: 'adopted' } : null);
    } catch (e: any) { alert('采纳失败：' + e.message); }
  };

  const handleIgnoreSuggestion = async (id: string) => {
    try {
      await ignoreSuggestionDB(id);
      setSuggestionHistory(prev => prev.map(s => s.id === id ? { ...s, status: 'ignored' } : s));
      if (activeSuggestion?.id === id) setActiveSuggestion(prev => prev ? { ...prev, status: 'ignored' } : null);
    } catch (e: any) { alert('忽略失败：' + e.message); }
  };

  const generateClassReport = async (className: string) => {
    setShowReportModal(true);
    setReportLoading(true);
    setClassReport(null);
    setAiSuggestion(null);

    try {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const weekRange = `${since.toLocaleDateString('zh-CN')} — ${new Date().toLocaleDateString('zh-CN')}`;

      // 1. 查询近7天该班级的练习记录（含 error_summary）
      const { data: records } = await supabase
        .from('practice_records')
        .select('student_name, error_summary, created_at')
        .eq('class_name', className)
        .gte('created_at', since.toISOString());

      // 2. 计算错误类型分布
      const errorTotals = { A: 0, B: 0, C: 0, D: 0 };
      const subtypeCounts: Record<string, number> = {};
      (records || []).forEach((r: any) => {
        const es = r.error_summary;
        if (!es) return;
        if (es.by_category) {
          Object.entries(es.by_category).forEach(([k, v]) => {
            if (k in errorTotals) (errorTotals as any)[k] += Number(v) || 0;
          });
        }
        if (es.by_subtype) {
          Object.entries(es.by_subtype).forEach(([k, v]) => {
            subtypeCounts[k] = (subtypeCounts[k] || 0) + (Number(v) || 0);
          });
        }
      });
      const errorTotal = Object.values(errorTotals).reduce((s, v) => s + v, 0);
      const topSubtypes = Object.entries(subtypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => ({ key, label: REPORT_SUBTYPE_LABELS[key] || key, count }));

      // 3. 活跃/不活跃学生
      const activeNames = new Set((records || []).map((r: any) => r.student_name as string));
      const classStudents = students.filter(s => s.class_name === className);
      const inactiveStudents = classStudents
        .filter(s => !activeNames.has(s.student_name))
        .map(s => s.student_name);
      const classInfo = classes.find(c => c.class_name === className);
      const classTotal = classInfo?.student_count ?? classStudents.length;

      // 4. 作业统计（复用已加载的 assignmentSubmissions）
      const classAssignments = [...activeAssignments, ...assignmentHistory].filter(a => a.class_name === className);
      let totalSubs = 0, totalAccSum = 0, suspiciousCount = 0;
      classAssignments.forEach(a => {
        const subs = assignmentSubmissions[a.id] || [];
        totalSubs += subs.length;
        totalAccSum += subs.reduce((s, sub) => s + (sub.accuracy_rate ?? 0), 0);
        suspiciousCount += subs.filter(s => s.is_suspicious).length;
      });
      const avgAccuracy = totalSubs > 0 ? Math.round(totalAccSum / totalSubs) : 0;
      const avgCompletion = classAssignments.length > 0 && classTotal > 0
        ? Math.round((totalSubs / classAssignments.length / classTotal) * 100)
        : 0;

      const report: ClassReportData = {
        className, generatedAt: new Date().toLocaleString('zh-CN'), weekRange,
        assignmentStats: { total: classAssignments.length, avgCompletion, avgAccuracy, suspiciousCount },
        errorDistribution: { ...errorTotals, total: errorTotal, topSubtypes },
        practiceStats: { totalRecords: (records || []).length, activeStudents: activeNames.size },
        inactiveStudents, classTotal,
      };
      setClassReport(report);

      // 5. 生成 AI 建议（单独调用，失败不影响数据展示）
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
      const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
      if (supabaseUrl && supabaseAnonKey) {
        setAiSuggestionLoading(true);
        const dominant = Object.entries(errorTotals).sort((a, b) => b[1] - a[1])[0];
        const dominantLabel = dominant[0] === 'A' ? 'A类漏词' : dominant[0] === 'B' ? 'B类辨音/连读' : dominant[0] === 'C' ? 'C类拼写' : 'D类语法';
        const contextText = `
班级：${className}，统计周期：${weekRange}
作业情况：共 ${classAssignments.length} 份作业，平均完成率 ${avgCompletion}%，平均正确率 ${avgAccuracy}%，可疑提交 ${suspiciousCount} 份
练习活跃度：近7天 ${activeNames.size} 人有练习记录（共 ${classTotal} 人），不活跃 ${inactiveStudents.length} 人
错误分布：A漏词 ${errorTotals.A} 次，B辨音 ${errorTotals.B} 次，C拼写 ${errorTotals.C} 次，D语法 ${errorTotals.D} 次
高频弱点：${topSubtypes.map(t => `${t.label}(${t.count}次)`).join('、') || '暂无数据'}
最突出问题：${dominantLabel}（占总错误 ${errorTotal > 0 ? Math.round(dominant[1] / errorTotal * 100) : 0}%）
`.trim();

        fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `你是经验丰富的英语听力教研员，根据班级练习数据给出具体、可执行的教学建议。
要求：
1. 输出三个部分，用固定标题（Markdown 加粗）：**本周主要问题** / **教学建议** / **下周重点**
2. 每部分 1-2 句，总字数不超过 150 字
3. 建议要具体：点名高频错误类型，建议具体练习方式（如：课堂专项练弱读词、布置连读音频材料）
4. 如果数据很少（练习次数 < 5），说明数据不足并给出基础建议`,
              },
              { role: 'user', content: contextText },
            ],
            stream: false,
            temperature: 0.3,
          }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
            setAiSuggestion(data?.choices?.[0]?.message?.content ?? null);
          })
          .catch((err) => {
            console.warn('[ClassReport] AI 建议生成失败:', err);
            setAiSuggestion(null);
          })
          .finally(() => setAiSuggestionLoading(false));
      }
    } catch (e) {
      console.error('[ClassReport] 生成失败:', e);
    } finally {
      setReportLoading(false);
    }
  };

  // 批量加载所有作业的提交数据（看板用）
  const loadAllSubmissions = async (assignmentIds: string[]) => {
    if (assignmentIds.length === 0) { setAllSubmissionsLoaded(true); return; }
    setAllSubmissionsLoading(true);
    try {
      const FULL_COLS = 'id, assignment_id, student_name, student_number, submitted_at, accuracy_rate, is_suspicious, suspicious_reasons, pasted_count, suspicious_sentence_count';
      const FALLBACK_COLS = 'id, assignment_id, student_name, student_number, submitted_at, accuracy_rate';
      let { data, error } = await supabase
        .from('assignment_submissions')
        .select(FULL_COLS)
        .in('assignment_id', assignmentIds)
        .order('submitted_at', { ascending: false });
      if (error && /column .* does not exist|is_suspicious|suspicious_reasons|pasted_count|suspicious_sentence_count/i.test(error.message || '')) {
        const fallback: any = await supabase
          .from('assignment_submissions')
          .select(FALLBACK_COLS)
          .in('assignment_id', assignmentIds)
          .order('submitted_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
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
      const FULL_COLS = 'id, student_name, student_number, submitted_at, accuracy_rate, is_suspicious, suspicious_reasons, pasted_count, suspicious_sentence_count';
      const FALLBACK_COLS = 'id, student_name, student_number, submitted_at, accuracy_rate';
      let { data, error } = await supabase
        .from('assignment_submissions')
        .select(FULL_COLS)
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });
      if (error && /column .* does not exist|is_suspicious|suspicious_reasons|pasted_count|suspicious_sentence_count/i.test(error.message || '')) {
        const fallback: any = await supabase
          .from('assignment_submissions')
          .select(FALLBACK_COLS)
          .eq('assignment_id', assignmentId)
          .order('submitted_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
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
                onClick={() => { setShowPasswordModal(true); setPasswordError(''); setPasswordSuccess(false); }}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm"
                title="修改登录密码"
              >
                <Save className="w-4 h-4" />
                修改密码
              </button>
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
              { key: 'assignments', label: '作业看板', icon: ClipboardList },
              { key: 'suggestions', label: '教学建议', icon: Lightbulb },
              { key: 'classManagement', label: '班级管理', icon: Users },
              ...(isSuperAdmin ? [{ key: 'teachers', label: '教师管理', icon: Shield }] : []),
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key as typeof activeTab);
                  if (tab.key === 'classes' && Object.keys(classErrorProfiles).length === 0 && !classErrorLoading) {
                    void loadClassErrorProfiles();
                  }
                  if (tab.key === 'assignments' && !allSubmissionsLoaded && !allSubmissionsLoading) {
                    const allIds = [...activeAssignments, ...assignmentHistory].map(a => a.id);
                    void loadAllSubmissions(allIds);
                  }
                  if (tab.key === 'teachers' && teacherList.length === 0) {
                    void fetchTeachers();
                  }
                  if (tab.key === 'suggestions') {
                    const defaultClass = classes[0]?.class_name ?? '';
                    if (!suggestionClass && defaultClass) setSuggestionClass(defaultClass);
                    if (defaultClass || suggestionClass) {
                      void loadSuggestionHistory(suggestionClass || defaultClass);
                    }
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

            {/* ── 待关注预警（系统主动发现的异常信号）──────────────────────── */}
            {(() => {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

              // ① 连续低分学生（正确率 < 60%）
              const lowAccStudents = students
                .filter(s => s.avg_accuracy != null && s.avg_accuracy < 60)
                .sort((a, b) => a.avg_accuracy - b.avg_accuracy)
                .slice(0, 6);

              // ② 7天无练习学生（有历史记录但最近停练）
              const inactiveStudents = students
                .filter(s => s.last_practice_date && s.last_practice_date < sevenDaysAgoStr && s.total_practices > 0)
                .sort((a, b) => a.last_practice_date.localeCompare(b.last_practice_date))
                .slice(0, 6);

              // ③ 本周零练习班级
              const inactiveClasses = classes.filter(c => {
                const profile = classErrorProfiles[c.class_name];
                return (!profile || profile.total === 0) && c.student_count > 0;
              });

              const hasAlerts = lowAccStudents.length > 0 || inactiveStudents.length > 0 || inactiveClasses.length > 0;
              if (!hasAlerts) return null;

              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    待关注预警
                    <span className="text-xs font-normal text-amber-600 ml-1">系统自动识别，建议及时跟进</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 低分预警 */}
                    {lowAccStudents.length > 0 && (
                      <div className="bg-white rounded-lg border border-red-200 p-3">
                        <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                          低分学生（正确率 &lt; 60%）
                        </p>
                        <div className="space-y-1.5">
                          {lowAccStudents.map(s => (
                            <div key={s.student_name} className="flex items-center justify-between text-xs">
                              <span className="text-slate-700 truncate">{s.student_name}</span>
                              <span className="ml-2 shrink-0 font-bold text-red-500">{Math.round(s.avg_accuracy)}%</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-red-400 mt-2">建议：降低练习难度或安排个别辅导</p>
                      </div>
                    )}
                    {/* 停练预警 */}
                    {inactiveStudents.length > 0 && (
                      <div className="bg-white rounded-lg border border-orange-200 p-3">
                        <p className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                          7天未练习学生
                        </p>
                        <div className="space-y-1.5">
                          {inactiveStudents.map(s => {
                            const daysDiff = s.last_practice_date
                              ? Math.floor((Date.now() - new Date(s.last_practice_date).getTime()) / 86400000)
                              : null;
                            return (
                              <div key={s.student_name} className="flex items-center justify-between text-xs">
                                <span className="text-slate-700 truncate">{s.student_name}</span>
                                <span className="ml-2 shrink-0 text-orange-400 font-medium">
                                  {daysDiff != null ? `${daysDiff}天前` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-orange-400 mt-2">建议：课堂提醒或布置强制作业</p>
                      </div>
                    )}
                    {/* 低活跃班级 */}
                    {inactiveClasses.length > 0 && (
                      <div className="bg-white rounded-lg border border-amber-200 p-3">
                        <p className="text-xs font-semibold text-amber-600 mb-2 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          近期低活跃班级
                        </p>
                        <div className="space-y-1.5">
                          {inactiveClasses.map(c => (
                            <div key={c.class_name} className="flex items-center justify-between text-xs">
                              <span className="text-slate-700">{c.class_name}</span>
                              <span className="ml-2 text-slate-400">{c.student_count} 人</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-amber-500 mt-2">建议：前往"教学建议"生成本班专项计划</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

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
                            {/* 只对"自己的学生"显示编辑按钮（非自己的学生只读）*/}
                            {(!student.student_number || ownedStudentNumbers.has(student.student_number)) && (
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
                            )}
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
                          {student.total_practices === 0 ? (
                            <div>
                              <div className="text-sm font-medium text-slate-400 bg-slate-100 rounded-full px-3 py-1">暂未练习</div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-2xl font-bold text-slate-900">
                                {student.avg_accuracy}%
                              </div>
                              <div className="text-xs text-slate-500">平均正确率</div>
                            </div>
                          )}
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
                            {student.last_practice_date
                              ? new Date(student.last_practice_date).toLocaleDateString('zh-CN')
                              : '—'}
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
                    {classItem.total_practices === 0 ? (
                      <div className="text-sm font-medium text-slate-400 bg-slate-100 rounded-full px-3 py-1">暂未练习</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-blue-600">
                          {classItem.avg_accuracy}%
                        </div>
                        <p className="text-xs text-slate-500">班级平均正确率</p>
                      </>
                    )}
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
                      {classItem.student_count > 0
                        ? Math.round(classItem.total_practices / classItem.student_count)
                        : 0}
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

        {/* 建议执行率已移除 */}
        {false && (
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
                <div className="flex gap-2 flex-wrap justify-end">
                  {/* 班级周报按钮 */}
                  {classes.length === 1 ? (
                    <button
                      onClick={() => void generateClassReport(classes[0].class_name)}
                      className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <BarChart3 className="w-3 h-3" /> 生成班级周报
                    </button>
                  ) : classes.length > 1 ? (
                    <select
                      className="text-xs px-2 py-1.5 border border-indigo-300 bg-indigo-50 text-indigo-700 rounded-lg cursor-pointer hover:bg-indigo-100 transition-colors"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) { void generateClassReport(e.target.value); e.target.value = ''; } }}
                    >
                      <option value="" disabled>📊 生成班级周报…</option>
                      {classes.map(c => (
                        <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                      ))}
                    </select>
                  ) : null}
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

                        {/* 展开：提交名单 + 未提交名单 */}
                        {isExpanded && (() => {
                          const classStudents = students.filter(st => st.class_name === a.class_name);
                          const submittedNames = new Set(a.subs.map(s => s.student_name.trim().toLowerCase()));
                          const submittedNumbers = new Set(
                            a.subs
                              .filter(s => s.student_number)
                              .map(s => (s.student_number as string).trim())
                          );
                          const unsubmitted = classStudents.filter(st => {
                            const nameMatch = submittedNames.has(st.student_name.trim().toLowerCase());
                            const numMatch = st.student_number ? submittedNumbers.has(st.student_number.trim()) : false;
                            return !nameMatch && !numMatch;
                          });
                          return (
                          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 space-y-4">
                            {/* 已提交名单 */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-slate-600">已提交（{a.subs.length} 人）</p>
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
                                        .map((s, idx) => {
                                          const reasonsText = (s.suspicious_reasons || []).map(r =>
                                            r === 'pasted' ? '粘贴' : r === 'tooFast' ? '按键过快' : r === 'tooFewKeys' ? '按键过少' : r
                                          ).join('、');
                                          return (
                                          <tr key={s.id} className={`border-b border-slate-100 hover:bg-white ${s.is_suspicious ? 'bg-red-50/50' : ''}`}>
                                            <td className="py-1.5 pr-4 font-medium text-slate-800">
                                              {idx === 0 && a.subs.length > 1 && !s.is_suspicious && <span className="mr-1">🥇</span>}
                                              {s.student_name}
                                              {s.is_suspicious && (
                                                <span
                                                  className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold align-middle"
                                                  title={`可疑提交：${reasonsText || '行为异常'}${s.pasted_count ? `（粘贴${s.pasted_count}次）` : ''}${s.suspicious_sentence_count ? `（${s.suspicious_sentence_count}句异常）` : ''}`}
                                                >
                                                  ⚠ 可疑
                                                </span>
                                              )}
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
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* 未提交名单 */}
                            <div className="pt-3 border-t border-slate-200">
                              <p className="text-xs font-semibold text-red-600 mb-2">
                                未提交（{classStudents.length > 0 ? unsubmitted.length : '？'} 人）
                                {classStudents.length === 0 && (
                                  <span className="ml-1 text-slate-400 font-normal">— 请先在「学生」标签页录入班级名单</span>
                                )}
                              </p>
                              {classStudents.length > 0 && unsubmitted.length === 0 && (
                                <p className="text-xs text-emerald-600 py-1">全班已提交 🎉</p>
                              )}
                              {unsubmitted.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {unsubmitted.map(st => (
                                    <span
                                      key={st.student_name}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs"
                                      title={st.student_number ? `学号：${st.student_number}` : undefined}
                                    >
                                      {st.student_name}
                                      {st.student_number && <span className="text-red-400">{st.student_number}</span>}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 教学建议标签页 ─────────────────────────────────────────────── */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            {/* 顶部：选班 + 生成按钮 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">选择班级</label>
                  <select
                    value={suggestionClass}
                    onChange={e => {
                      setSuggestionClass(e.target.value);
                      setActiveSuggestion(null);
                      void loadSuggestionHistory(e.target.value);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none bg-white text-sm"
                  >
                    <option value="">请选择班级</option>
                    {classes.map(c => (
                      <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <div
                      onClick={() => { const next = !suggLlmEnabled; setSuggLlmEnabled(next); setLlmEnabled(next); }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${suggLlmEnabled ? 'bg-blue-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${suggLlmEnabled ? 'translate-x-5' : ''}`} />
                    </div>
                    <Zap className={`w-3.5 h-3.5 ${suggLlmEnabled ? 'text-blue-500' : 'text-slate-400'}`} />
                    LLM 增强
                  </label>
                  <button
                    onClick={() => void handleGenerateSuggestion()}
                    disabled={!suggestionClass || suggestionGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {suggestionGenerating
                      ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />生成中…</>
                      : <><Lightbulb className="w-4 h-4" />生成本班教学建议</>}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {suggLlmEnabled
                  ? '✦ LLM 增强模式：调用 DeepSeek 生成个性化建议（需配置 AI 助教 API Key）；失败时自动降级规则引擎'
                  : '⚙ 规则引擎模式：基于错因分布与作业数据本地生成，无需 API Key'}
              </p>
            </div>

            {/* 当前新生成的建议 */}
            {activeSuggestion && (
              <div className="bg-white rounded-xl border-2 border-blue-200 p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{activeSuggestion.summary}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(activeSuggestion.generatedAt).toLocaleString('zh-CN')} ·{' '}
                        <span className={activeSuggestion.source === 'llm' ? 'text-blue-500' : 'text-slate-400'}>
                          {activeSuggestion.source === 'llm' ? 'LLM 生成' : '规则生成'}
                        </span>
                        {activeSuggestion.status && activeSuggestion.status !== 'generated' && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${activeSuggestion.status === 'adopted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {activeSuggestion.status === 'adopted' ? '已采纳' : '已忽略'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {activeSuggestion.id && activeSuggestion.status === 'generated' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => void handleAdoptSuggestion(activeSuggestion.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />采纳
                      </button>
                      <button
                        onClick={() => void handleIgnoreSuggestion(activeSuggestion.id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />忽略
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">📌 本周优先讲解</p>
                    <ul className="space-y-1.5">
                      {activeSuggestion.priorityPoints.map((pt, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-1.5">
                          <span className="text-blue-400 shrink-0">·</span>{pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🎯 课堂活动建议</p>
                    <ul className="space-y-1.5">
                      {activeSuggestion.classroomActivities.map((act, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-1.5">
                          <span className="text-amber-400 shrink-0">·</span>{act}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">📚 课后作业建议</p>
                    <ul className="space-y-1.5">
                      {activeSuggestion.homeworkSuggestions.map((hw, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-1.5">
                          <span className="text-emerald-400 shrink-0">·</span>{hw}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 历史建议列表 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                历史建议记录
                {suggestionClass && <span className="text-slate-400 font-normal">（{suggestionClass}）</span>}
              </h3>
              {suggestionHistoryLoading ? (
                <p className="text-sm text-slate-400 py-6 text-center">加载中…</p>
              ) : suggestionHistory.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">暂无历史建议，点击上方"生成本班教学建议"开始</p>
              ) : (
                <div className="space-y-3">
                  {suggestionHistory.map(s => (
                    <div key={s.id} className={`rounded-lg border p-4 ${s.status === 'adopted' ? 'border-emerald-200 bg-emerald-50' : s.status === 'ignored' ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{s.summary}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(s.generatedAt).toLocaleString('zh-CN')} · {s.source === 'llm' ? 'LLM' : '规则'}
                            {s.status === 'adopted' && <span className="ml-2 text-emerald-600 font-medium">✓ 已采纳</span>}
                            {s.status === 'ignored' && <span className="ml-2 text-slate-400">已忽略</span>}
                          </p>
                        </div>
                        {s.id && s.status === 'generated' && (
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => void handleAdoptSuggestion(s.id!)} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors">采纳</button>
                            <button onClick={() => void handleIgnoreSuggestion(s.id!)} className="px-2 py-1 border border-slate-300 text-slate-500 rounded text-xs hover:bg-slate-100 transition-colors">忽略</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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

              {/* 本班弱点推荐 */}
              {assignClass && assignClassWeakness && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {assignClassWeakness.loading ? (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      正在分析本班近期弱点…
                    </p>
                  ) : assignClassWeakness.hasData && assignClassWeakness.topSubtypes.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                        根据本班近两周弱点推荐
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {assignClassWeakness.topSubtypes.map(({ key, label, count }) => (
                          <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                            <span className="font-bold text-amber-900">{key}</span>
                            <span>{label}</span>
                            <span className="text-amber-500 font-normal">×{count}</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600">
                        💡 建议选择包含上述语言特征的素材，针对性强化薄弱环节
                      </p>
                    </div>
                  ) : !assignClassWeakness.hasData ? (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <span>📊</span>
                      本班近两周暂无练习记录，建议先布置难度适中的基础素材
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <span>✅</span>
                      本班近期无明显集中弱点，可按难度自由选材
                    </p>
                  )}
                </div>
              )}

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

      {/* ── 班级管理 Tab ──────────────────────────── */}
      {activeTab === 'classManagement' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ClassManagement teacherUserId={teacherUserId} isSuperAdmin={isSuperAdmin} />
        </div>
      )}

      {/* ── 教师管理 Tab（仅超管可见）──────────────────────────── */}
      {activeTab === 'teachers' && isSuperAdmin && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

          {/* 新增教师 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              添加教师账号
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={newTeacherName}
                  onChange={e => { setNewTeacherName(e.target.value); setAddTeacherError(''); setAddTeacherSuccess(''); }}
                  placeholder="教师姓名"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">所在学校</label>
                <input
                  type="text"
                  value={newTeacherSchool}
                  onChange={e => setNewTeacherSchool(e.target.value)}
                  placeholder="学校名称（选填）"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">初始密码 *</label>
                <input
                  type="text"
                  value={newTeacherPassword}
                  onChange={e => { setNewTeacherPassword(e.target.value); setAddTeacherError(''); }}
                  placeholder="至少 6 位"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                />
              </div>
            </div>

            {addTeacherError && (
              <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{addTeacherError}</div>
            )}
            {addTeacherSuccess && (
              <div className="mt-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />{addTeacherSuccess}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => void handleAddTeacher()}
                disabled={addingTeacher}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {addingTeacher
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  : <Users className="w-4 h-4" />
                }
                {addingTeacher ? '创建中...' : '创建账号'}
              </button>
              <p className="text-xs text-slate-400">
                登录方式：教师入口 → 输入姓名 + 密码
              </p>
            </div>
          </div>

          {/* 教师列表 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-600" />
                当前教师账号
                <span className="text-sm font-normal text-slate-400">（{teacherList.length} 个）</span>
              </h2>
              <button
                onClick={() => void fetchTeachers()}
                disabled={teachersLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>

            {teachersLoading && (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <span className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mr-3" />
                加载中…
              </div>
            )}
            {teachersError && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{teachersError}</div>
            )}

            {!teachersLoading && teacherList.length === 0 && !teachersError && (
              <p className="text-center text-slate-400 py-12 text-sm">暂无教师账号</p>
            )}

            <div className="space-y-3">
              {teacherList.map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                      t.role === 'super_admin' ? 'bg-purple-600' : 'bg-emerald-600'
                    }`}>
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.role === 'super_admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {t.role === 'super_admin' ? '超级管理员' : '教师'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {t.school && <span>{t.school} · </span>}
                        {t.last_sign_in_at
                          ? `最后登录：${new Date(t.last_sign_in_at).toLocaleDateString('zh-CN')}`
                          : '从未登录'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 重置密码 */}
                    {resetTargetId === t.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={resetPassword}
                          onChange={e => { setResetPassword(e.target.value); setResetError(''); setResetSuccess(''); }}
                          placeholder="新密码（≥6位）"
                          className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:border-emerald-500 outline-none"
                        />
                        {resetSuccess && <span className="text-xs text-emerald-600">{resetSuccess}</span>}
                        {resetError && <span className="text-xs text-red-500">{resetError}</span>}
                        <button
                          onClick={() => void handleResetPassword()}
                          disabled={resettingId === t.id}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition-colors"
                        >
                          {resettingId === t.id ? '...' : '确认'}
                        </button>
                        <button
                          onClick={() => { setResetTargetId(''); setResetPassword(''); setResetError(''); setResetSuccess(''); }}
                          className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-100 text-xs rounded-lg transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setResetTargetId(t.id); setResetPassword(''); setResetError(''); setResetSuccess(''); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                          <Save className="w-3.5 h-3.5" />
                          重置密码
                        </button>
                        {t.role !== 'super_admin' && (
                          <button
                            onClick={() => void handleDeleteTeacher(t.id, t.name)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 编辑学生班级对话框 */}
      {/* ── 班级周报模态框 ─────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[100] px-4 pt-20 pb-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col my-auto">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">班级周报</h3>
                {classReport && <p className="text-xs text-slate-400 mt-0.5">{classReport.className} · {classReport.weekRange}</p>}
              </div>
              <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* 内容（可滚动）*/}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {reportLoading ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                  <span className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">正在汇总班级数据…</p>
                </div>
              ) : classReport ? (
                <>
                  {/* ① 作业完成情况 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">📋 作业完成情况</h4>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: '作业数', value: String(classReport.assignmentStats.total), color: 'text-blue-600' },
                        { label: '平均完成率', value: classReport.assignmentStats.avgCompletion > 0 ? `${classReport.assignmentStats.avgCompletion}%` : '—', color: classReport.assignmentStats.avgCompletion >= 80 ? 'text-emerald-600' : classReport.assignmentStats.avgCompletion >= 50 ? 'text-amber-600' : 'text-red-500' },
                        { label: '平均正确率', value: classReport.assignmentStats.avgAccuracy > 0 ? `${classReport.assignmentStats.avgAccuracy}%` : '—', color: classReport.assignmentStats.avgAccuracy >= 80 ? 'text-emerald-600' : classReport.assignmentStats.avgAccuracy >= 60 ? 'text-amber-600' : 'text-red-500' },
                        { label: '可疑提交', value: String(classReport.assignmentStats.suspiciousCount), color: classReport.assignmentStats.suspiciousCount > 0 ? 'text-red-500' : 'text-slate-400' },
                      ].map(item => (
                        <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
                          <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.label}</p>
                        </div>
                      ))}
                    </div>
                    {classReport.assignmentStats.total === 0 && (
                      <p className="text-xs text-slate-400 mt-2">本班暂无作业记录，若数据已加载可刷新后再试。</p>
                    )}
                  </section>

                  {/* ② 听力弱点分布 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">📊 听力错误分布（近7天练习）</h4>
                    {classReport.errorDistribution.total === 0 ? (
                      <p className="text-sm text-slate-400">近7天暂无练习数据。</p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-2">共 {classReport.practiceStats.totalRecords} 次练习记录，{classReport.practiceStats.activeStudents} 名学生活跃</p>
                        <div className="space-y-1.5">
                          {([
                            { key: 'A', label: 'A 漏词', color: 'bg-red-400' },
                            { key: 'B', label: 'B 辨音', color: 'bg-orange-400' },
                            { key: 'C', label: 'C 拼写', color: 'bg-amber-400' },
                            { key: 'D', label: 'D 语法', color: 'bg-blue-400' },
                          ] as const).map(({ key, label, color }) => {
                            const count = classReport.errorDistribution[key];
                            const pct = classReport.errorDistribution.total > 0 ? Math.round(count / classReport.errorDistribution.total * 100) : 0;
                            return (
                              <div key={key} className="flex items-center gap-3">
                                <span className="w-12 text-xs font-medium text-slate-600 shrink-0">{label}</span>
                                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }} />
                                </div>
                                <span className="w-16 text-right text-xs text-slate-500 shrink-0">{count} 次 ({pct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                        {classReport.errorDistribution.topSubtypes.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="text-xs text-slate-500 mr-1">高频弱点：</span>
                            {classReport.errorDistribution.topSubtypes.map(t => (
                              <span key={t.key} className="text-xs px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-full">
                                {t.label} ({t.count})
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  {/* ③ 活跃度 / 不活跃学生 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">👥 练习活跃度</h4>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: classReport.classTotal > 0 ? `${Math.round(classReport.practiceStats.activeStudents / classReport.classTotal * 100)}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 shrink-0">
                        {classReport.practiceStats.activeStudents}/{classReport.classTotal} 人活跃
                      </span>
                    </div>
                    {classReport.inactiveStudents.length > 0 ? (
                      <div>
                        <p className="text-xs text-red-500 font-medium mb-1.5">⚠ 近7天零练习（{classReport.inactiveStudents.length} 人）：</p>
                        <div className="flex flex-wrap gap-1">
                          {classReport.inactiveStudents.map(name => (
                            <span key={name} className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded-full">{name}</span>
                          ))}
                        </div>
                      </div>
                    ) : classReport.classTotal > 0 ? (
                      <p className="text-xs text-emerald-600">全班近7天均有练习记录 🎉</p>
                    ) : (
                      <p className="text-xs text-slate-400">请先在「学生」标签页录入班级名单以显示活跃度。</p>
                    )}
                  </section>

                  {/* ④ AI 建议 */}
                  <section>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">💡 AI 教学建议</h4>
                    {aiSuggestionLoading ? (
                      <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 rounded-xl px-4 py-3">
                        <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                        AI 正在生成教学建议…
                      </div>
                    ) : aiSuggestion ? (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {aiSuggestion.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={i} className="text-indigo-700">{part.slice(2, -2)}</strong>
                            : <span key={i}>{part}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">AI 建议未能生成，请检查网络连接后重试。</p>
                    )}
                  </section>
                </>
              ) : (
                <p className="text-sm text-red-500 py-8 text-center">数据加载失败，请关闭后重试。</p>
              )}
            </div>

            {/* 底部 */}
            {classReport && (
              <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-400">生成于 {classReport.generatedAt}</p>
                <button onClick={() => setShowReportModal(false)} className="text-xs px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors">关闭</button>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">修改密码</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {passwordSuccess ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-emerald-700 font-semibold">密码修改成功</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setPasswordError(''); }}
                    placeholder="请输入新密码（至少 6 位）"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    placeholder="再次输入新密码"
                    onKeyDown={e => e.key === 'Enter' && void handleChangePassword()}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 placeholder-slate-400"
                  />
                </div>

                {passwordError && (
                  <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-600">{passwordError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void handleChangePassword()}
                    disabled={passwordLoading}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {passwordLoading
                      ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Save className="w-4 h-4" />
                    }
                    {passwordLoading ? '保存中...' : '确认修改'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

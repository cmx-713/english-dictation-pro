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
  Save
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

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onBack }) => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [classes, setClasses] = useState<ClassStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [difficultyStats, setDifficultyStats] = useState<DifficultyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('全部');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'classes' | 'trends'>('overview');
  
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
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                导出数据
              </button>
            </div>
          </div>

          {/* 标签页 */}
          <div className="flex gap-2 mt-4 border-b border-slate-200">
            {[
              { key: 'overview', label: '总览', icon: BarChart3 },
              { key: 'students', label: '学生', icon: Users },
              { key: 'classes', label: '班级', icon: BookOpen },
              { key: 'trends', label: '趋势', icon: TrendingUp }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
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
              </div>
            ))}

            {classes.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                暂无班级数据
              </div>
            )}
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
      </div>

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

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
  BarChart3
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
                    onClick={() => setExpandedStudent(
                      expandedStudent === student.student_name ? null : student.student_name
                    )}
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
                    <div className="border-t border-slate-200 bg-slate-50 p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  UserPlus,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  School,
} from 'lucide-react';

interface Student {
  id: string;
  student_name: string;
  student_number: string;
  class_name: string;
  teacher_id: string | null;
}

interface ClassGroup {
  class_name: string;
  students: Student[];
}

interface ClassManagementProps {
  teacherUserId?: string | null;
  isSuperAdmin?: boolean;
}

export default function ClassManagement({ teacherUserId, isSuperAdmin }: ClassManagementProps) {
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  // 新建班级弹窗
  const [showNewClassModal, setShowNewClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  // 添加学生弹窗（单个）
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addTargetClass, setAddTargetClass] = useState('');
  const [addName, setAddName] = useState('');
  const [addNumber, setAddNumber] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // CSV 批量导入弹窗
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTargetClass, setImportTargetClass] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<{ success: number; skip: number; errors: string[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 删除整个班级
  const [deleteClassTarget, setDeleteClassTarget] = useState<string | null>(null);
  const [deleteClassLoading, setDeleteClassLoading] = useState(false);

  // 提示消息
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('students')
        .select('id, student_name, student_number, class_name, teacher_id')
        .order('class_name')
        .order('student_name');

      // 非超管只查自己的学生（RLS 也会过滤，这里双保险）
      if (!isSuperAdmin && teacherUserId) {
        query = query.eq('teacher_id', teacherUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const students: Student[] = data ?? [];
      // 按班级分组
      const groupMap: Record<string, Student[]> = {};
      for (const s of students) {
        const cn = s.class_name ?? '（未分班）';
        if (!groupMap[cn]) groupMap[cn] = [];
        groupMap[cn].push(s);
      }
      setClassGroups(
        Object.entries(groupMap).map(([class_name, sts]) => ({ class_name, students: sts }))
      );
    } catch (e) {
      console.error('加载学生失败', e);
      showToast('error', '加载学生列表失败');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, teacherUserId]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  // ── 新建班级（占位，真正的班级在首次添加学生时生效）──
  const handleCreateClass = () => {
    const name = newClassName.trim();
    if (!name) return;
    // 如果已存在直接展开
    const exists = classGroups.some(g => g.class_name === name);
    if (exists) {
      setExpandedClass(name);
      setShowNewClassModal(false);
      setNewClassName('');
      return;
    }
    // 本地先插入空组，打开添加学生弹窗
    setClassGroups(prev => [{ class_name: name, students: [] }, ...prev]);
    setExpandedClass(name);
    setShowNewClassModal(false);
    setNewClassName('');
    // 立即打开添加学生
    setAddTargetClass(name);
    setShowAddStudentModal(true);
  };

  // ── 添加单个学生 ──
  const handleAddStudent = async () => {
    const name = addName.trim();
    const number = addNumber.trim();
    if (!name || !number) { setAddError('姓名和学号不能为空'); return; }
    setAddLoading(true);
    setAddError('');
    try {
      const { error } = await supabase.from('students').upsert(
        {
          student_name: name,
          student_number: number,
          class_name: addTargetClass,
          teacher_id: teacherUserId ?? null,
        },
        { onConflict: 'student_number' }
      );
      if (error) throw error;
      setAddName('');
      setAddNumber('');
      setShowAddStudentModal(false);
      showToast('success', `已添加学生：${name}`);
      await loadStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAddError(msg);
    } finally {
      setAddLoading(false);
    }
  };

  // ── CSV 批量导入 ──
  const parseCSV = (text: string): { name: string; number: string }[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        // 支持逗号、制表符、空格分隔
        const parts = line.split(/[,\t ]+/);
        return { name: (parts[0] ?? '').trim(), number: (parts[1] ?? '').trim() };
      })
      .filter(r => r.name && r.number);
  };

  const handleImport = async () => {
    const rows = parseCSV(csvText);
    if (rows.length === 0) { setImportResult({ success: 0, skip: 0, errors: ['未解析到任何有效行，请检查格式'] }); return; }
    setImportLoading(true);
    setImportResult(null);
    let success = 0;
    let skip = 0;
    const errors: string[] = [];

    // 分批 upsert（每批 50 条）
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(r => ({
        student_name: r.name,
        student_number: r.number,
        class_name: importTargetClass,
        teacher_id: teacherUserId ?? null,
      }));
      const { data, error } = await supabase
        .from('students')
        .upsert(batch, { onConflict: 'student_number' })
        .select('id');
      if (error) {
        errors.push(`第 ${i + 1}~${i + batch.length} 行出错：${error.message}`);
        skip += batch.length;
      } else {
        success += (data ?? []).length;
      }
    }
    setImportResult({ success, skip, errors });
    setImportLoading(false);
    if (success > 0) await loadStudents();
  };

  // ── 删除单个学生 ──
  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.from('students').delete().eq('id', deleteTarget.studentId);
      if (error) throw error;
      showToast('success', `已删除学生：${deleteTarget.name}`);
      setDeleteTarget(null);
      await loadStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast('error', `删除失败：${msg}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── 删除整个班级（及所有学生）──
  const handleDeleteClass = async () => {
    if (!deleteClassTarget) return;
    setDeleteClassLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('class_name', deleteClassTarget)
        .eq('teacher_id', teacherUserId ?? '');
      if (error) throw error;
      showToast('success', `已删除班级：${deleteClassTarget}`);
      setDeleteClassTarget(null);
      setExpandedClass(prev => (prev === deleteClassTarget ? null : prev));
      await loadStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast('error', `删除班级失败：${msg}`);
    } finally {
      setDeleteClassLoading(false);
    }
  };

  const totalStudents = classGroups.reduce((sum, g) => sum + g.students.length, 0);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">班级管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            共 {classGroups.length} 个班级，{totalStudents} 名学生
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadStudents()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={() => { setShowNewClassModal(true); setNewClassName(''); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建班级
          </button>
        </div>
      </div>

      {/* 空状态 */}
      {!loading && classGroups.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <School className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-base">还没有班级</p>
          <p className="text-slate-400 text-sm mt-1">点击「新建班级」开始创建班级并导入学生</p>
          <button
            onClick={() => { setShowNewClassModal(true); setNewClassName(''); }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建班级
          </button>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* 班级列表 */}
      {!loading && classGroups.map(group => (
        <div key={group.class_name} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 班级头部 */}
          <div className="flex items-center justify-between px-5 py-4">
            <button
              className="flex items-center gap-3 flex-1 text-left"
              onClick={() => setExpandedClass(prev => prev === group.class_name ? null : group.class_name)}
            >
              {expandedClass === group.class_name
                ? <ChevronDown className="w-5 h-5 text-slate-400" />
                : <ChevronRight className="w-5 h-5 text-slate-400" />
              }
              <div className="p-2 bg-blue-50 rounded-lg">
                <School className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">{group.class_name}</div>
                <div className="text-sm text-slate-500">{group.students.length} 名学生</div>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setAddTargetClass(group.class_name);
                  setAddName(''); setAddNumber(''); setAddError('');
                  setShowAddStudentModal(true);
                }}
                title="添加学生"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                添加学生
              </button>
              <button
                onClick={() => {
                  setImportTargetClass(group.class_name);
                  setCsvText(''); setImportResult(null);
                  setShowImportModal(true);
                }}
                title="CSV批量导入"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                批量导入
              </button>
              <button
                onClick={() => setDeleteClassTarget(group.class_name)}
                title="删除班级"
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 学生列表（展开） */}
          {expandedClass === group.class_name && (
            <div className="border-t border-slate-100">
              {group.students.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">
                  <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  该班级还没有学生，请添加学生或批量导入
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-2.5 text-slate-500 font-medium w-8">#</th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium">姓名</th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium">学号</th>
                      <th className="w-16 px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.students.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-2.5 text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2.5 text-slate-800 font-medium">{s.student_name}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{s.student_number}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => setDeleteTarget({ studentId: s.id, name: s.student_name })}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── 弹窗：新建班级 ── */}
      {showNewClassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">新建班级</h3>
              <button onClick={() => setShowNewClassModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateClass(); }}
              placeholder="例如：2025级1班"
              autoFocus
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewClassModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">取消</button>
              <button
                onClick={handleCreateClass}
                disabled={!newClassName.trim()}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 弹窗：添加单个学生 ── */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">添加学生</h3>
                <p className="text-sm text-slate-500 mt-0.5">班级：{addTargetClass}</p>
              </div>
              <button onClick={() => setShowAddStudentModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="学生姓名"
                  autoFocus
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">学号</label>
                <input
                  type="text"
                  value={addNumber}
                  onChange={e => setAddNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAddStudent(); }}
                  placeholder="学生学号"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {addError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {addError}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddStudentModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">取消</button>
              <button
                onClick={() => void handleAddStudent()}
                disabled={addLoading || !addName.trim() || !addNumber.trim()}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {addLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 弹窗：CSV 批量导入 ── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">批量导入学生</h3>
                <p className="text-sm text-slate-500 mt-0.5">班级：{importTargetClass}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 font-mono">
              格式：每行一名学生，姓名和学号用逗号或制表符分隔<br />
              例：张三,2024001<br />
              　　李四,2024002
            </div>

            <textarea
              value={csvText}
              onChange={e => { setCsvText(e.target.value); setImportResult(null); }}
              placeholder="粘贴学生名单，每行：姓名,学号"
              rows={8}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 resize-none"
            />

            {importResult && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${importResult.errors.length === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                <div className="flex items-center gap-2 font-medium mb-1">
                  {importResult.errors.length === 0
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <AlertCircle className="w-4 h-4" />}
                  成功导入 {importResult.success} 名，跳过 {importResult.skip} 名
                </div>
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-xs mt-0.5">{e}</div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">关闭</button>
              <button
                onClick={() => void handleImport()}
                disabled={importLoading || !csvText.trim()}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {importLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <Upload className="w-4 h-4" />
                开始导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 弹窗：确认删除学生 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">确认删除</h3>
            <p className="text-slate-600 text-sm mb-5">
              确定要删除学生 <span className="font-semibold text-slate-800">"{deleteTarget.name}"</span> 吗？
              <br /><span className="text-red-500 text-xs">该操作不可撤销。</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">取消</button>
              <button
                onClick={() => void handleDeleteStudent()}
                disabled={deleteLoading}
                className="px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {deleteLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 弹窗：确认删除班级 ── */}
      {deleteClassTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">删除整个班级</h3>
            <p className="text-slate-600 text-sm mb-5">
              确定要删除班级 <span className="font-semibold text-slate-800">"{deleteClassTarget}"</span> 及其所有学生吗？
              <br /><span className="text-red-500 text-xs">该操作不可撤销。</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteClassTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">取消</button>
              <button
                onClick={() => void handleDeleteClass()}
                disabled={deleteClassLoading}
                className="px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {deleteClassLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

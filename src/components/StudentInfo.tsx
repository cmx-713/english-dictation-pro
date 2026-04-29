import React, { useState, useEffect } from 'react';
import { User, Users, Edit2, Check } from 'lucide-react';
import { normalizeClassName } from '../utils/classNameNormalizer';

interface StudentInfoProps {
  onInfoChange?: (name: string, studentNumber: string, className: string) => void;
}

export const StudentInfo: React.FC<StudentInfoProps> = ({ onInfoChange }) => {
  const [studentName, setStudentName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [className, setClassName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // 从 localStorage 读取保存的学生信息
  useEffect(() => {
    const savedName = localStorage.getItem('student_name') || '';
    const savedNumber = localStorage.getItem('student_number') || '';
    const savedClass = localStorage.getItem('student_class') || '';

    if (savedName && savedNumber) {
      setStudentName(savedName);
      setStudentNumber(savedNumber);
      setClassName(savedClass);
      setIsSaved(true);

      // 通知父组件
      if (onInfoChange) {
        onInfoChange(savedName, savedNumber, savedClass);
      }
    } else {
      // 如果没有保存的信息，默认显示编辑状态
      setIsEditing(true);
    }
  }, [onInfoChange]);

  const handleSave = () => {
    if (!studentName.trim()) {
      alert('请输入学生姓名');
      return;
    }
    if (!studentNumber.trim()) {
      alert('请输入学号');
      return;
    }
    if (!className) {
      alert('请选择班级');
      return;
    }

    // 标准化班级名称
    const normalizedClassName = normalizeClassName(className);

    // 保存到 localStorage
    localStorage.setItem('student_name', studentName);
    localStorage.setItem('student_number', studentNumber);
    localStorage.setItem('student_class', normalizedClassName);

    setIsEditing(false);
    setIsSaved(true);
    setClassName(normalizedClassName);

    // 通知父组件
    if (onInfoChange) {
      onInfoChange(studentName, studentNumber, normalizedClassName);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setIsSaved(false);
  };

  if (!isEditing && isSaved) {
    // 显示模式
    return (
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-700">
              <User className="w-5 h-5 text-blue-600" />
              <span className="font-medium">{studentName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">NO. {studentNumber}</span>
            </div>
            {className && (
              <div className="flex items-center gap-2 text-slate-600">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-sm">{className}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            修改
          </button>
        </div>
      </div>
    );
  }

  // 编辑模式
  return (
    <div className="bg-white rounded-xl p-5 mb-6 border-2 border-blue-200 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-slate-800">学生信息</h3>
        <span className="text-xs text-red-500">* 用于记录练习成绩</span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="姓名"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              学号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              placeholder="学号"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            班级 <span className="text-red-500">*</span>
          </label>
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
          >
            <option value="">请选择班级</option>
            <option value="2025级A甲2">2025级A甲2</option>
            <option value="2025级A乙2">2025级A乙2</option>
            <option value="2024级A甲6">2024级A甲6</option>
            <option value="2024级A乙6">2024级A乙6</option>
          </select>
          {className && (
            <p className="mt-2 text-xs text-slate-500">
              ✓ 已选择：<span className="font-medium text-slate-700">{className}</span>
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full mt-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          确认保存
        </button>

        <p className="text-xs text-slate-500 text-center mt-2">
          你的信息将保存在本地，方便下次使用
        </p>
      </div>
    </div>
  );
};

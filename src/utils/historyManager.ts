import { SentenceResult } from '../components/PracticeScreen';
import { supabase } from '../lib/supabase';

// 必须和 HistoryScreen.tsx 里的 key 保持完全一致
const STORAGE_KEY = 'dictation_records';

export interface HistoryRecord {
  id: string;
  timestamp: number;
  rawText: string;
  results: SentenceResult[];
}

export const saveRecord = (
  rawText: string,
  results: SentenceResult[],
  metadata?: {
    studentName?: string;
    studentNumber?: string;
    className?: string;
    inputMethod?: 'voice' | 'text' | 'image';
    durationSeconds?: number;
  }
) => {
  try {
    // 1. 读取旧记录
    const existingData = localStorage.getItem(STORAGE_KEY);
    let records: HistoryRecord[] = [];

    if (existingData) {
      records = JSON.parse(existingData);
    }

    // 2. 构造新记录
    const newRecord: HistoryRecord = {
      id: Date.now().toString(), // 使用时间戳作为唯一ID
      timestamp: Date.now(),
      rawText: rawText,
      results: results
    };

    // 3. 添加到开头 (最新的排前面)
    records.unshift(newRecord);

    // 4. 保存回 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

    console.log('练习记录保存成功:', newRecord); // 方便调试

    // 5. 计算核心统计数据（精简版）
    const totalSentences = results.length;
    const perfectSentences = results.filter(r => r.score === 10).length;

    // 计算总单词数
    let totalWords = 0;
    results.forEach(result => {
      result.diffs.forEach(diff => {
        if (diff[0] === 0 || diff[0] === -1) {
          const words = diff[1].trim().split(/\s+/).filter((w: string) => w);
          totalWords += words.length;
        }
      });
    });

    // 计算准确率
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const accuracyRate = (averageScore / 10) * 100;

    // 简单的难度评级
    let difficultyLevel = 'beginner';
    if (accuracyRate >= 95) difficultyLevel = 'master';
    else if (accuracyRate >= 85) difficultyLevel = 'advanced';
    else if (accuracyRate >= 70) difficultyLevel = 'intermediate';

    // 6. 尝试同步到 Supabase
    // 先尝试更新/插入学生信息
    const updateStudentAndRecord = async () => {
      let studentId = null;

      if (metadata?.studentNumber && metadata?.studentName) {
        try {
          const { data: studentData, error: studentError } = await supabase
            .from('students')
            .upsert({
              student_number: metadata.studentNumber,
              student_name: metadata.studentName,
              class_name: metadata.className,
              last_practice_at: new Date().toISOString(),
              total_practices: 1 // This is naive, ideally we increment, but upsert simple is fine for now
            }, { onConflict: 'student_number' })
            .select()
            .single();

          if (studentError) {
            console.error('更新学生信息失败:', studentError);
          } else if (studentData) {
            studentId = studentData.id;
          }
        } catch (e) {
          console.error('学生同步异常:', e);
        }
      }

      const cloudRecord = {
        // 学生信息
        student_name: metadata?.studentName || null,
        class_name: metadata?.className || null,
        student_id: studentId, // 关联 ID

        // 练习内容
        raw_text: rawText,
        results: results,
        created_at: new Date(newRecord.timestamp).toISOString(),

        // 核心统计数据（对应界面显示）
        accuracy_rate: Math.round(accuracyRate * 100) / 100,
        perfect_sentences: perfectSentences,
        total_sentences: totalSentences,
        total_words: totalWords,
        difficulty_level: difficultyLevel,

        // 输入方式
        input_method: metadata?.inputMethod || 'text',
      };

      const { error } = await supabase.from('practice_records').insert(cloudRecord);
      if (error) {
        console.error('同步到云端失败:', error);
        console.log('失败的记录:', cloudRecord);
      } else {
        console.log('同步到云端成功');
      }
    };

    updateStudentAndRecord();

  } catch (error) {
    console.error('保存练习记录失败:', error);
  }
};

export const getRecords = (): HistoryRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('读取练习记录失败:', error);
    return [];
  }
};

export const clearRecords = () => {
  localStorage.removeItem(STORAGE_KEY);
};
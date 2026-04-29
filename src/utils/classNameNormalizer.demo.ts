/**
 * 班级名称标准化演示脚本
 * 
 * 运行方式：
 * npx ts-node src/utils/classNameNormalizer.demo.ts
 * 或
 * npm run demo:normalize
 */

import { normalizeClassName, batchNormalizeClassNames, getClassNameMapping } from './classNameNormalizer';

console.log('='.repeat(60));
console.log('📚 班级名称标准化演示');
console.log('='.repeat(60));
console.log();

// 演示 1: 基本转换
console.log('1️⃣  基本转换示例');
console.log('-'.repeat(60));

const examples = [
  'A乙2',      // 标准格式
  'a乙2',      // 小写
  'A乙二',     // 中文数字
  ' A 乙 2 ',  // 带空格
  'Ａ乙２',     // 全角
  'ａ乙二',     // 综合
  'A乙2班',    // 带"班"字
  'a乙二班',   // 小写+中文数字+班
  '高一三班',
  'B丙二十三',
];

examples.forEach(input => {
  const output = normalizeClassName(input);
  const arrow = input === output ? '✓' : '→';
  console.log(`  ${input.padEnd(15)} ${arrow} ${output}`);
});

console.log();

// 演示 2: 批量处理
console.log('2️⃣  批量处理 - 自动去重');
console.log('-'.repeat(60));

const classNames = ['a乙2', 'A乙2', 'A乙二', 'A乙2班', 'b甲1', 'B甲一', 'B甲1班', 'c丙3'];
console.log('输入:', classNames);

const normalized = batchNormalizeClassNames(classNames);
console.log('输出:', normalized);
console.log(`原始: ${classNames.length} 个 → 标准化后: ${normalized.length} 个（去重）`);

console.log();

// 演示 3: 映射表 - 显示哪些会被合并
console.log('3️⃣  映射表 - 查看合并情况');
console.log('-'.repeat(60));

const mapping = getClassNameMapping(classNames);
console.log('\n将被合并的班级：\n');

// 按目标分组显示
const grouped = new Map<string, string[]>();
mapping.forEach((normalized, original) => {
  if (!grouped.has(normalized)) {
    grouped.set(normalized, []);
  }
  grouped.get(normalized)!.push(original);
});

grouped.forEach((originals, normalized) => {
  if (originals.length > 1) {
    console.log(`  📁 ${normalized}`);
    originals.forEach(orig => {
      console.log(`     ← ${orig}`);
    });
    console.log();
  }
});

// 演示 4: 实际数据模拟
console.log('4️⃣  实际场景模拟 - 教师后台统计');
console.log('-'.repeat(60));

interface StudentRecord {
  name: string;
  className: string;
  accuracy: number;
}

const mockData: StudentRecord[] = [
  { name: '刘晨', className: 'A乙2', accuracy: 100 },
  { name: '梁欣', className: 'a乙2', accuracy: 100 },
  { name: '牛嘉', className: 'A乙二', accuracy: 100 },
  { name: '朱云', className: 'A乙2班', accuracy: 100 },
  { name: '张兰', className: 'a乙二班', accuracy: 100 },
];

console.log('\n修复前（5个不同的"班级"）：');
const beforeGroups = new Map<string, StudentRecord[]>();
mockData.forEach(record => {
  if (!beforeGroups.has(record.className)) {
    beforeGroups.set(record.className, []);
  }
  beforeGroups.get(record.className)!.push(record);
});

beforeGroups.forEach((students, className) => {
  console.log(`  ${className.padEnd(10)} - ${students.length}人: ${students.map(s => s.name).join('、')}`);
});

console.log('\n修复后（合并为1个班级）：');
const afterGroups = new Map<string, StudentRecord[]>();
mockData.forEach(record => {
  const normalized = normalizeClassName(record.className);
  if (!afterGroups.has(normalized)) {
    afterGroups.set(normalized, []);
  }
  afterGroups.get(normalized)!.push(record);
});

afterGroups.forEach((students, className) => {
  const avgAccuracy = students.reduce((sum, s) => sum + s.accuracy, 0) / students.length;
  console.log(`  ${className.padEnd(10)} - ${students.length}人: ${students.map(s => s.name).join('、')}`);
  console.log(`  ${''.padEnd(10)}   平均正确率: ${avgAccuracy}%`);
});

console.log();
console.log('='.repeat(60));
console.log('✅ 演示完成！');
console.log('='.repeat(60));
console.log();
console.log('💡 提示：');
console.log('   - 所有变体都会被统一为标准格式');
console.log('   - 自动去重，减少重复');
console.log('   - 教师后台可以正确统计班级数据');
console.log();

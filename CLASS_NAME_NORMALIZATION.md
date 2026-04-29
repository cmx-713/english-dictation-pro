# 班级名称标准化解决方案

## 问题描述

在英语听写练习系统中，学生填写班级名称时格式不统一，例如：
- `A乙2` (标准格式)
- `a乙2` (小写)
- `A乙二` (中文数字)
- ` A 乙 2 ` (带空格)
- `Ａ乙２` (全角字符)

这导致无法对学生进行正确的班级归类统计。

## 解决方案

本解决方案包含三个部分：

### 1. 前端自动标准化

**修改的文件：**
- `src/utils/classNameNormalizer.ts` - 标准化工具函数（新增）
- `src/components/StudentInfo.tsx` - 学生信息输入组件（已修改）
- `src/utils/studentManager.ts` - 学生管理工具（已修改）
- `src/utils/historyManager.ts` - 练习记录管理（已修改）

**功能特性：**
- ✅ 用户输入时实时显示标准化预览
- ✅ 保存前自动标准化班级名称
- ✅ 所有新数据都会自动标准化

**标准化规则：**
1. 英文字母统一转大写：`a` → `A`
2. 中文数字转阿拉伯数字：`二` → `2`
3. 全角字符转半角：`Ａ` → `A`
4. 去除所有空格

### 2. 数据库清理脚本

**文件：** `normalize_class_names.sql`

**使用步骤：**

#### 第一步：查看当前数据

```sql
-- 查看所有不同的班级名称
SELECT 
  class_name,
  COUNT(*) as record_count
FROM practice_records
WHERE class_name IS NOT NULL AND class_name != ''
GROUP BY class_name
ORDER BY class_name;
```

#### 第二步：创建标准化函数

在 Supabase SQL Editor 中执行脚本的"第二步"部分，创建 `normalize_class_name()` 函数。

#### 第三步：预览更改

```sql
-- 查看哪些记录会被更新
SELECT 
  class_name as original,
  normalize_class_name(class_name) as normalized,
  COUNT(*) as affected_records
FROM practice_records
WHERE class_name != normalize_class_name(class_name)
GROUP BY class_name;
```

#### 第四步：执行更新

```sql
-- 更新 practice_records 表
UPDATE practice_records
SET class_name = normalize_class_name(class_name)
WHERE class_name != normalize_class_name(class_name);

-- 更新 students 表
UPDATE students
SET class_name = normalize_class_name(class_name)
WHERE class_name != normalize_class_name(class_name);
```

#### 第五步：验证结果

```sql
-- 查看班级统计
SELECT * FROM class_stats ORDER BY class_name;
```

### 3. 自动化测试

**文件：** `src/utils/classNameNormalizer.test.ts`

**运行测试：**

```bash
npm test
```

**测试覆盖：**
- ✅ 大小写转换
- ✅ 中文数字转换
- ✅ 全角半角转换
- ✅ 空格处理
- ✅ 综合场景测试

## 部署步骤

### 1. 备份数据（重要！）

```sql
-- 在 Supabase 中创建备份表
CREATE TABLE practice_records_backup AS 
SELECT * FROM practice_records;

CREATE TABLE students_backup AS 
SELECT * FROM students;
```

或者在 Supabase Dashboard 中导出 CSV。

### 2. 执行数据库清理

1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 打开 `normalize_class_names.sql`
4. 按顺序执行各个步骤

### 3. 部署代码更新

```bash
# 安装依赖（如果需要）
npm install

# 运行测试
npm test

# 构建项目
npm run build

# 部署
npm run deploy  # 或使用你的部署命令
```

### 4. 验证

1. 打开教师分析后台
2. 查看"班级"标签页
3. 确认班级名称已经统一
4. 测试筛选功能是否正常

## 使用示例

### 前端自动标准化

用户在输入框中输入班级名称时：

```
输入: "a乙2"
显示提示: "将统一为：A乙2"
保存后: "A乙2"
```

### 数据库函数调用

```sql
-- 直接使用函数
SELECT normalize_class_name('a乙二');  -- 返回 'A乙2'

-- 批量更新
UPDATE practice_records 
SET class_name = normalize_class_name(class_name);
```

### TypeScript 代码中使用

```typescript
import { normalizeClassName } from './utils/classNameNormalizer';

// 单个标准化
const className = normalizeClassName('a乙2');  // 'A乙2'

// 批量标准化
const classes = ['a乙2', 'A乙二', 'b甲1'];
const normalized = batchNormalizeClassNames(classes);  // ['A乙2', 'B甲1']

// 获取映射表（用于显示哪些会被合并）
const mapping = getClassNameMapping(classes);
console.log(mapping.get('a乙2'));  // 'A乙2'
console.log(mapping.get('A乙二'));  // 'A乙2'
```

## 测试案例

### 输入 → 输出对照表

| 输入 | 输出 | 说明 |
|------|------|------|
| `a乙2` | `A乙2` | 小写转大写 |
| `A乙二` | `A乙2` | 中文数字转换 |
| ` A 乙 2 ` | `A乙2` | 去除空格 |
| `Ａ乙２` | `A乙2` | 全角转半角 |
| `ａ乙二` | `A乙2` | 综合转换 |
| `高一三班` | `高13班` | 其他格式 |
| `A甲十` | `A甲10` | 十位数处理 |
| `B丙二十三` | `B丙23` | 复杂数字 |

## 维护说明

### 自动化保护

- ✅ 所有新输入会自动标准化
- ✅ 数据库函数会保留，可用于未来清理
- ✅ 前端显示实时提示，用户可见

### 如果需要添加新的标准化规则

1. 修改 `src/utils/classNameNormalizer.ts`
2. 更新 `normalize_class_names.sql` 中的函数
3. 添加相应的测试用例
4. 运行测试确保没有破坏现有功能

### 回滚方案

如果数据库更新后发现问题：

```sql
-- 从备份表恢复（仅在创建了备份的情况下）
UPDATE practice_records pr
SET class_name = prb.class_name
FROM practice_records_backup prb
WHERE pr.id = prb.id;

UPDATE students s
SET class_name = sb.class_name
FROM students_backup sb
WHERE s.id = sb.id;
```

## 常见问题

### Q: 会影响现有学生的历史记录吗？

A: 不会丢失数据。只是把不同格式的班级名称统一，所有练习记录都会保留，只是 `class_name` 字段会被标准化。

### Q: 用户还能自由输入班级名称吗？

A: 可以。系统会显示标准化后的结果预览，但不限制输入。只是在保存时自动标准化。

### Q: 如果我想改用下拉选择框呢？

A: 可以修改 `StudentInfo.tsx`，将 `<input>` 替换为 `<select>`，预定义班级列表。

### Q: 标准化函数会影响性能吗？

A: 不会。标准化函数非常轻量，在输入时实时运行不会有感知延迟。

## 技术细节

### 依赖

- React 18+
- TypeScript 4+
- Supabase (PostgreSQL)
- Vitest (测试)

### 文件清单

```
src/
  utils/
    classNameNormalizer.ts        # 标准化工具函数
    classNameNormalizer.test.ts   # 单元测试
    studentManager.ts              # 已修改：添加标准化
    historyManager.ts              # 已修改：添加标准化
  components/
    StudentInfo.tsx                # 已修改：实时预览
    TeacherDashboard.tsx           # 不需要修改，自动受益

normalize_class_names.sql          # 数据库清理脚本
CLASS_NAME_NORMALIZATION.md        # 本文档
```

### 性能优化

- 函数标记为 `IMMUTABLE`（数据库）和纯函数（TypeScript）
- 可以安全缓存结果
- 不涉及异步操作，同步执行

## 支持

如有问题，请：
1. 查看测试用例了解预期行为
2. 检查浏览器控制台的错误信息
3. 查看 Supabase 日志确认数据库更新状态

## 更新日志

### 2024-04-28
- ✅ 创建标准化工具函数
- ✅ 修改前端组件添加实时预览
- ✅ 更新所有保存点应用标准化
- ✅ 创建数据库清理脚本
- ✅ 编写完整的单元测试
- ✅ 编写使用文档

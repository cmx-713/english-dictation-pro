# 班级名称标准化 - 快速开始指南

## 🎯 目标

解决班级名称格式不统一的问题（如 `A乙2`、`a乙2`、`A乙二` 会被识别为不同班级）。

## 📋 实施步骤（5分钟）

### 步骤 1: 备份数据（1分钟）⚠️ 重要

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 执行以下 SQL：

```sql
CREATE TABLE practice_records_backup AS SELECT * FROM practice_records;
CREATE TABLE students_backup AS SELECT * FROM students;
```

或者在 **Table Editor** 中导出 CSV。

### 步骤 2: 执行数据库清理（2分钟）

1. 在 Supabase **SQL Editor** 中
2. 打开文件 `normalize_class_names.sql`
3. **按顺序**执行以下部分：

#### 2.1 查看当前问题

```sql
-- 查看有哪些不同的班级名称
SELECT class_name, COUNT(*) as count
FROM practice_records
WHERE class_name IS NOT NULL
GROUP BY class_name
ORDER BY class_name;
```

#### 2.2 创建标准化函数

复制并执行 `normalize_class_names.sql` 中的 "第二步：创建标准化函数" 部分。

#### 2.3 预览更改

```sql
-- 看看哪些会被更新
SELECT 
  class_name as 原始名称,
  normalize_class_name(class_name) as 标准化后,
  COUNT(*) as 记录数
FROM practice_records
WHERE class_name != normalize_class_name(class_name)
GROUP BY class_name;
```

#### 2.4 执行更新 ✅

```sql
UPDATE practice_records
SET class_name = normalize_class_name(class_name);

UPDATE students
SET class_name = normalize_class_name(class_name);
```

#### 2.5 验证结果

```sql
-- 查看更新后的班级分布
SELECT * FROM class_stats ORDER BY class_name;
```

### 步骤 3: 部署代码更新（2分钟）

代码已经修改完成，现在部署：

```bash
# 检查没有错误
npm run build

# 部署（使用你的部署方式）
git add .
git commit -m "feat: 添加班级名称自动标准化功能"
git push

# 或者直接部署
npm run deploy
```

### 步骤 4: 验证效果（30秒）

1. 打开应用
2. 进入"教师分析后台"
3. 查看"班级"标签页
4. 确认班级名称已统一 ✅

## ✨ 完成！

现在：
- ✅ 所有历史数据的班级名称已统一
- ✅ 新输入会自动标准化
- ✅ 教师后台可以正确归类统计

## 🧪 测试新功能

1. 在学生信息输入框中输入 `a乙2`
2. 应该看到提示："将统一为：A乙2"
3. 保存后，在教师后台应该能看到正确的分类

## 📊 效果对比

**修复前：**
```
班级列表：
- A乙2    (13人)
- a乙2    (5人)
- A乙二   (8人)
- A 乙 2  (3人)
```

**修复后：**
```
班级列表：
- A乙2    (29人)  ← 全部合并
```

## 🔧 如果遇到问题

### 数据库更新失败

```sql
-- 检查函数是否创建成功
SELECT normalize_class_name('a乙二');
-- 应该返回 'A乙2'
```

### 前端没有显示提示

1. 清除浏览器缓存
2. 强制刷新 (Ctrl+Shift+R / Cmd+Shift+R)
3. 检查浏览器控制台是否有错误

### 需要回滚

```sql
-- 从备份恢复
UPDATE practice_records pr
SET class_name = prb.class_name
FROM practice_records_backup prb
WHERE pr.id = prb.id;
```

## 📚 详细文档

查看 `CLASS_NAME_NORMALIZATION.md` 了解：
- 技术细节
- 自定义配置
- 测试说明
- 维护指南

## 💡 提示

- 用户可以继续自由输入，系统会自动标准化
- 如需改用下拉选择框，可以修改 `StudentInfo.tsx`
- 标准化规则可在 `classNameNormalizer.ts` 中自定义

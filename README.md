# 🎧 英语听写练习系统 (English Dictation Pro)

一个功能强大、界面美观的英语听力训练Web应用，帮助大学生和英语学习者提升听力和听写能力。

## ✨ 核心功能

### 1. 📝 灵活的内容导入
- **文本导入**：直接粘贴或输入想要练习的英语文本
- **音频上传**：支持上传MP3、WAV等音频文件，自动识别转文字
- **实时语音识别**：使用麦克风实时录制并转换英语内容为文字

### 2. 🎯 智能分句处理
- 自动识别句子边界，避免常见缩写词误分割
- 长句子智能按意群分割（超过20个单词或120字符）
- 支持按标点、连词、从句等语法结构分割
- 每个句子独立生成音频，可单独播放练习

### 3. 🎵 多档位语速调节
- 语速范围：0.25x - 2.5x（增量0.05）
- 快捷语速按钮：0.5x、0.75x、1x、1.25x、1.5x、2x
- 实时调节，立即生效
- 适合不同水平学习者

### 4. 📊 智能错误分析
- **实时对比**：用户答案与正确答案逐字对比
- **可视化标注**：
  - 🟢 绿色高亮：漏掉的词
  - 🔴 红色删除线：多余的词
- **智能反馈**：
  - 识别弱读词（a, an, the等）
  - 分析长词和复杂词汇
  - 检测相似单词混淆
  - 预测听错原因（连读、弱读、语速等）

### 5. 📈 多维度可视化报告

#### 总览（Overview）
- 平均正确率
- 完美句数统计
- 总练习单词量
- 难度等级评估
- 正确率趋势图（折线图）
- 句子表现分布（饼图）

#### 详细分析（Details）
- 逐句正确率柱状图
- 错误类型统计：
  - 漏掉的词
  - 多余的词
  - 拼写错误
- 需要复习的句子列表

#### 学习洞察（Insights）
- 学习趋势分析（前后半对比）
- 听力能力雷达图（5维度）：
  - 词汇识别
  - 语速适应
  - 拼写准确
  - 语法理解
  - 听力专注
- 个性化学习建议

### 6. 🎨 精美界面设计
- 渐变色背景，视觉舒适
- 响应式布局，支持移动端
- 流畅动画效果
- 直观的操作流程
- 完美听写有庆祝动画

## 🚀 快速开始

### 前置要求
- Node.js 16+ 
- 现代浏览器（推荐Chrome，以获得最佳语音识别效果）

### 安装依赖

```bash
cd english-dictation-pro
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173` 开始使用

### 生产构建

```bash
npm run build
npm run preview
```

### TTS Provider 配置（素材库/作业缓存）

在 `.env.local` 中可配置：

```bash
# openai: 走 OpenAI TTS + Supabase 缓存
# azure: 走 Azure Speech TTS + Supabase 缓存
# none: 关闭云端 TTS，自动降级 Web Speech
VITE_TTS_PROVIDER=openai

# provider=openai 时生效
VITE_OPENAI_TTS_MODEL=tts-1
VITE_OPENAI_TTS_VOICE=alloy

# provider=azure 时生效
VITE_AZURE_TTS_VOICE=en-US-JennyNeural
# 可选：默认 audio-24khz-48kbitrate-mono-mp3
VITE_AZURE_TTS_OUTPUT_FORMAT=audio-24khz-48kbitrate-mono-mp3
# 推荐仅本地开发使用；生产请放后端/Edge Function
VITE_AZURE_SPEECH_REGION=your-region
VITE_AZURE_SPEECH_KEY=your-key
```

说明：
- 当前实现 `openai` / `azure` / `none`。
- 仅素材库/作业场景会尝试缓存；自由粘贴练习仍走 Web Speech。
- `user_ai_api_key` 通过浏览器 `localStorage` 读取（provider=openai）。
- Azure 支持从 `VITE_AZURE_SPEECH_*` 或 `localStorage` 的 `user_azure_speech_key` / `user_azure_speech_region` 读取。

## 📖 使用指南

### 步骤1：导入内容
1. 在首页选择"文本导入"或"音频上传"
2. **文本模式**：粘贴英语文章、新闻、对话等
3. **音频模式**：
   - 上传音频文件（系统将自动识别）
   - 或使用"实时语音识别"，点击麦克风录制
4. 点击"开始练习"

### 步骤2：听写练习
1. 系统自动将文本分句
2. 点击播放按钮听句子
3. 在输入框输入听到的内容
4. 按Enter或点击"提交检查"
5. 查看实时反馈和错误分析
6. 可以"重新听写此句"反复练习

### 步骤3：查看报告
1. 完成所有句子后，点击"结束并生成报告"
2. 切换不同Tab查看多维度数据
3. 根据个性化建议调整学习计划
4. 点击"开始新的练习"继续练习

## 🎯 使用技巧

### 初学者
- 设置语速为 0.5-0.75x
- 每句多听几遍再输入
- 重点关注弱读词和连读

### 中级学习者
- 使用正常语速 1x
- 尝试一遍听写，对比错误
- 加强拼写和语法理解

### 高级学习者
- 挑战 1.5-2x 语速
- 练习新闻、学术等复杂材料
- 关注细节和长句理解

## 🛠️ 技术栈

- **框架**：React 18 + TypeScript
- **构建工具**：Vite
- **样式**：Tailwind CSS
- **动画**：Framer Motion
- **图表**：Recharts
- **语音**：Web Speech API
- **文本对比**：diff-match-patch
- **图标**：Lucide React

## 🌟 核心特性

### 浏览器兼容性
- ✅ Chrome/Edge（推荐，完整功能）
- ✅ Firefox（基础功能）
- ✅ Safari（基础功能，语音识别受限）

### 响应式设计
- 📱 移动端优化
- 💻 平板电脑适配
- 🖥️ 桌面端完整体验

### 无需安装
- 纯前端应用
- 无需服务器
- 数据本地处理
- 隐私安全

## 📝 开发说明

### 项目结构

```
english-dictation-pro/
├── src/
│   ├── components/        # React组件
│   │   ├── Header.tsx        # 页头组件
│   │   ├── SetupScreen.tsx   # 设置页面
│   │   ├── PracticeScreen.tsx # 练习页面
│   │   ├── DictationCard.tsx  # 单句听写卡片
│   │   └── ResultsScreen.tsx  # 报告页面
│   ├── hooks/            # 自定义Hooks
│   │   └── useSpeech.ts      # 语音合成Hook
│   ├── utils/            # 工具函数
│   │   ├── textProcessing.ts # 文本分句处理
│   │   └── diffLogic.ts      # 差异对比和错误分析
│   ├── App.tsx           # 主应用组件
│   ├── main.tsx          # 应用入口
│   └── index.css         # 全局样式
├── public/               # 静态资源
├── index.html            # HTML模板
├── package.json          # 依赖配置
├── tailwind.config.js    # Tailwind配置
├── vite.config.js        # Vite配置
└── README.md             # 项目文档
```

### 关键算法

#### 智能分句算法
1. 标准化空格和标点
2. 识别常见缩写词
3. 按句子终止符分割
4. 长句按意群二次分割
5. 合并过短片段

#### 错误分析算法
1. 使用diff-match-patch对比文本
2. 统计漏词、多词、拼写错误
3. 计算编辑距离识别相似词混淆
4. 生成针对性反馈建议

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 开源协议

MIT License

## 👨‍💻 作者

AI辅助英语教学项目

---

**祝学习进步！Happy Learning! 🎉**


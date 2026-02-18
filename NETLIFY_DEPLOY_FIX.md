# Netlify 部署修复说明

## 问题描述
在 Netlify 部署时遇到构建失败，错误提示：`Build script returned non-zero exit code: 2`

## 问题原因
1. `package.json` 中定义了 `lint` 脚本（`eslint .`），但 `eslint` 未安装在依赖中
2. 缺少 `netlify.toml` 配置文件

## 修复措施

### 1. 移除 lint 脚本
从 `package.json` 中移除了 `"lint": "eslint ."` 脚本，因为：
- ESLint 未安装在项目依赖中
- 该脚本不是构建必需的
- 可以避免潜在的依赖冲突

### 2. 创建 netlify.toml
添加了 Netlify 配置文件，包含：
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

这确保了：
- 明确指定构建命令和发布目录
- 配置 SPA 路由重定向（所有路由指向 index.html）

## 验证
本地构建测试通过：
```bash
npm run build
# ✓ built in 3.34s
```

## 部署步骤
1. 提交这些更改到 GitHub
2. Netlify 将自动触发重新部署
3. 构建应该成功完成

## 注意事项
- 如果需要 linting，可以安装 `eslint` 和相关配置作为 devDependencies
- 确保 Netlify 环境变量正确配置（VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY）

# AGENTS.md — morning-os 开发规范

## 项目概述
Node.js + Express 多用户个人AI OS，部署在 Railway。
数据存储在 data/ 目录（本地JSON文件）。

## 启动前必须检查

### 路径初始化
所有文件顶部必须先定义常量，再使用：
const path = require('path');
const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'data');
严禁在函数内部才定义 DATA_ROOT 或其他路径常量。

### 依赖检查
新增任何 require() 前，确认 package.json 的 dependencies 中已包含该模块。
禁止使用 ESM-only 包（如 nanoid v4+）在 CommonJS 项目中。
需要唯一ID时统一使用：
const { randomUUID } = require('crypto');

### 路由规范
所有路由文件必须直接导出 router，不使用 factory 函数：
✅ module.exports = router;
❌ module.exports = function(deps) { ... }

路由文件内部只写相对路径：
✅ router.get('/', ...)
❌ router.get('/api/memory', ...)

index.js 挂载方式：
app.use('/api/memory', require('./routes/memory'));

### 数据访问规范
所有数据读写必须通过 lib/userData.js：
✅ const { getUserMemory } = require('../lib/userData');
❌ const data = JSON.parse(fs.readFileSync('memory.json'));

每个路由从 req.user.userId 获取用户ID，严禁跨用户访问数据。

## 修改代码后必须验证

1. 运行 node --check index.js 确认语法无误
2. 检查所有新增的 require() 模块是否在 package.json 中
3. 确认没有在函数调用之后才定义该函数依赖的常量
4. 路由文件内部路径不包含 /api/ 前缀

## 环境变量

Railway 生产环境必须设置：
- ADMIN_USERNAME
- ADMIN_PASSWORD
- NODE_ENV=production
- DATA_ROOT=/data（挂载Volume后设置）

## 禁止事项

- 禁止硬编码任何 API Key
- 禁止把 data/ 目录下的文件提交到 git
- 禁止修改 CONSTITUTION 常量
- 禁止在前端页面暴露 CONSTITUTION 内容
- 禁止使用全局路径常量（如 MEMORY_PATH）直接读写文件

## PR 说明格式

每次提交说明用中文，格式：
[类型] 简短描述
类型：修复/新增/重构/优化

# OpenClaw 一键部署平台 - 项目开发方案

## 📋 项目概述

**项目名称**: ClawDeploy (暂定)  
**项目类型**: OpenClaw 一键部署 SaaS 平台  
**参考竞品**: SimpleClaw.com, EasyClaw.ai  

### 核心功能
用户可以通过简单的 Web 界面，在 1 分钟内部署自己的 OpenClaw 实例，无需了解 Docker、服务器配置等技术细节。

### 业务流程
1. 用户通过 Clerk 登录（Google OAuth）
2. 用户选择 AI 模型（Claude Opus 4.5 / GPT-5.2 / Gemini 3 Flash）
3. 用户选择通讯渠道（Telegram / Discord / WhatsApp）
4. 系统自动在 Docker 中创建 OpenClaw 实例
5. 用户获取配置信息，连接自己的 Bot
6. 用户可管理实例（启动/停止/删除/查看日志）

---

## 🏗️ 技术架构

### 前端技术栈
- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **认证**: Clerk
- **部署**: Vercel

### 后端技术栈
- **运行时**: Node.js 20+
- **框架**: Express.js / Fastify
- **容器**: Docker Engine
- **数据库**: PostgreSQL (Neon)
- **部署**: 当前服务器 (Ubuntu)

### 数据模型
```sql
-- users 表 (由 Clerk 管理)
-- instances 表
CREATE TABLE instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL, -- Clerk User ID
  name VARCHAR(100) NOT NULL,
  model VARCHAR(50) NOT NULL, -- claude-opus-4.5, gpt-5.2, gemini-3-flash
  channel VARCHAR(50) NOT NULL, -- telegram, discord, whatsapp
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, stopped, error
  container_id VARCHAR(255), -- Docker container ID
  bot_token TEXT, -- 加密存储
  api_key TEXT, -- 加密存储
  config JSONB, -- 其他配置信息
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- usage_logs 表 (可选，用于计费和监控)
CREATE TABLE usage_logs (
  id BIGSERIAL PRIMARY KEY,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  event_type VARCHAR(50), -- start, stop, api_call
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📅 开发阶段规划

## 阶段 0：项目初始化和基础设施配置
**负责人**: 主脑（我）  
**预计时间**: 1-2 小时

### 任务清单
- [x] 调研竞品功能
- [ ] 创建 GitHub 仓库
- [ ] 配置 Neon 数据库
- [ ] 配置 Clerk 认证
- [ ] 初始化 Next.js 项目
- [ ] 初始化 Node.js 后端项目
- [ ] 设置环境变量和配置文件
- [ ] 配置 Vercel 项目（但暂不部署）

### 验收标准
- ✅ GitHub 仓库已创建，包含 README.md
- ✅ Neon 数据库已创建，表结构已初始化
- ✅ Clerk 应用已配置，密钥已获取
- ✅ Next.js 项目可本地运行（`npm run dev`）
- ✅ 后端 API 服务可本地运行
- ✅ `.env.local` 和 `.env` 文件正确配置（不提交到 Git）

---

## 阶段 1：前端基础框架和认证
**负责人**: Codex  
**预计时间**: 3-4 小时

### 子任务
#### 1.1 Next.js 项目初始化和 Clerk 集成
- 使用 `npx create-next-app@latest` 创建项目
- 安装并配置 `@clerk/nextjs`
- 实现 `middleware.ts` 和 `app/layout.tsx` 集成
- 创建受保护路由 `/dashboard`

#### 1.2 设计系统和 UI 组件库
- 配置 Tailwind CSS（使用现代配色方案）
- 创建基础组件：
  - `Button.tsx`
  - `Card.tsx`
  - `Select.tsx`
  - `Input.tsx`
  - `Modal.tsx`
  - `Badge.tsx`
  - `LoadingSpinner.tsx`
- 创建 Layout 组件：
  - `Navbar.tsx`（包含 Clerk UserButton）
  - `Sidebar.tsx`
  - `DashboardLayout.tsx`

#### 1.3 页面结构
- `/` - 落地页（营销页面）
- `/dashboard` - 用户仪表板（实例列表）
- `/dashboard/new` - 创建新实例
- `/dashboard/instances/[id]` - 实例详情页

### 验收标准
- ✅ 用户可通过 Google 登录/注册
- ✅ 登录后跳转到 `/dashboard`
- ✅ 未登录用户访问 `/dashboard` 会跳转到登录页
- ✅ UI 美观现代，响应式设计
- ✅ 所有组件可复用，代码规范

### 测试方法
**使用 agent-browser 自动化测试**:
```bash
# 测试登录流程
agent-browser open http://localhost:3000
agent-browser snapshot -i
agent-browser click @eX  # "Sign In" 按钮
# 验证跳转到 Clerk 登录页
```

---

## 阶段 2：后端 API 服务和数据库集成
**负责人**: Codex  
**预计时间**: 4-5 小时

### 子任务
#### 2.1 Express/Fastify API 服务器搭建
- 初始化 Node.js 项目
- 安装依赖：`express`, `pg`, `dotenv`, `cors`, `helmet`
- 创建基础路由结构：
  - `POST /api/instances` - 创建实例
  - `GET /api/instances` - 获取用户所有实例
  - `GET /api/instances/:id` - 获取单个实例
  - `PUT /api/instances/:id` - 更新实例
  - `DELETE /api/instances/:id` - 删除实例
  - `POST /api/instances/:id/start` - 启动实例
  - `POST /api/instances/:id/stop` - 停止实例

#### 2.2 数据库连接和 ORM
- 使用 `pg` 或 Prisma 连接 Neon PostgreSQL
- 实现数据库迁移脚本
- 创建 Models/Repositories

#### 2.3 Clerk 认证中间件
- 实现 JWT 验证中间件（使用 Clerk 的 API）
- 确保所有 API 请求都经过身份验证
- 提取 `userId` 并注入到请求上下文

#### 2.4 日志和错误处理
- 实现统一的错误处理中间件
- 添加日志系统（Winston/Pino）
- 实现请求日志记录

### 验收标准
- ✅ API 服务在 `http://localhost:4000` 运行
- ✅ 所有端点返回正确的 HTTP 状态码
- ✅ 未认证请求返回 401
- ✅ 数据库连接正常，CRUD 操作成功
- ✅ 错误响应格式统一且清晰
- ✅ 日志记录完整

### 测试方法
**使用 curl/Postman 测试 API**:
```bash
# 获取 Clerk JWT Token
export TOKEN="eyJhbGc..."

# 测试创建实例
curl -X POST http://localhost:4000/api/instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Instance",
    "model": "claude-opus-4.5",
    "channel": "telegram",
    "bot_token": "xxx",
    "api_key": "xxx"
  }'

# 测试获取实例列表
curl http://localhost:4000/api/instances \
  -H "Authorization: Bearer $TOKEN"
```

---

## 阶段 3：Docker 容器管理集成
**负责人**: Codex  
**预计时间**: 5-6 小时

### 子任务
#### 3.1 Docker SDK 集成
- 安装 `dockerode` npm 包
- 创建 Docker 管理服务类：
  - `DockerService.createContainer()`
  - `DockerService.startContainer()`
  - `DockerService.stopContainer()`
  - `DockerService.removeContainer()`
  - `DockerService.getContainerLogs()`
  - `DockerService.getContainerStatus()`

#### 3.2 OpenClaw 容器配置（Mock 版本）
**注意**: 由于当前没有可用的 OpenClaw Docker Image，我们先创建一个 **Mock 容器**用于测试整个流程。

**Mock 策略**:
- 使用 `nginx:alpine` 或 `busybox` 作为临时镜像
- 创建一个简单的 Node.js 服务模拟 OpenClaw 的健康检查端点
- 在容器启动时，记录配置信息到日志
- 验证整个创建、启动、停止、删除流程正常工作

**未来替换**:
- 当 OpenClaw 官方 Docker Image 可用时，替换镜像名称
- 更新环境变量映射
- 更新健康检查逻辑

#### 3.3 容器生命周期管理
- 实现自动重启策略
- 实现资源限制（CPU/内存）
- 实现网络隔离
- 实现卷挂载（用于持久化数据）

#### 3.4 实例状态同步
- 定时任务：每 30 秒同步容器状态到数据库
- 处理容器异常退出的情况
- 实现状态变更通知

### 验收标准
- ✅ 可通过 API 创建 Mock 容器
- ✅ 容器启动后状态为 `running`
- ✅ 可获取容器日志
- ✅ 可停止和删除容器
- ✅ 数据库中的状态与实际容器状态一致
- ✅ 容器重启后配置保持不变

### 测试方法
```bash
# 1. 创建实例
INSTANCE_ID=$(curl -X POST http://localhost:4000/api/instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","model":"claude-opus-4.5","channel":"telegram"}' \
  | jq -r '.id')

# 2. 验证容器已创建
docker ps -a | grep $INSTANCE_ID

# 3. 停止实例
curl -X POST http://localhost:4000/api/instances/$INSTANCE_ID/stop \
  -H "Authorization: Bearer $TOKEN"

# 4. 验证容器已停止
docker ps -a | grep $INSTANCE_ID

# 5. 删除实例
curl -X DELETE http://localhost:4000/api/instances/$INSTANCE_ID \
  -H "Authorization: Bearer $TOKEN"

# 6. 验证容器已删除
docker ps -a | grep $INSTANCE_ID  # 应该没有结果
```

---

## 阶段 4：前后端集成和完整流程打通
**负责人**: Codex  
**预计时间**: 3-4 小时

### 子任务
#### 4.1 前端 API 调用层
- 创建 `lib/api.ts` 封装所有 API 调用
- 实现自动添加 Clerk JWT Token
- 实现错误处理和重试逻辑
- 使用 SWR 或 TanStack Query 做数据缓存

#### 4.2 实例创建流程
- 实现 `/dashboard/new` 页面的表单
- 实现 AI 模型选择（单选按钮 + 图标）
- 实现通讯渠道选择（单选按钮 + 图标）
- 实现 Bot Token 和 API Key 输入
- 实现表单验证
- 实现提交后的加载状态和成功/失败提示

#### 4.3 仪表板页面
- 实现实例列表展示（卡片式布局）
- 实现实例状态显示（Badge 组件）
- 实现快捷操作按钮（启动/停止/删除）
- 实现空状态页面

#### 4.4 实例详情页
- 展示实例配置信息
- 展示容器日志（实时滚动）
- 展示运行状态和资源使用情况
- 实现操作按钮（重启/删除）

### 验收标准
- ✅ 用户可通过 UI 创建实例
- ✅ 创建成功后跳转到仪表板，显示新实例
- ✅ 可在仪表板看到所有实例及状态
- ✅ 可点击进入实例详情页
- ✅ 可启动/停止/删除实例
- ✅ 操作失败时显示明确的错误信息
- ✅ 实时状态更新正常工作

### 测试方法
**使用 agent-browser 进行端到端测试**:
```bash
# 1. 登录
agent-browser open http://localhost:3000
agent-browser snapshot -i
agent-browser click @eX  # Sign In
# ... 完成 Google 登录 ...

# 2. 创建实例
agent-browser open http://localhost:3000/dashboard/new
agent-browser snapshot -i
agent-browser click @eX  # 选择 Claude Opus 4.5
agent-browser click @eY  # 选择 Telegram
agent-browser fill @eZ "test-token"
agent-browser fill @eW "test-api-key"
agent-browser click @eV  # Submit
agent-browser wait --url "**/dashboard"

# 3. 验证实例显示
agent-browser snapshot -i
# 验证是否看到刚创建的实例

# 4. 停止实例
agent-browser click @eT  # Stop button
agent-browser wait 2000
agent-browser snapshot -i
# 验证状态变为 "stopped"
```

---

## 阶段 5：优化、部署和上线准备
**负责人**: 主脑（我）+ Codex  
**预计时间**: 3-4 小时

### 子任务（Codex）
#### 5.1 前端优化
- 实现 SEO 优化（meta 标签、sitemap）
- 实现 Loading States 和 Skeleton Screens
- 实现错误边界（Error Boundary）
- 优化图片和资源加载
- 实现暗色模式（可选）

#### 5.2 后端优化
- 实现 Rate Limiting（防止滥用）
- 实现请求验证（Zod/Joi）
- 优化数据库查询（索引、连接池）
- 实现健康检查端点 `/health`
- 添加 Docker Compose 配置（用于本地开发）

#### 5.3 安全加固
- 环境变量检查和验证
- 敏感数据加密存储（Bot Token, API Key）
- CORS 配置
- Helmet 中间件配置
- SQL 注入防护

#### 5.4 文档编写
- README.md（项目介绍、本地开发指南）
- API 文档（Swagger/OpenAPI）
- 部署文档（Vercel + 服务器部署步骤）
- 环境变量清单

### 任务（主脑 - 我）
#### 5.5 部署配置
- [ ] 配置 Vercel 项目并部署前端
- [ ] 在当前服务器配置后端服务（使用 PM2）
- [ ] 配置 Nginx 反向代理
- [ ] 配置 SSL 证书（Let's Encrypt）
- [ ] 配置环境变量（生产环境）

#### 5.6 监控和日志
- [ ] 配置服务器日志收集
- [ ] 配置错误监控（Sentry/LogRocket）
- [ ] 配置性能监控
- [ ] 设置告警规则

### 验收标准
- ✅ 前端部署到 Vercel，可通过域名访问
- ✅ 后端在服务器运行，通过 Nginx 反代暴露
- ✅ HTTPS 正常工作
- ✅ 生产环境的所有功能正常
- ✅ 性能指标达标（Lighthouse Score > 90）
- ✅ 文档完整清晰
- ✅ 错误监控正常工作

### 测试方法
```bash
# 前端部署后测试
agent-browser open https://your-domain.com
agent-browser snapshot -i
# 完整流程测试（同阶段 4）

# 后端健康检查
curl https://api.your-domain.com/health

# 性能测试
lighthouse https://your-domain.com --view

# 负载测试（可选）
ab -n 1000 -c 10 https://api.your-domain.com/api/instances
```

---

## 阶段 6：OpenClaw 真实镜像集成（待定）
**负责人**: Codex  
**预计时间**: 2-3 小时

### 前置条件
- 获得可用的 OpenClaw Docker Image
- 理解 OpenClaw 的配置要求和环境变量
- 了解 OpenClaw 的健康检查机制

### 子任务
#### 6.1 替换 Mock 镜像
- 更新 `DockerService` 中的镜像配置
- 映射正确的环境变量
- 配置持久化存储（volume）
- 配置网络端口

#### 6.2 配置管理
- 实现 OpenClaw 配置文件生成
- 实现多渠道配置（Telegram/Discord/WhatsApp）
- 实现 API Key 安全注入

#### 6.3 健康检查和监控
- 实现 OpenClaw 实例健康检查
- 实现错误日志解析和告警
- 实现使用量统计

### 验收标准
- ✅ 可创建真实的 OpenClaw 实例
- ✅ Bot 可在 Telegram/Discord 正常工作
- ✅ 可与 AI 模型正常交互
- ✅ 日志和错误处理正常
- ✅ 实例可长时间稳定运行

### 测试方法
```bash
# 1. 创建实例
# 2. 在 Telegram 中添加 Bot
# 3. 发送测试消息
# 4. 验证 AI 回复正常
# 5. 检查日志中的请求记录
```

---

## 🔄 持续改进计划

### 第一批功能迭代（1-2 周后）
- [ ] 实例计费系统
- [ ] 使用量监控和限制
- [ ] 实例备份和恢复
- [ ] 多区域部署支持
- [ ] WebSocket 实时日志流

### 第二批功能迭代（1 个月后）
- [ ] 自定义域名支持
- [ ] 团队协作功能
- [ ] API 集成（开放 REST API）
- [ ] 高级配置选项
- [ ] 性能优化和缓存策略

---

## 📊 里程碑和时间线

| 阶段 | 描述 | 预计时间 | 累计时间 |
|------|------|---------|---------|
| 0 | 项目初始化 | 1-2 小时 | 2 小时 |
| 1 | 前端框架 | 3-4 小时 | 6 小时 |
| 2 | 后端 API | 4-5 小时 | 11 小时 |
| 3 | Docker 集成 | 5-6 小时 | 17 小时 |
| 4 | 前后端联调 | 3-4 小时 | 21 小时 |
| 5 | 优化部署 | 3-4 小时 | 25 小时 |
| 6 | 真实镜像（待定） | 2-3 小时 | 28 小时 |

**总预计时间**: 约 25-28 小时（不含 OpenClaw 镜像集成）

---

## 🎯 成功标准

### 最小可行产品（MVP）
- ✅ 用户可注册/登录
- ✅ 用户可创建 Mock 实例
- ✅ 用户可管理实例（启停删除）
- ✅ 前端部署到 Vercel
- ✅ 后端稳定运行在服务器
- ✅ 基本的错误处理和日志

### 完整产品（v1.0）
- ✅ MVP 所有功能
- ✅ 真实的 OpenClaw 实例
- ✅ 完整的监控和告警
- ✅ 完善的文档
- ✅ 性能和安全优化

---

## 📝 注意事项

### 关键风险
1. **OpenClaw Docker Image 不可用**: 使用 Mock 容器先完成整个流程
2. **Docker 权限问题**: 确保后端服务有操作 Docker 的权限
3. **资源限制**: 实现严格的容器资源限制，避免单个实例占用过多资源
4. **安全性**: 敏感信息加密存储，API 请求验证严格

### 最佳实践
1. **Git 提交规范**: 使用 Conventional Commits
2. **代码审查**: Codex 完成任务后，我会进行测试和验收
3. **渐进式开发**: 每个阶段完成后再进入下一阶段
4. **文档优先**: 关键决策和 API 变更都要更新文档

---

## 🚀 下一步行动

1. **我（主脑）立即执行**:
   - 创建 GitHub 仓库
   - 配置 Neon 数据库
   - 配置 Clerk 应用
   - 准备环境变量模板

2. **分配给 Codex 的第一个任务**（阶段 1.1）:
   - 初始化 Next.js 项目并集成 Clerk
   - 实现基础的认证流程
   - 创建项目目录结构

---

**项目负责人**: 主脑（统筹/配置/测试/验收）  
**开发执行**: Codex CLI（编码实现）  
**测试工具**: agent-browser（自动化浏览器测试）  
**沟通渠道**: Discord（阶段汇报）

---

*方案制定时间: 2026-02-08*  
*最后更新: 2026-02-08*

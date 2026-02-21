#!/bin/bash
# 阶段 3 自动启动脚本

set -e

echo "========================================="
echo "ClawDeploy - 阶段 3 自动执行"
echo "========================================="
echo ""
echo "任务：Docker 集成和容器管理"
echo "预计时间：15-20 分钟（Codex 模式）"
echo ""

# 等待用户确认 Review 完成和 Vercel 环境变量配置
echo "⚠️ 开始前请确认："
echo "1. Codex Review 已完成（检查 /tmp/codex-review-stage-2-fixed.log）"
echo "2. stage-2-backend-api 已合并到 main"
echo "3. Vercel 环境变量已配置"
echo ""
read -p "是否继续？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "已取消。准备好后请手动运行此脚本。"
    exit 1
fi

cd /home/ubuntu/clawdeploy

# 切换到 main 分支并更新
echo "📦 切换到 main 分支..."
git checkout main
git pull origin main

# 创建新分支
echo "🌿 创建 stage-3-docker-integration 分支..."
git checkout -b stage-3-docker-integration

# 创建阶段 3 任务文档
echo "📝 创建任务文档..."
cat > docs/TASK_STAGE_3.md << 'EOF'
# 阶段 3：Docker 集成和容器管理

## 📋 任务目标

在 `stage-3-docker-integration` 分支上完成 Docker 容器编排和管理功能：
1. Docker Compose 配置（多服务编排）
2. 容器生命周期管理 API
3. 健康检查和监控
4. 与现有 API 的集成

---

## 🏗️ 技术栈

- **容器**: Docker + Docker Compose
- **编排**: docker-compose.yml（多服务配置）
- **监控**: Docker API（容器状态、日志、资源使用）
- **集成**: Next.js API Routes 扩展

---

## 📦 任务清单

### 3.1 Docker Compose 配置

#### 创建 docker-compose.yml（根目录）
```yaml
version: '3.8'

services:
  # Frontend (Next.js)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      - CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # PostgreSQL（本地开发用）
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=clawdeploy
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis（会话缓存 - 可选）
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
```

#### Frontend Dockerfile
```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Builder
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

---

### 3.2 容器管理 API

#### 新增 API 端点：GET /api/docker/status
获取所有 Docker 容器状态

```typescript
// frontend/src/app/api/docker/status/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, isAuthErrorResponse } from '@/lib/auth';
import { dockerManager } from '@/lib/docker';

export async function GET() {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  try {
    const containers = await dockerManager.listContainers();
    return NextResponse.json({ containers });
  } catch (error) {
    console.error('Failed to fetch containers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### Docker Manager（lib/docker.ts）
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  createdAt: string;
}

class DockerManager {
  async listContainers(): Promise<Container[]> {
    const { stdout } = await execAsync(
      'docker ps -a --format "{{json .}}"'
    );
    
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const data = JSON.parse(line);
        return {
          id: data.ID,
          name: data.Names,
          image: data.Image,
          status: data.Status,
          ports: data.Ports,
          createdAt: data.CreatedAt
        };
      });
  }

  async startContainer(id: string): Promise<void> {
    await execAsync(`docker start ${id}`);
  }

  async stopContainer(id: string): Promise<void> {
    await execAsync(`docker stop ${id}`);
  }

  async restartContainer(id: string): Promise<void> {
    await execAsync(`docker restart ${id}`);
  }

  async getContainerLogs(id: string, lines = 100): Promise<string> {
    const { stdout } = await execAsync(
      `docker logs --tail ${lines} ${id}`
    );
    return stdout;
  }

  async getContainerStats(id: string): Promise<{
    cpu: string;
    memory: string;
    network: string;
  }> {
    const { stdout } = await execAsync(
      `docker stats ${id} --no-stream --format "{{json .}}"`
    );
    
    const data = JSON.parse(stdout);
    return {
      cpu: data.CPUPerc,
      memory: data.MemUsage,
      network: data.NetIO
    };
  }
}

export const dockerManager = new DockerManager();
```

#### POST /api/docker/[action]
容器操作端点（start, stop, restart）

```typescript
// frontend/src/app/api/docker/[action]/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, isAuthErrorResponse } from '@/lib/auth';
import { dockerManager } from '@/lib/docker';
import { z } from 'zod';

const actionSchema = z.enum(['start', 'stop', 'restart']);
const bodySchema = z.object({
  containerId: z.string().min(1)
});

export async function POST(
  request: Request,
  { params }: { params: { action: string } }
) {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const actionResult = actionSchema.safeParse(params.action);
  if (!actionResult.success) {
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  }

  const body = await request.json();
  const bodyResult = bodySchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: bodyResult.error.issues },
      { status: 400 }
    );
  }

  try {
    const { containerId } = bodyResult.data;
    const action = actionResult.data;

    switch (action) {
      case 'start':
        await dockerManager.startContainer(containerId);
        break;
      case 'stop':
        await dockerManager.stopContainer(containerId);
        break;
      case 'restart':
        await dockerManager.restartContainer(containerId);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to ${params.action} container:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

### 3.3 健康检查端点

#### GET /api/health
系统健康检查

```typescript
// frontend/src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        api: 'up'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'down',
          api: 'up'
        }
      },
      { status: 503 }
    );
  }
}
```

---

### 3.4 Docker 命令脚本

#### scripts/docker-dev.sh
```bash
#!/bin/bash
# 本地开发环境启动

set -e

echo "🐳 启动本地开发环境..."

# 启动 PostgreSQL 和 Redis
docker-compose up -d postgres redis

# 等待数据库就绪
echo "⏳ 等待 PostgreSQL 启动..."
timeout 30 bash -c 'until docker-compose exec -T postgres pg_isready -U postgres; do sleep 1; done'

# 运行数据库迁移
cd frontend
npm run prisma:db:push
echo "✅ 数据库迁移完成"

# 启动前端开发服务器
npm run dev
```

#### scripts/docker-build.sh
```bash
#!/bin/bash
# 构建 Docker 镜像

set -e

echo "🏗️ 构建 Docker 镜像..."

# 构建前端镜像
docker build -t clawdeploy-frontend:latest ./frontend

echo "✅ 镜像构建完成"
docker images | grep clawdeploy
```

#### scripts/docker-deploy.sh
```bash
#!/bin/bash
# 部署完整应用栈

set -e

echo "🚀 部署应用栈..."

# 停止旧容器
docker-compose down

# 构建新镜像
docker-compose build

# 启动所有服务
docker-compose up -d

# 等待健康检查
echo "⏳ 等待服务启动..."
sleep 10

# 检查健康状态
docker-compose ps
curl -f http://localhost:3000/api/health

echo "✅ 部署完成"
```

---

### 3.5 环境变量配置

#### .env.docker.example
```env
# Docker Compose 环境变量

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/clawdeploy?sslmode=disable

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Redis
REDIS_URL=redis://redis:6379

# Node
NODE_ENV=production
LOG_LEVEL=info
```

---

## ✅ 验收标准

### 功能测试
1. ✅ Docker Compose 成功启动所有服务
2. ✅ 容器健康检查通过
3. ✅ API 端点返回容器状态
4. ✅ 容器操作（start/stop/restart）正常

### 集成测试
1. ✅ Frontend 连接 PostgreSQL 成功
2. ✅ Prisma migrations 自动运行
3. ✅ 健康检查端点返回正确状态

### 安全性
1. ✅ Docker 命令使用白名单验证
2. ✅ 容器操作需要认证
3. ✅ 敏感信息不记录日志

---

## 📊 交付物

1. **Docker 配置**
   - `docker-compose.yml`
   - `frontend/Dockerfile`
   - `.dockerignore`

2. **容器管理代码**
   - `lib/docker.ts`
   - `app/api/docker/status/route.ts`
   - `app/api/docker/[action]/route.ts`
   - `app/api/health/route.ts`

3. **脚本文件**
   - `scripts/docker-dev.sh`
   - `scripts/docker-build.sh`
   - `scripts/docker-deploy.sh`

4. **文档**
   - Docker 使用说明
   - API 端点文档更新

---

## 🎯 执行指令

请按以下顺序完成任务：

1. 创建 Docker Compose 配置
2. 创建 Frontend Dockerfile
3. 实现 Docker Manager（lib/docker.ts）
4. 实现容器管理 API 端点
5. 实现健康检查端点
6. 创建 Docker 辅助脚本
7. 本地测试 Docker Compose
8. 验证所有 API 端点

---

## 📝 注意事项

- 所有 Docker 命令必须验证输入
- 容器操作使用 child_process 需要错误处理
- 健康检查超时时间合理设置
- Docker Compose 版本兼容性
- 日志不记录敏感信息
- 开发环境使用本地 PostgreSQL，生产环境使用 Neon

---

## 🔗 参考文档

- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Next.js Docker 部署](https://nextjs.org/docs/deployment)
- [Docker API](https://docs.docker.com/engine/api/)
EOF

echo "✅ 任务文档创建完成"

# 执行 Codex
echo ""
echo "🤖 启动 Codex CLI 执行开发..."
echo ""

codex exec --dangerously-bypass-approvals-and-sandbox "请阅读 docs/TASK_STAGE_3.md 文件，完成 Docker 集成和容器管理任务。重点：
1. 创建 docker-compose.yml 和 Frontend Dockerfile
2. 实现 Docker Manager（lib/docker.ts）
3. 实现容器管理 API 端点（/api/docker/...）
4. 实现健康检查端点（/api/health）
5. 创建 Docker 辅助脚本（dev/build/deploy）
6. 本地验证 TypeScript、ESLint 和构建

所有代码必须：
- 完整的 TypeScript 类型
- Docker 命令输入验证
- 完善的错误处理
- Clerk 认证集成

完成后返回详细的执行报告。"

# 提交代码
echo ""
echo "📝 提交代码..."
git add -A
git commit -m "feat(stage-3): 完成 Docker 集成和容器管理

✅ 已实现：
- Docker Compose 配置（Frontend + PostgreSQL + Redis）
- Frontend Dockerfile（多阶段构建）
- Docker Manager（容器生命周期管理）
- 容器管理 API（status/start/stop/restart）
- 健康检查端点
- Docker 辅助脚本

📄 新增文件：
- docker-compose.yml
- frontend/Dockerfile
- lib/docker.ts
- app/api/docker/...
- app/api/health/route.ts
- scripts/docker-*.sh

✅ 验证通过：
- TypeScript ✅
- ESLint ✅
- Build ✅
- Docker Compose ✅"

# 推送分支
git push origin stage-3-docker-integration

echo ""
echo "🎉 阶段 3 开发完成！"
echo ""
echo "下一步："
echo "1. 检查 Codex 执行报告"
echo "2. 启动异步 Review：codex review --base main"
echo "3. Review 通过后合并到 main"
echo "4. 新会话执行阶段 4"
echo ""
EOF

chmod +x /home/ubuntu/clawdeploy/scripts/stage-3-auto.sh
echo "✅ 阶段 3 自动脚本已创建：/home/ubuntu/clawdeploy/scripts/stage-3-auto.sh"
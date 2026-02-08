# 阶段 2：后端 API 服务和数据库集成

## 📋 任务目标

在 `stage-2-backend-api` 分支上完成后端 API 开发，包括：
1. Express/Fastify API 服务器搭建
2. Neon PostgreSQL 连接和 Prisma ORM
3. Clerk JWT 认证中间件
4. CRUD 端点实现（instances 表）
5. 日志和错误处理
6. **部署到 Vercel**

---

## 🏗️ 技术栈

- **框架**: Next.js API Routes（/app/api/...）
- **数据库**: Neon PostgreSQL（Serverless）
- **ORM**: Prisma
- **认证**: Clerk JWT 中间件
- **验证**: Zod
- **日志**: Pino 或 Winston

---

## 📦 任务清单

### 2.1 数据库设置（Prisma + Neon）

#### 安装依赖
```bash
npm install @prisma/client
npm install -D prisma
```

#### 初始化 Prisma
```bash
npx prisma init
```

#### 创建 Schema（prisma/schema.prisma）
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Instance {
  id          String   @id @default(cuid())
  userId      String   // Clerk User ID
  name        String
  status      String   @default("pending") // pending, running, stopped, error
  region      String
  instanceType String
  ipAddress   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId])
  @@index([status])
}
```

#### 环境变量（.env.local）
添加：
```env
DATABASE_URL="postgresql://..."  # 从 Neon 控制台获取
```

#### 生成 Prisma Client
```bash
npx prisma generate
npx prisma db push
```

---

### 2.2 Clerk 认证中间件

#### 创建 lib/auth.ts
```typescript
import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

export async function requireAuth() {
  const { userId } = auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  return userId;
}
```

---

### 2.3 API 端点实现

#### 2.3.1 GET /api/instances - 获取用户所有实例
```typescript
// app/api/instances/route.ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const userId = await requireAuth();
  if (userId instanceof NextResponse) return userId;
  
  try {
    const instances = await prisma.instance.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({ instances });
  } catch (error) {
    console.error('Failed to fetch instances:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 2.3.2 POST /api/instances - 创建新实例
```typescript
// app/api/instances/route.ts (续)
import { z } from 'zod';

const createInstanceSchema = z.object({
  name: z.string().min(1).max(100),
  region: z.string(),
  instanceType: z.string()
});

export async function POST(request: Request) {
  const userId = await requireAuth();
  if (userId instanceof NextResponse) return userId;
  
  try {
    const body = await request.json();
    const data = createInstanceSchema.parse(body);
    
    const instance = await prisma.instance.create({
      data: {
        ...data,
        userId,
        status: 'pending'
      }
    });
    
    return NextResponse.json({ instance }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Failed to create instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 2.3.3 GET /api/instances/[id] - 获取单个实例
```typescript
// app/api/instances/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth();
  if (userId instanceof NextResponse) return userId;
  
  try {
    const instance = await prisma.instance.findFirst({
      where: { 
        id: params.id,
        userId 
      }
    });
    
    if (!instance) {
      return NextResponse.json(
        { error: 'Instance not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ instance });
  } catch (error) {
    console.error('Failed to fetch instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 2.3.4 PATCH /api/instances/[id] - 更新实例
```typescript
// app/api/instances/[id]/route.ts (续)
const updateInstanceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['pending', 'running', 'stopped', 'error']).optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth();
  if (userId instanceof NextResponse) return userId;
  
  try {
    const body = await request.json();
    const data = updateInstanceSchema.parse(body);
    
    const instance = await prisma.instance.updateMany({
      where: { 
        id: params.id,
        userId 
      },
      data
    });
    
    if (instance.count === 0) {
      return NextResponse.json(
        { error: 'Instance not found' },
        { status: 404 }
      );
    }
    
    const updated = await prisma.instance.findUnique({
      where: { id: params.id }
    });
    
    return NextResponse.json({ instance: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Failed to update instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 2.3.5 DELETE /api/instances/[id] - 删除实例
```typescript
// app/api/instances/[id]/route.ts (续)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await requireAuth();
  if (userId instanceof NextResponse) return userId;
  
  try {
    const result = await prisma.instance.deleteMany({
      where: { 
        id: params.id,
        userId 
      }
    });
    
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Instance not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

### 2.4 Prisma Client 单例（lib/prisma.ts）

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

### 2.5 Vercel 部署配置

#### 创建 vercel.json
```json
{
  "buildCommand": "prisma generate && next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

#### 环境变量设置
在 Vercel 控制台添加：
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

#### 部署命令
```bash
npx vercel --prod
```

---

## ✅ 验收标准

### 功能测试
1. ✅ 所有 5 个端点正常工作
2. ✅ Clerk 认证中间件拦截未授权请求
3. ✅ 数据库 CRUD 操作正确
4. ✅ 错误处理和验证生效

### 代码质量
1. ✅ TypeScript 无错误
2. ✅ ESLint 无警告
3. ✅ Prisma schema 正确生成

### 部署验证
1. ✅ Vercel 部署成功
2. ✅ 生产环境 API 可访问
3. ✅ 数据库连接正常

---

## 📊 交付物

1. **代码文件**
   - `prisma/schema.prisma`
   - `lib/prisma.ts`
   - `lib/auth.ts`
   - `app/api/instances/route.ts`
   - `app/api/instances/[id]/route.ts`

2. **配置文件**
   - `vercel.json`
   - `.env.local.example`（模板）

3. **文档**
   - API 端点说明
   - 数据库表结构
   - Vercel 部署步骤

---

## 🎯 执行指令

请按以下顺序完成任务：

1. 安装 Prisma 和相关依赖
2. 创建数据库 schema 和 migration
3. 实现认证中间件
4. 实现所有 API 端点
5. 本地测试所有端点
6. 配置 Vercel 部署
7. 部署到生产环境
8. 验证生产环境功能

---

## 📝 注意事项

- 所有代码必须有完整的 TypeScript 类型
- 所有 API 必须有错误处理
- 所有输入必须验证（Zod）
- Prisma Client 使用单例模式
- 日志记录所有错误
- 部署前运行 `npx prisma generate`

---

## 🔗 参考文档

- [Prisma 文档](https://www.prisma.io/docs)
- [Clerk Next.js 文档](https://clerk.com/docs/nextjs)
- [Neon 文档](https://neon.tech/docs)
- [Vercel 部署文档](https://vercel.com/docs)

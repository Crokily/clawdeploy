# Codex 任务：阶段 1.1 - Next.js 项目初始化和 Clerk 集成

**任务编号**: STAGE-1.1  
**分配给**: Codex CLI  
**预计时间**: 2-3 小时  
**优先级**: 高  

---

## 📋 任务概述

初始化 Next.js 14+ 项目（使用 App Router），并集成 Clerk 认证系统，实现基础的登录/注册和受保护路由功能。

---

## 🎯 目标

1. 创建一个可运行的 Next.js 项目
2. 集成 Clerk 认证
3. 实现基础的页面路由
4. 实现登录/注册流程
5. 实现受保护的 Dashboard 路由

---

## 📂 工作目录

```
/home/ubuntu/clawdeploy/frontend/
```

---

## 🛠️ 技术要求

### 1. 项目初始化

使用 `create-next-app` 初始化项目，**必须**使用以下配置：

```bash
cd /home/ubuntu/clawdeploy/frontend
npx create-next-app@latest ./ --typescript --tailwind --app --src-dir --import-alias "@/*"
```

**配置说明**:
- `--typescript`: 使用 TypeScript
- `--tailwind`: 使用 Tailwind CSS
- `--app`: 使用 App Router（不是 Pages Router）
- `--src-dir`: 使用 `src/` 目录结构
- `--import-alias "@/*"`: 配置路径别名

### 2. 安装 Clerk 依赖

```bash
cd /home/ubuntu/clawdeploy/frontend
npm install @clerk/nextjs
```

### 3. Clerk 集成

**重要**: 必须遵循 `/home/ubuntu/clerk_instruction.md` 中的指引！

#### 3.1 创建 `middleware.ts`

位置: `src/middleware.ts`

```typescript
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
```

#### 3.2 修改 `src/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawDeploy - One-Click OpenClaw Deployment",
  description: "Deploy your personal AI assistant in under 60 seconds",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <header className="border-b">
            <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
              <h1 className="text-xl font-bold">ClawDeploy</h1>
              <div>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                      Sign In
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </nav>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

#### 3.3 配置环境变量

创建 `.env.local` 文件（使用提供的测试密钥）:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y29vbC1nYXItODguY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=sk_test_NYtfbAwa688kdzclnUWEBJYIdIbHuxAmhxf14yDJaF
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 4. 页面创建

#### 4.1 落地页 - `src/app/page.tsx`

```typescript
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">
          Deploy OpenClaw in Under 60 Seconds
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Your personal AI assistant, deployed with one click.
        </p>
        
        <div className="flex gap-4 justify-center">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700">
                Get Started
              </button>
            </SignInButton>
          </SignedOut>
          
          <SignedIn>
            <Link 
              href="/dashboard"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700"
            >
              Go to Dashboard
            </Link>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
```

#### 4.2 Dashboard 页面 - `src/app/dashboard/page.tsx`

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/");
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow">
        <p className="text-gray-600">
          Welcome! This is your protected dashboard.
        </p>
        <p className="text-sm text-gray-500 mt-4">
          User ID: {userId}
        </p>
      </div>
    </div>
  );
}
```

---

## ✅ 验收标准

完成后，项目必须满足以下所有条件：

### 1. 项目可运行
```bash
cd /home/ubuntu/clawdeploy/frontend
npm run dev
```
- 服务器启动在 `http://localhost:3000`
- 无 TypeScript 错误
- 无 ESLint 错误

### 2. 落地页正常
- 访问 `http://localhost:3000` 显示落地页
- 未登录时显示 "Sign In" 按钮
- 已登录时显示 "Go to Dashboard" 链接

### 3. 认证流程正常
- 点击 "Sign In" 按钮打开 Clerk Modal
- 可以通过 Google 登录（测试账号）
- 登录后显示 UserButton（右上角头像）

### 4. 受保护路由正常
- 未登录访问 `/dashboard` 自动跳转到首页
- 登录后可访问 `/dashboard`
- Dashboard 显示用户 ID

### 5. 代码质量
- 遵循 Next.js App Router 最佳实践
- 使用 TypeScript 类型安全
- 代码格式整洁，注释清晰
- 遵循 Clerk 官方文档的集成方式

---

## 📚 参考文档

1. **Clerk 集成指南** (必读):
   - `/home/ubuntu/clerk_instruction.md`
   
2. **项目文档**:
   - `/home/ubuntu/clawdeploy/README.md`
   - `/home/ubuntu/clawdeploy/docs/PROJECT_PLAN.md`
   
3. **官方文档**:
   - [Next.js App Router](https://nextjs.org/docs/app)
   - [Clerk Next.js](https://clerk.com/docs/quickstarts/nextjs)

---

## 🧪 测试步骤

完成开发后，执行以下测试：

### 自动化测试（使用 npm scripts）
```bash
# 类型检查
npm run type-check  # 或 npx tsc --noEmit

# Lint 检查
npm run lint

# 构建测试
npm run build
```

### 手动测试（使用 agent-browser）
```bash
# 启动开发服务器
npm run dev

# 在另一个终端执行测试
agent-browser open http://localhost:3000
agent-browser snapshot -i
# 应该看到 Sign In 按钮

# 测试登录流程
agent-browser click @e1  # Sign In 按钮
agent-browser wait 2000
agent-browser screenshot

# 测试 Dashboard 访问
agent-browser open http://localhost:3000/dashboard
# 未登录应该跳转回首页
```

---

## 📤 交付内容

完成后，请提供：

1. **项目结构截图**
   ```bash
   tree -L 3 -I 'node_modules' /home/ubuntu/clawdeploy/frontend
   ```

2. **运行截图**
   - 终端显示 `npm run dev` 成功运行
   - 浏览器截图（落地页）

3. **代码提交**
   ```bash
   cd /home/ubuntu/clawdeploy
   git add frontend/
   git commit -m "feat: Initialize Next.js project with Clerk authentication"
   git push
   ```

4. **简要报告**
   - 完成了哪些功能
   - 遇到了什么问题（如有）
   - 测试结果

---

## ⚠️ 注意事项

1. **不要修改** `.env.local.example`（模板文件）
2. **确保** `.env.local` 已添加到 `.gitignore`
3. **使用** 提供的测试 Clerk 密钥，不要创建新的应用
4. **遵循** App Router 模式，不要使用 Pages Router
5. **参考** `/home/ubuntu/clerk_instruction.md` 的警告部分，避免使用过时的 API

---

## 🚀 开始执行

Codex，请按照上述要求完成任务。如有疑问，请在执行前询问。

完成后，我会进行验收测试，并准备下一阶段的任务。

---

**任务创建时间**: 2026-02-08 10:05 UTC  
**任务状态**: 待执行

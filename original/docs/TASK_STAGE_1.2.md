# 阶段 1.2：UI 组件库开发

**负责人**: Codex CLI  
**预计时间**: 2-3 小时  
**优先级**: 高

---

## 📋 任务目标

创建一套完整的、可复用的 UI 组件库，为后续 Dashboard 和表单页面开发打下基础。所有组件需遵循现代设计理念，支持响应式布局，并具备良好的可访问性。

---

## 🎯 验收标准

- ✅ 所有组件使用 TypeScript 定义 Props
- ✅ 组件支持响应式设计（移动端/桌面端）
- ✅ 使用 Tailwind CSS 实现样式
- ✅ 遵循 Next.js 16+ App Router 最佳实践
- ✅ 代码通过 ESLint 和 TypeScript 检查
- ✅ 项目可成功构建（`npm run build`）

---

## 🏗️ 任务清单

### 1. 配置 Tailwind 主题和设计 Tokens

**文件**: `frontend/tailwind.config.ts`

**要求**:
- 定义品牌色彩系统（primary, secondary, accent, danger, success, warning）
- 使用现代配色方案（避免传统的红蓝绿）
- 定义阴影、圆角、间距等设计 tokens
- 支持暗色模式（可选，如果时间允许）

**示例配色**:
```typescript
colors: {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    // ... 完整色阶
    600: '#0284c7',
    700: '#0369a1',
  },
  // 其他颜色...
}
```

---

### 2. 创建基础组件

创建以下组件，每个组件都应该：
- 定义清晰的 TypeScript 接口
- 支持多种变体（variant）
- 支持禁用状态
- 有适当的 hover/focus 效果

#### 2.1 Button 组件

**文件**: `frontend/src/components/ui/Button.tsx`

**Props**:
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

**变体**:
- `primary`: 主要操作按钮（渐变背景）
- `secondary`: 次要操作按钮（边框样式）
- `danger`: 危险操作按钮（红色系）
- `ghost`: 透明背景按钮

**特性**:
- Loading 状态显示 Spinner
- 支持图标（左/右）
- 禁用状态灰色显示

---

#### 2.2 Card 组件

**文件**: `frontend/src/components/ui/Card.tsx`

**Props**:
```typescript
interface CardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'bordered' | 'elevated';
  className?: string;
}
```

**变体**:
- `default`: 默认样式（浅色背景）
- `bordered`: 带边框
- `elevated`: 带阴影（悬浮效果）

---

#### 2.3 Input 组件

**文件**: `frontend/src/components/ui/Input.tsx`

**Props**:
```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

**特性**:
- 显示 label（可选）
- 错误状态（红色边框 + 错误信息）
- 辅助文本（灰色小字）
- 支持图标

---

#### 2.4 Select 组件

**文件**: `frontend/src/components/ui/Select.tsx`

**Props**:
```typescript
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}
```

---

#### 2.5 Badge 组件

**文件**: `frontend/src/components/ui/Badge.tsx`

**Props**:
```typescript
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md';
}
```

**用途**: 显示实例状态（running/stopped/error）

---

#### 2.6 LoadingSpinner 组件

**文件**: `frontend/src/components/ui/LoadingSpinner.tsx`

**Props**:
```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}
```

**实现**: 使用 CSS 动画或 SVG 旋转动画

---

#### 2.7 Modal 组件

**文件**: `frontend/src/components/ui/Modal.tsx`

**Props**:
```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}
```

**特性**:
- 背景遮罩（半透明）
- 点击外部关闭
- ESC 键关闭
- 动画进出效果

---

### 3. 创建 Layout 组件

#### 3.1 DashboardLayout 组件

**文件**: `frontend/src/components/layout/DashboardLayout.tsx`

**Props**:
```typescript
interface DashboardLayoutProps {
  children: React.ReactNode;
}
```

**结构**:
```
┌──────────────────────────────────┐
│ Navbar (固定顶部)                │
│ - Logo                           │
│ - User Menu (Clerk UserButton)   │
└──────────────────────────────────┘
┌─────────┬────────────────────────┐
│ Sidebar │ Main Content Area      │
│         │                        │
│ - Home  │ {children}             │
│ - New   │                        │
│         │                        │
└─────────┴────────────────────────┘
```

**Sidebar 导航项**:
- Dashboard (`/dashboard`)
- Create Instance (`/dashboard/new`)
- Documentation (外部链接)

---

#### 3.2 EmptyState 组件

**文件**: `frontend/src/components/ui/EmptyState.tsx`

**Props**:
```typescript
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

**用途**: 显示 "还没有实例" 等空状态

---

### 4. 更新现有页面

#### 4.1 更新 Dashboard 页面

**文件**: `frontend/src/app/dashboard/page.tsx`

**要求**:
- 使用 `DashboardLayout` 包裹
- 使用 `Card` 组件显示欢迎信息
- 添加 "Create New Instance" 按钮（使用 `Button` 组件）

---

### 5. 创建组件索引文件

**文件**: `frontend/src/components/ui/index.ts`

导出所有 UI 组件：
```typescript
export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';
export { Select } from './Select';
export { Badge } from './Badge';
export { LoadingSpinner } from './LoadingSpinner';
export { Modal } from './Modal';
export { EmptyState } from './EmptyState';
```

**文件**: `frontend/src/components/layout/index.ts`

导出所有 Layout 组件：
```typescript
export { DashboardLayout } from './DashboardLayout';
```

---

## 🎨 设计参考

### 现代设计理念
- **Glassmorphism**: 使用半透明背景 + backdrop-blur
- **渐变色**: 按钮和标题使用渐变
- **微动画**: Hover/Focus 时的过渡效果
- **圆角**: 使用 `rounded-lg` 或 `rounded-xl`
- **阴影**: 使用多层阴影增加深度感

### Tailwind 常用类
- 间距：`p-4`, `px-6 py-3`, `space-y-4`
- 颜色：`bg-primary-600`, `text-gray-700`, `border-gray-200`
- 圆角：`rounded-lg`, `rounded-full`
- 阴影：`shadow-sm`, `shadow-md`, `shadow-lg`
- 过渡：`transition-all duration-200 ease-in-out`

---

## 📂 最终目录结构

```
frontend/src/
├── app/
│   ├── dashboard/
│   │   └── page.tsx          # 已更新，使用新组件
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── Modal.tsx
│   │   ├── EmptyState.tsx
│   │   └── index.ts
│   └── layout/
│       ├── DashboardLayout.tsx
│       └── index.ts
├── proxy.ts
└── (其他文件)
```

---

## ✅ 完成检查清单

执行完成后，确保：

- [ ] 所有组件文件已创建
- [ ] TypeScript 类型定义完整
- [ ] ESLint 无错误：`npm run lint`
- [ ] TypeScript 无错误：`npx tsc --noEmit`
- [ ] 构建成功：`npm run build`
- [ ] Dashboard 页面使用新组件重构

---

## 🚀 执行说明（给 Codex）

1. **工作目录**: `/home/ubuntu/clawdeploy/frontend`
2. **创建顺序**: 
   - 先创建基础组件（Button, Card, Input, Select, Badge, LoadingSpinner）
   - 再创建 Modal 和 EmptyState
   - 最后创建 DashboardLayout
3. **验证步骤**:
   - 每创建一个组件后运行 `npx tsc --noEmit` 检查类型错误
   - 全部完成后运行 `npm run build` 验证构建
4. **代码规范**:
   - 使用 `'use client'` directive（如果组件需要交互）
   - 遵循 Next.js 16+ 的 Server/Client Component 区分
   - 使用函数式组件 + TypeScript

---

## 📝 注意事项

- **不要修改**已有的 Clerk 配置和认证相关代码
- **不要修改** `proxy.ts` 和 `layout.tsx` 中的 Clerk 部分
- 所有新组件放在 `src/components/` 下
- 确保所有组件都有良好的 TypeScript 类型支持

---

**任务创建时间**: 2026-02-08  
**预期完成时间**: 2-3 小时  
**下一阶段**: 阶段 2 - 后端 API 服务开发

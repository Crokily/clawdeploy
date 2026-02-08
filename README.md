# ClawDeploy 🚀

> **One-Click OpenClaw Deployment Platform**  
> Deploy your personal AI assistant powered by OpenClaw in under 60 seconds.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

## 🌟 Features

- **🔐 Secure Authentication** - Google OAuth via Clerk
- **🤖 Multiple AI Models** - Claude Opus 4.5, GPT-5.2, Gemini 3 Flash
- **💬 Multi-Channel Support** - Telegram, Discord, WhatsApp
- **🐳 Docker-based** - Isolated, secure OpenClaw instances
- **📊 Real-time Monitoring** - Instance status, logs, and resource usage
- **⚡ Lightning Fast** - Deploy in seconds, not hours

## 🏗️ Architecture

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Clerk
- **Deployment**: Vercel

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express/Fastify
- **Container**: Docker
- **Database**: PostgreSQL (Neon)
- **Deployment**: Ubuntu Server

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker Engine
- PostgreSQL (or Neon account)
- Clerk account
- Vercel account (for frontend deployment)

### Local Development

#### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/clawdeploy.git
cd clawdeploy
```

#### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your Clerk keys and API endpoint
npm run dev
```

#### 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database URL and other configs
npm run dev
```

#### 4. Database Setup

```bash
# Run migrations
cd backend
npm run migrate
```

### Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## 📚 Documentation

- [Project Plan](../PROJECT_PLAN.md) - Complete development roadmap
- [API Documentation](./backend/API.md) - Backend API reference
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment steps

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, Dockerode |
| Database | PostgreSQL (Neon) |
| Authentication | Clerk |
| Container | Docker Engine |
| Deployment | Vercel (Frontend), Ubuntu (Backend) |

## 📦 Project Structure

```
clawdeploy/
├── frontend/              # Next.js frontend application
│   ├── app/              # App Router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities and API clients
│   └── public/           # Static assets
├── backend/              # Node.js backend API
│   ├── src/
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic
│   │   ├── models/      # Database models
│   │   └── middleware/  # Express middleware
│   └── prisma/          # Database schema and migrations
└── docs/                # Additional documentation
```

## 🔐 Environment Variables

### Frontend (.env.local)

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Backend (.env)

```bash
DATABASE_URL=postgresql://user:password@host:5432/clawdeploy
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
PORT=4000
NODE_ENV=development
```

## 🧪 Testing

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test

# E2E tests with agent-browser
./scripts/test-e2e.sh
```

## 🚀 Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
```

### Backend (Ubuntu Server)

```bash
cd backend
npm run build
pm2 start ecosystem.config.js
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenClaw](https://openclaw.ai/) - The AI assistant framework
- [SimpleClaw](https://www.simpleclaw.com/) - Inspiration
- [EasyClaw](https://easyclaw.ai/) - Inspiration
- [Clerk](https://clerk.com/) - Authentication
- [Neon](https://neon.tech/) - Serverless PostgreSQL
- [Vercel](https://vercel.com/) - Frontend hosting

## 📧 Contact

For questions or support, please open an issue or contact us at support@clawdeploy.com

---

**Status**: 🚧 In Development  
**Version**: 0.1.0 (MVP)  
**Last Updated**: 2026-02-08

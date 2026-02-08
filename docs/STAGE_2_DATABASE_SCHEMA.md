# Stage 2 Database Structure

Prisma schema file: `frontend/prisma/schema.prisma`

## Datasource

- Provider: `postgresql`
- Connection: `DATABASE_URL`

## Model: `Instance`

| Field | Type | Constraints |
|---|---|---|
| `id` | `String` | Primary key, `@default(cuid())` |
| `userId` | `String` | Clerk user ID |
| `name` | `String` | Required |
| `status` | `String` | Required, default `pending` |
| `region` | `String` | Required |
| `instanceType` | `String` | Required |
| `ipAddress` | `String?` | Optional |
| `createdAt` | `DateTime` | Default `now()` |
| `updatedAt` | `DateTime` | Auto-updated |

## Indexes

- `@@index([userId])`
- `@@index([status])`

## Prisma Commands

From `frontend` directory:

```bash
npx prisma generate
npx prisma db push
```

Or use package scripts:

```bash
npm run prisma:generate
npm run prisma:db:push
```

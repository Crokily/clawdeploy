# Stage 2 Vercel Deployment

Vercel config file: `vercel.json`

## Included Build Config

```json
{
  "framework": "nextjs",
  "installCommand": "cd frontend && npm install",
  "buildCommand": "cd frontend && npx prisma generate && npm run build",
  "devCommand": "cd frontend && npm run dev",
  "regions": ["iad1"]
}
```

## Required Environment Variables

Set in Vercel project settings:

- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `LOG_LEVEL` (optional, recommended `info`)

## Deployment Steps

1. Ensure local validation passed:
   - `cd frontend`
   - `npm run prisma:generate`
   - `npm run lint`
   - `npm run build`
2. Push code to remote repository branch.
3. In Vercel, import repository and configure environment variables.
4. Trigger production deployment.
5. Verify API routes:
   - `GET /api/instances`
   - `POST /api/instances`
   - `GET /api/instances/:id`
   - `PATCH /api/instances/:id`
   - `DELETE /api/instances/:id`

# ClawDeploy API Documentation

Base URL (local): `http://localhost:3000`

All endpoints are implemented as Next.js Route Handlers under `frontend/src/app/api`.

## Authentication

### Clerk JWT

User-scoped endpoints require a valid Clerk-authenticated user (`auth().userId`).

Use one of the following:

- Browser session cookie managed by Clerk
- `Authorization: Bearer <clerk_jwt>`

Example header:

```http
Authorization: Bearer eyJhbGciOi...
```

If authentication fails, the API returns:

```json
{ "error": "Unauthorized" }
```

with status `401`.

### Admin Sync Authentication

`POST /api/admin/sync` does **not** use Clerk auth. It requires:

- Header: `x-sync-secret: <SYNC_SECRET>`
- Environment variable: `SYNC_SECRET`

If the header is missing or invalid, the API returns `401 Unauthorized`.

## Data Model (Instance)

Common fields returned by instance endpoints:

```json
{
  "id": "cm9x2y4w40000abc123def456",
  "userId": "user_2xY...",
  "name": "My OpenClaw Assistant",
  "model": "claude-opus-4.5",
  "channel": "telegram",
  "status": "running",
  "region": "us-east-1",
  "instanceType": "small",
  "botToken": null,
  "apiKey": null,
  "containerId": "8fd329a5f5f4...",
  "config": {},
  "ipAddress": null,
  "createdAt": "2026-02-14T08:00:00.000Z",
  "updatedAt": "2026-02-14T08:00:10.000Z"
}
```

Valid status values:

- `pending`
- `creating`
- `running`
- `stopped`
- `error`
- `deleted`

## Endpoints

### GET /api/health

Returns service health and Docker connectivity.

Authentication: Not required

Example response (`200`):

```json
{
  "status": "ok",
  "timestamp": "2026-02-14T08:12:34.567Z",
  "docker": "connected"
}
```

---

### GET /api/instances

Lists all instances for the authenticated user, newest first.

Authentication: Clerk JWT required

Example request:

```http
GET /api/instances
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "instances": [
    {
      "id": "cm9x2y4w40000abc123def456",
      "userId": "user_2xY...",
      "name": "Support Bot",
      "model": "gpt-5.2",
      "channel": "discord",
      "status": "running",
      "region": null,
      "instanceType": null,
      "botToken": null,
      "apiKey": null,
      "containerId": "8fd329a5f5f4...",
      "config": {},
      "ipAddress": null,
      "createdAt": "2026-02-14T08:00:00.000Z",
      "updatedAt": "2026-02-14T08:00:10.000Z"
    }
  ]
}
```

Note: `botToken` and `apiKey` are redacted (`null`) in this endpoint.

---

### POST /api/instances

Creates an instance record, then attempts to create/start a Docker container.

Authentication: Clerk JWT required

Rate limit: 60 requests/minute per user (`429` when exceeded)

Request body:

```json
{
  "name": "My OpenClaw Assistant",
  "model": "claude-opus-4.5",
  "channel": "telegram",
  "botToken": "optional-token",
  "apiKey": "optional-api-key",
  "region": "us-east-1",
  "instanceType": "small"
}
```

Validation rules:

- `name`: required, non-empty, max 100 chars
- `model`: one of `claude-opus-4.5`, `gpt-5.2`, `gemini-3-flash`
- `channel`: one of `telegram`, `discord`, `whatsapp`
- Optional: `botToken`, `apiKey`, `region`, `instanceType`

Example success response (`201`):

```json
{
  "instance": {
    "id": "cm9x2y4w40000abc123def456",
    "userId": "user_2xY...",
    "name": "My OpenClaw Assistant",
    "model": "claude-opus-4.5",
    "channel": "telegram",
    "status": "running",
    "region": "us-east-1",
    "instanceType": "small",
    "botToken": "optional-token",
    "apiKey": "optional-api-key",
    "containerId": "8fd329a5f5f4...",
    "config": {},
    "ipAddress": null,
    "createdAt": "2026-02-14T08:00:00.000Z",
    "updatedAt": "2026-02-14T08:00:10.000Z"
  }
}
```

If container creation fails, response is still `201` but status is typically `error`.

---

### GET /api/instances/:id

Returns a single instance owned by the authenticated user.

Authentication: Clerk JWT required

Example request:

```http
GET /api/instances/cm9x2y4w40000abc123def456
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "instance": {
    "id": "cm9x2y4w40000abc123def456",
    "userId": "user_2xY...",
    "name": "Support Bot",
    "model": "gpt-5.2",
    "channel": "discord",
    "status": "running",
    "region": null,
    "instanceType": null,
    "botToken": null,
    "apiKey": null,
    "containerId": "8fd329a5f5f4...",
    "config": {},
    "ipAddress": null,
    "createdAt": "2026-02-14T08:00:00.000Z",
    "updatedAt": "2026-02-14T08:00:10.000Z"
  }
}
```

Note: `botToken` and `apiKey` are redacted (`null`) in this endpoint.

---

### PATCH /api/instances/:id

Updates one instance owned by the authenticated user.

Authentication: Clerk JWT required

Request body (at least one field required):

```json
{
  "name": "Renamed Instance",
  "status": "stopped",
  "botToken": "new-token",
  "apiKey": "new-api-key",
  "config": {
    "featureFlags": {
      "autoReply": true
    }
  }
}
```

Allowed fields:

- `name` (string, 1-100 chars)
- `status` (`pending`, `creating`, `running`, `stopped`, `error`, `deleted`)
- `botToken` (string)
- `apiKey` (string)
- `config` (JSON value)

Example response (`200`):

```json
{
  "instance": {
    "id": "cm9x2y4w40000abc123def456",
    "userId": "user_2xY...",
    "name": "Renamed Instance",
    "model": "gpt-5.2",
    "channel": "discord",
    "status": "stopped",
    "region": null,
    "instanceType": null,
    "botToken": "new-token",
    "apiKey": "new-api-key",
    "containerId": "8fd329a5f5f4...",
    "config": {
      "featureFlags": {
        "autoReply": true
      }
    },
    "ipAddress": null,
    "createdAt": "2026-02-14T08:00:00.000Z",
    "updatedAt": "2026-02-14T08:05:00.000Z"
  }
}
```

---

### DELETE /api/instances/:id

Deletes an instance and attempts to remove its Docker container.

Authentication: Clerk JWT required

Rate limit: 60 requests/minute per user (`429` when exceeded)

Example request:

```http
DELETE /api/instances/cm9x2y4w40000abc123def456
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "success": true
}
```

---

### POST /api/instances/:id/start

Starts the instance container and sets status to `running`.

Authentication: Clerk JWT required

Rate limit: 60 requests/minute per user (`429` when exceeded)

Example request:

```http
POST /api/instances/cm9x2y4w40000abc123def456/start
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "instance": {
    "id": "cm9x2y4w40000abc123def456",
    "userId": "user_2xY...",
    "name": "Support Bot",
    "model": "gpt-5.2",
    "channel": "discord",
    "status": "running",
    "region": null,
    "instanceType": null,
    "botToken": null,
    "apiKey": null,
    "containerId": "8fd329a5f5f4...",
    "config": {},
    "ipAddress": null,
    "createdAt": "2026-02-14T08:00:00.000Z",
    "updatedAt": "2026-02-14T08:07:00.000Z"
  }
}
```

If the instance has no container, response is `400` with:

```json
{ "error": "Instance has no container" }
```

---

### POST /api/instances/:id/stop

Stops the instance container and sets status to `stopped`.

Authentication: Clerk JWT required

Rate limit: 60 requests/minute per user (`429` when exceeded)

Example request:

```http
POST /api/instances/cm9x2y4w40000abc123def456/stop
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "instance": {
    "id": "cm9x2y4w40000abc123def456",
    "userId": "user_2xY...",
    "name": "Support Bot",
    "model": "gpt-5.2",
    "channel": "discord",
    "status": "stopped",
    "region": null,
    "instanceType": null,
    "botToken": null,
    "apiKey": null,
    "containerId": "8fd329a5f5f4...",
    "config": {},
    "ipAddress": null,
    "createdAt": "2026-02-14T08:00:00.000Z",
    "updatedAt": "2026-02-14T08:09:00.000Z"
  }
}
```

If the instance has no container, response is `400` with:

```json
{ "error": "Instance has no container" }
```

---

### GET /api/instances/:id/logs

Returns container logs for an instance.

Authentication: Clerk JWT required

Query params:

- `tail` (optional): positive integer number of lines
- Default: `100`

Example request:

```http
GET /api/instances/cm9x2y4w40000abc123def456/logs?tail=200
Authorization: Bearer <clerk_jwt>
```

Example response (`200`):

```json
{
  "logs": "[info] server started\n[info] connected to channel\n"
}
```

Invalid `tail` (for example `tail=0`) returns `400`.

---

### POST /api/admin/sync

Synchronizes DB instance statuses with Docker container statuses for instances currently in `running` or `creating` states.

Authentication: `x-sync-secret` header required

Example request:

```http
POST /api/admin/sync
x-sync-secret: super-secret-value
```

Example response (`200`):

```json
{
  "checked": 12,
  "updated": 3
}
```

---

## Error Codes

### 400 Bad Request

Returned when request input is invalid, such as:

- Malformed JSON body
- Schema validation failure
- Invalid instance ID
- Invalid query params (for example `tail`)
- Missing container for start/stop/logs operations

Typical payload:

```json
{
  "error": "Invalid input",
  "details": [
    {
      "path": ["tail"],
      "message": "tail must be a positive integer"
    }
  ]
}
```

### 401 Unauthorized

Returned when:

- Clerk user auth is missing/invalid for user endpoints
- `x-sync-secret` is missing/invalid for admin sync

Typical payload:

```json
{ "error": "Unauthorized" }
```

### 404 Not Found

Returned when the target instance does not exist or is not owned by the authenticated user.

Typical payload:

```json
{ "error": "Instance not found" }
```

### 429 Too Many Requests

Returned by rate-limited endpoints when a user exceeds 60 requests per minute.

Typical payload:

```json
{
  "error": "Too many requests",
  "retryAfter": 8
}
```

### 500 Internal Server Error

Returned for unexpected server or infrastructure failures.

Typical payload:

```json
{ "error": "Internal server error" }
```

# Stage 2 API Endpoints

Base path: `/api/instances`

## Authentication

All endpoints require Clerk authentication.  
When the user is not authenticated, API returns:

```json
{
  "error": "Unauthorized"
}
```

Status code: `401`

## Endpoints

### `GET /api/instances`

Get all instances for current Clerk user.

Success (`200`):

```json
{
  "instances": [
    {
      "id": "ckxxxxxxxxxxxxxxxx",
      "userId": "user_123",
      "name": "My Instance",
      "status": "running",
      "region": "us-east-1",
      "instanceType": "small",
      "ipAddress": "203.0.113.10",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:05:00.000Z"
    }
  ]
}
```

### `POST /api/instances`

Create a new instance.

Request body:

```json
{
  "name": "My Instance",
  "region": "us-east-1",
  "instanceType": "small"
}
```

Success (`201`):

```json
{
  "instance": {
    "id": "ckxxxxxxxxxxxxxxxx",
    "userId": "user_123",
    "name": "My Instance",
    "status": "pending",
    "region": "us-east-1",
    "instanceType": "small",
    "ipAddress": null,
    "createdAt": "2026-02-08T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:00:00.000Z"
  }
}
```

Validation error (`400`):

```json
{
  "error": "Invalid input",
  "details": []
}
```

### `GET /api/instances/:id`

Get one instance by ID (scoped to current user).

Success (`200`):

```json
{
  "instance": {
    "id": "ckxxxxxxxxxxxxxxxx",
    "userId": "user_123",
    "name": "My Instance",
    "status": "running",
    "region": "us-east-1",
    "instanceType": "small",
    "ipAddress": "203.0.113.10",
    "createdAt": "2026-02-08T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:05:00.000Z"
  }
}
```

Not found (`404`):

```json
{
  "error": "Instance not found"
}
```

### `PATCH /api/instances/:id`

Update instance fields.

Request body (at least one field required):

```json
{
  "name": "Renamed Instance",
  "status": "stopped"
}
```

Success (`200`):

```json
{
  "instance": {
    "id": "ckxxxxxxxxxxxxxxxx",
    "userId": "user_123",
    "name": "Renamed Instance",
    "status": "stopped",
    "region": "us-east-1",
    "instanceType": "small",
    "ipAddress": "203.0.113.10",
    "createdAt": "2026-02-08T10:00:00.000Z",
    "updatedAt": "2026-02-08T10:10:00.000Z"
  }
}
```

### `DELETE /api/instances/:id`

Delete instance owned by current user.

Success (`200`):

```json
{
  "success": true
}
```

## Common Error Responses

- `400`: invalid JSON or Zod validation failed
- `401`: unauthorized (Clerk user missing/invalid)
- `404`: instance not found for current user
- `500`: server/internal database errors

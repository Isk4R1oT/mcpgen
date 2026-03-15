# Task Management API

Base URL: `https://api.taskmanager.io/v1`

## Authentication

All requests require a Bearer token in the Authorization header.

## Endpoints

### List Tasks

```
GET /tasks
```

Query parameters:
- `status` (string, optional): Filter by status. Values: "todo", "in_progress", "done"
- `limit` (integer, optional): Max results, default 20

Returns an array of Task objects.

### Get Task by ID

```
GET /tasks/{id}
```

Path parameters:
- `id` (integer, required): Task ID

Returns a single Task object.

### Create Task

```
POST /tasks
```

Request body (JSON):
```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "assignee": "string (optional)"
}
```

Returns the created Task object.

### Update Task

```
PUT /tasks/{id}
```

Path parameters:
- `id` (integer, required): Task ID

Request body (JSON):
```json
{
  "title": "string",
  "status": "string",
  "description": "string"
}
```

### Delete Task

```
DELETE /tasks/{id}
```

Path parameters:
- `id` (integer, required): Task ID

Returns 204 No Content.

## Models

### Task
- `id` (integer)
- `title` (string)
- `description` (string)
- `status` (string): "todo", "in_progress", "done"
- `assignee` (string)
- `created_at` (datetime)

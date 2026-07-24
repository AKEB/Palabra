# Palabra

Palabra is an offline-first PWA for learning Spanish words and phrases with a server-backed account, word lists, admin panel, and progress sync.

## Local run

```bash
docker compose up --build
```

Open `http://localhost:8080`.

## Docker Hub

Set your Docker Hub namespace and run:

```bash
DOCKERHUB_IMAGE=your-login/palabra:latest npm run docker:build
DOCKERHUB_IMAGE=your-login/palabra:latest npm run docker:push
```

## Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random secret for auth tokens.
- `PORT`: app port, defaults to `8080`.

The admin panel requires an online connection. Training works offline after word lists are synced.

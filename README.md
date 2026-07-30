# Palabra

Palabra is an offline-first PWA for learning words and phrases from Russian into other languages. It includes a server-backed account, word lists, admin panel, and progress sync.

## Languages

Switch languages anytime in the sidebar (desktop) or top bar (mobile):

- `RU → ES` Spanish
- `RU → EN` English
- `RU → AM` Armenian
- `RU → GE` Georgian
- `RU → PT` Portuguese
- `RU → DE` German
- `RU → AR` Arabic
- `RU → IT` Italian
- `RU → ZH` Chinese
- `RU → NL` Dutch
- `RU → FR` French
- `RU → SR` Serbian
- `RU → SK` Slovak
- `RU → SL` Slovenian
- `RU → PL` Polish
- `RU → EL` Greek

Topic flashcards are imported from [Flashcardo](https://flashcardo.com/ru/ispanskiye-kartochki/) and the matching pages for each language.

## Local run

```bash
docker compose up --build
```

Open `http://localhost:8080`.

Refresh Flashcardo seed data and audio:

```bash
npm run fetch:flashcardo
npm run fetch:audio
```

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

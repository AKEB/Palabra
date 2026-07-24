import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import pg from "pg";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL || "postgres://palabra:palabra@localhost:5432/palabra";
const publicDir = join(process.cwd(), "dist");

const pool = new Pool({ connectionString: DATABASE_URL });

const seedLists = [
  {
    title: "Еда",
    icon: "🍔",
    color: "#ff5a45",
    words: [
      ["яблоко", "la manzana", "", "ла мансана"],
      ["молоко", "la leche", "", "ла лече"],
      ["хлеб", "el pan", "", "эль пан"],
      ["Мне нужен кофе", "Necesito un cafe", "", "несесито ун кафе"],
    ],
  },
  {
    title: "Путешествия",
    icon: "✈️",
    color: "#087d86",
    words: [
      ["аэропорт", "el aeropuerto", "", "эль аэропуэрто"],
      ["Где вокзал?", "Donde esta la estacion?", "", "донде эста ла эстасьон"],
      ["билет", "el billete", "", "эль бийете"],
    ],
  },
];

await initDb();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
}).listen(PORT, () => {
  console.log(`Palabra listening on http://localhost:${PORT}`);
});

async function initDb() {
  await pool.query(`
    create table if not exists users (
      id uuid primary key,
      email text not null unique,
      password_hash text not null,
      salt text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists word_lists (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      icon text not null default '📚',
      color text not null default '#087d86',
      updated_at timestamptz not null default now()
    );

    create table if not exists words (
      id uuid primary key,
      list_id uuid not null references word_lists(id) on delete cascade,
      ru text not null,
      es text not null,
      ru_pronunciation text not null default '',
      es_pronunciation text not null default '',
      updated_at timestamptz not null default now()
    );

    create table if not exists progress (
      user_id uuid not null references users(id) on delete cascade,
      word_id uuid not null references words(id) on delete cascade,
      known_count integer not null default 0,
      unknown_count integer not null default 0,
      correct_count integer not null default 0,
      wrong_count integer not null default 0,
      mastery_written_correct integer not null default 0,
      mastery_written_wrong integer not null default 0,
      mastery_oral_correct integer not null default 0,
      mastery_oral_wrong integer not null default 0,
      last_result text not null default '',
      activity_dates jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (user_id, word_id)
    );

    create table if not exists disabled_words (
      user_id uuid not null references users(id) on delete cascade,
      word_id uuid not null references words(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, word_id)
    );
  `);
  await pool.query("alter table progress add column if not exists activity_dates jsonb not null default '[]'::jsonb");
  await pool.query("alter table progress add column if not exists mastery_written_correct integer not null default 0");
  await pool.query("alter table progress add column if not exists mastery_written_wrong integer not null default 0");
  await pool.query("alter table progress add column if not exists mastery_oral_correct integer not null default 0");
  await pool.query("alter table progress add column if not exists mastery_oral_wrong integer not null default 0");
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email.includes("@") || password.length < 6) return sendJson(response, 400, { error: "Проверьте email и пароль" });
    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const userId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("insert into users (id, email, password_hash, salt) values ($1, $2, $3, $4)", [userId, email, passwordHash, salt]);
      await seedUser(userId, client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error?.code === "23505") return sendJson(response, 409, { error: "Такой email уже зарегистрирован" });
      console.error("Registration failed", error);
      return sendJson(response, 500, { error: "Не удалось создать аккаунт" });
    } finally {
      client.release();
    }
    return sendJson(response, 201, { token: signToken({ sub: userId, email }), email });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const { rows } = await pool.query("select * from users where email = $1", [email]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) return sendJson(response, 401, { error: "Неверный email или пароль" });
    return sendJson(response, 200, { token: signToken({ sub: user.id, email: user.email }), email: user.email });
  }

  const user = await requireUser(request, response);
  if (!user) return;

  if (request.method === "GET" && url.pathname === "/api/sync") {
    const data = await getUserData(user.sub);
    return sendJson(response, 200, { ...data, email: user.email });
  }

  if (request.method === "POST" && url.pathname === "/api/sync/progress") {
    const body = await readJson(request);
    const events = Array.isArray(body.events) ? body.events : [];
    for (const event of events) {
      const result = String(event.result || "");
      if (!["known", "unknown", "correct", "wrong"].includes(result)) continue;
      const practiceKind = String(event.practiceKind || "");
      const activityDate = new Date(event.createdAt || Date.now()).toISOString().slice(0, 10);
      await pool.query(
        `
          insert into progress (
            user_id,
            word_id,
            known_count,
            unknown_count,
            correct_count,
            wrong_count,
            mastery_written_correct,
            mastery_written_wrong,
            mastery_oral_correct,
            mastery_oral_wrong,
            last_result,
            activity_dates,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, jsonb_build_array($12::text), now())
          on conflict (user_id, word_id) do update set
            known_count = progress.known_count + excluded.known_count,
            unknown_count = progress.unknown_count + excluded.unknown_count,
            correct_count = progress.correct_count + excluded.correct_count,
            wrong_count = progress.wrong_count + excluded.wrong_count,
            mastery_written_correct = progress.mastery_written_correct + excluded.mastery_written_correct,
            mastery_written_wrong = progress.mastery_written_wrong + excluded.mastery_written_wrong,
            mastery_oral_correct = progress.mastery_oral_correct + excluded.mastery_oral_correct,
            mastery_oral_wrong = progress.mastery_oral_wrong + excluded.mastery_oral_wrong,
            last_result = excluded.last_result,
            activity_dates = (
              select jsonb_agg(distinct value)
              from jsonb_array_elements_text(progress.activity_dates || excluded.activity_dates) as value
            ),
            updated_at = now()
        `,
        [
          user.sub,
          event.wordId,
          result === "known" ? 1 : 0,
          result === "unknown" ? 1 : 0,
          result === "correct" ? 1 : 0,
          result === "wrong" ? 1 : 0,
          practiceKind === "written-es" && result === "correct" ? 1 : 0,
          practiceKind === "written-es" && result === "wrong" ? 1 : 0,
          practiceKind === "oral" && result === "known" ? 1 : 0,
          practiceKind === "oral" && result === "unknown" ? 1 : 0,
          result,
          activityDate,
        ]
      ).catch(() => undefined);
      await disableMasteredWord(user.sub, event.wordId).catch(() => undefined);
    }
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/lists") {
    const body = await readJson(request);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(response, 400, { error: "Название списка обязательно" });
    const { rows } = await pool.query(
      "insert into word_lists (id, user_id, title, icon, color) values ($1, $2, $3, $4, $5) returning *",
      [randomUUID(), user.sub, title, String(body.icon || "📚").slice(0, 8), String(body.color || "#087d86")]
    );
    return sendJson(response, 201, mapList(rows[0], []));
  }

  const listMatch = url.pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (request.method === "PATCH" && listMatch) {
    const listId = listMatch[1];
    const body = await readJson(request);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(response, 400, { error: "Название списка обязательно" });
    const { rows } = await pool.query(
      `
        update word_lists
        set title = $1, icon = $2, updated_at = now()
        where id = $3 and user_id = $4
        returning *
      `,
      [title, String(body.icon || "📚").slice(0, 8), listId, user.sub]
    );
    if (!rows[0]) return sendJson(response, 404, { error: "Список не найден" });
    const data = await getWordsByList(user.sub, listId);
    return sendJson(response, 200, mapList(rows[0], data));
  }

  if (request.method === "DELETE" && listMatch) {
    const listId = listMatch[1];
    const { rowCount } = await pool.query("delete from word_lists where id = $1 and user_id = $2", [listId, user.sub]);
    return sendJson(response, rowCount ? 200 : 404, rowCount ? { ok: true } : { error: "Список не найден" });
  }

  const listWordMatch = url.pathname.match(/^\/api\/lists\/([^/]+)\/words$/);
  if (request.method === "POST" && listWordMatch) {
    const listId = listWordMatch[1];
    if (!(await ownsList(user.sub, listId))) return sendJson(response, 404, { error: "Список не найден" });
    const body = await readJson(request);
    const ru = String(body.ru || "").trim();
    const es = String(body.es || "").trim();
    if (!ru || !es) return sendJson(response, 400, { error: "Нужны русский и испанский тексты" });
    const { rows } = await pool.query(
      "insert into words (id, list_id, ru, es, ru_pronunciation, es_pronunciation) values ($1, $2, $3, $4, $5, $6) returning *",
      [randomUUID(), listId, ru, es, String(body.ruPronunciation || ""), String(body.esPronunciation || "")]
    );
    await pool.query("update word_lists set updated_at = now() where id = $1", [listId]);
    return sendJson(response, 201, mapWord(rows[0]));
  }

  const wordMatch = url.pathname.match(/^\/api\/words\/([^/]+)$/);
  if (request.method === "PATCH" && wordMatch) {
    const wordId = wordMatch[1];
    if (!(await ownsWord(user.sub, wordId))) return sendJson(response, 404, { error: "Слово не найдено" });
    const body = await readJson(request);
    const ru = String(body.ru || "").trim();
    const es = String(body.es || "").trim();
    if (!ru || !es) return sendJson(response, 400, { error: "Нужны русский и испанский тексты" });
    const { rows } = await pool.query(
      `
        update words
        set ru = $1, es = $2, ru_pronunciation = $3, es_pronunciation = $4, updated_at = now()
        where id = $5
        returning *
      `,
      [ru, es, String(body.ruPronunciation || ""), String(body.esPronunciation || ""), wordId]
    );
    await pool.query("update word_lists set updated_at = now() where id = $1", [rows[0].list_id]);
    return sendJson(response, 200, mapWord(rows[0]));
  }

  if (request.method === "DELETE" && wordMatch) {
    const wordId = wordMatch[1];
    const { rowCount } = await pool.query(
      "delete from words where id = $1 and list_id in (select id from word_lists where user_id = $2)",
      [wordId, user.sub]
    );
    return sendJson(response, rowCount ? 200 : 404, rowCount ? { ok: true } : { error: "Слово не найдено" });
  }

  const disabledWordMatch = url.pathname.match(/^\/api\/words\/([^/]+)\/disabled$/);
  if (request.method === "POST" && disabledWordMatch) {
    const wordId = disabledWordMatch[1];
    if (!(await ownsWord(user.sub, wordId))) return sendJson(response, 404, { error: "Слово не найдено" });
    const body = await readJson(request);
    const disabled = Boolean(body.disabled);
    if (disabled) {
      await pool.query("insert into disabled_words (user_id, word_id) values ($1, $2) on conflict do nothing", [user.sub, wordId]);
    } else {
      await pool.query("delete from disabled_words where user_id = $1 and word_id = $2", [user.sub, wordId]);
      await pool.query(
        `
          update progress
          set
            mastery_written_correct = 0,
            mastery_written_wrong = 0,
            mastery_oral_correct = 0,
            mastery_oral_wrong = 0,
            updated_at = now()
          where user_id = $1 and word_id = $2
        `,
        [user.sub, wordId]
      );
    }
    return sendJson(response, 200, { wordId, disabled });
  }

  sendJson(response, 404, { error: "Не найдено" });
}

async function seedUser(userId, client = pool) {
  for (const list of seedLists) {
    const listId = randomUUID();
    await client.query("insert into word_lists (id, user_id, title, icon, color) values ($1, $2, $3, $4, $5)", [listId, userId, list.title, list.icon, list.color]);
    for (const word of list.words) {
      await client.query(
        "insert into words (id, list_id, ru, es, ru_pronunciation, es_pronunciation) values ($1, $2, $3, $4, $5, $6)",
        [randomUUID(), listId, word[0], word[1], word[2], word[3]]
      );
    }
  }
}

async function getUserData(userId) {
  const listsResult = await pool.query("select * from word_lists where user_id = $1 order by updated_at desc", [userId]);
  const wordsResult = await pool.query("select w.* from words w join word_lists l on l.id = w.list_id where l.user_id = $1 order by w.updated_at desc", [userId]);
  const progressResult = await pool.query("select * from progress where user_id = $1", [userId]);
  const disabledResult = await pool.query("select word_id from disabled_words where user_id = $1", [userId]);
  const wordsByList = new Map();
  for (const word of wordsResult.rows) {
    const items = wordsByList.get(word.list_id) ?? [];
    items.push(mapWord(word));
    wordsByList.set(word.list_id, items);
  }
  const progress = {};
  for (const item of progressResult.rows) {
    progress[item.word_id] = {
      wordId: item.word_id,
      knownCount: item.known_count,
      unknownCount: item.unknown_count,
      correctCount: item.correct_count,
      wrongCount: item.wrong_count,
      masteryWrittenCorrect: item.mastery_written_correct,
      masteryWrittenWrong: item.mastery_written_wrong,
      masteryOralCorrect: item.mastery_oral_correct,
      masteryOralWrong: item.mastery_oral_wrong,
      lastResult: item.last_result,
      activityDates: Array.isArray(item.activity_dates) ? item.activity_dates : [],
      updatedAt: item.updated_at,
    };
  }
  return {
    lists: listsResult.rows.map((list) => mapList(list, wordsByList.get(list.id) ?? [])),
    progress,
    disabledWordIds: disabledResult.rows.map((item) => item.word_id),
  };
}

async function getWordsByList(userId, listId) {
  const { rows } = await pool.query(
    `
      select w.*
      from words w
      join word_lists l on l.id = w.list_id
      where l.user_id = $1 and l.id = $2
      order by w.updated_at desc
    `,
    [userId, listId]
  );
  return rows.map(mapWord);
}

async function ownsList(userId, listId) {
  const { rowCount } = await pool.query("select 1 from word_lists where id = $1 and user_id = $2", [listId, userId]);
  return rowCount > 0;
}

async function ownsWord(userId, wordId) {
  const { rowCount } = await pool.query(
    "select 1 from words w join word_lists l on l.id = w.list_id where w.id = $1 and l.user_id = $2",
    [wordId, userId]
  );
  return rowCount > 0;
}

async function disableMasteredWord(userId, wordId) {
  const { rows } = await pool.query(
    `
      select
        mastery_written_correct - mastery_written_wrong as written_gap,
        mastery_oral_correct - mastery_oral_wrong as oral_gap
      from progress
      where user_id = $1 and word_id = $2
    `,
    [userId, wordId]
  );
  if (Number(rows[0]?.written_gap ?? 0) >= 20 && Number(rows[0]?.oral_gap ?? 0) >= 20) {
    await pool.query("insert into disabled_words (user_id, word_id) values ($1, $2) on conflict do nothing", [userId, wordId]);
  }
}

function mapList(row, words) {
  return { id: row.id, title: row.title, icon: row.icon, color: row.color, updatedAt: row.updated_at, words };
}

function mapWord(row) {
  return {
    id: row.id,
    listId: row.list_id,
    ru: row.ru,
    es: row.es,
    ruPronunciation: row.ru_pronunciation,
    esPronunciation: row.es_pronunciation,
    updatedAt: row.updated_at,
  };
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }));
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireUser(request, response) {
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) {
    sendJson(response, 401, { error: "Нужно войти" });
    return null;
  }
  return payload;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function serveStatic(pathname, response) {
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const requested = clean === "/" ? "/index.html" : clean;
  const filePath = join(publicDir, requested);
  const fallback = join(publicDir, "index.html");
  const finalPath = existsSync(filePath) ? filePath : fallback;
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json"
  };
  response.writeHead(200, { "Content-Type": types[extname(finalPath)] || "application/octet-stream" });
  createReadStream(finalPath).pipe(response);
}

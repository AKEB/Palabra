import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Word = {
  id: string;
  listId: string;
  ru: string;
  es: string;
  esPronunciation?: string;
  updatedAt?: string;
};

type WordList = {
  id: string;
  title: string;
  icon: string;
  color: string;
  updatedAt?: string;
  words: Word[];
};

type Progress = {
  wordId: string;
  knownCount: number;
  unknownCount: number;
  correctCount: number;
  wrongCount: number;
  masteryWrittenCorrect?: number;
  masteryWrittenWrong?: number;
  masteryOralCorrect?: number;
  masteryOralWrong?: number;
  lastResult?: string;
  activityDates?: string[];
  updatedAt: string;
};

type PracticeKind = "oral" | "written-es" | "ignored";

type ProgressEvent = {
  id: string;
  wordId: string;
  result: "known" | "unknown" | "correct" | "wrong";
  practiceKind?: PracticeKind;
  createdAt: string;
};

type Mode = "flash-ru-es" | "flash-es-ru" | "type-ru-es" | "type-es-ru";
type View = "study" | "admin" | "stats";
type AuthMode = "login" | "register";

const STORE = "palabra-store";
const DB_NAME = "palabra-db";
const DB_VERSION = 1;

const MODES: Array<{ id: Mode; title: string; description: string }> = [
  { id: "flash-ru-es", title: "Карточки RU -> ES", description: "Увидеть русское, вспомнить испанское" },
  { id: "flash-es-ru", title: "Карточки ES -> RU", description: "Увидеть испанское, вспомнить русский" },
  { id: "type-ru-es", title: "Письмо RU -> ES", description: "Напечатать испанский перевод" },
  { id: "type-es-ru", title: "Письмо ES -> RU", description: "Напечатать русский перевод" },
];

const sampleLists: WordList[] = [
  {
    id: "demo-food",
    title: "Еда",
    icon: "🍔",
    color: "#ff5a45",
    words: [
      { id: "demo-food-1", listId: "demo-food", ru: "яблоко", es: "la manzana", esPronunciation: "ла мансана" },
      { id: "demo-food-2", listId: "demo-food", ru: "молоко", es: "la leche", esPronunciation: "ла лече" },
      { id: "demo-food-3", listId: "demo-food", ru: "хлеб", es: "el pan", esPronunciation: "эль пан" },
      { id: "demo-food-4", listId: "demo-food", ru: "Мне нужен кофе", es: "Necesito un cafe", esPronunciation: "несесито ун кафе" },
    ],
  },
  {
    id: "demo-travel",
    title: "Путешествия",
    icon: "✈️",
    color: "#087d86",
    words: [
      { id: "demo-travel-1", listId: "demo-travel", ru: "аэропорт", es: "el aeropuerto", esPronunciation: "эль аэропуэрто" },
      { id: "demo-travel-2", listId: "demo-travel", ru: "Где вокзал?", es: "Donde esta la estacion?", esPronunciation: "донде эста ла эстасьон" },
      { id: "demo-travel-3", listId: "demo-travel", ru: "билет", es: "el billete", esPronunciation: "эль бийете" },
    ],
  },
];

function now() {
  return new Date().toISOString();
}

function dateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ");
}

function escapeCsvField(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function wordsToCsv(words: Word[]) {
  const rows = [
    ["ru", "es", "esPronunciation"],
    ...words.map((word) => [word.ru, word.es, word.esPronunciation ?? ""]),
  ];
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((item) => item.some((value) => value.trim()));
}

function csvRowsToWordDrafts(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const first = rows[0]?.map((value) => value.trim().toLowerCase());
  const hasHeader = first?.[0] === "ru" && first?.[1] === "es";
  const esPronunciationIndex = hasHeader && first ? first.indexOf("espronunciation") : -1;
  return rows.slice(hasHeader ? 1 : 0)
    .map((row) => ({
      ru: (row[0] ?? "").trim(),
      es: (row[1] ?? "").trim(),
      esPronunciation: (row[esPronunciationIndex >= 0 ? esPronunciationIndex : row.length >= 4 ? 3 : 2] ?? "").trim(),
    }))
    .filter((item) => item.ru && item.es);
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "") || "palabra-list";
}

function mergeProgress(local: Record<string, Progress>, remote: Record<string, Progress>) {
  const merged = { ...local };
  for (const [wordId, remoteItem] of Object.entries(remote)) {
    const localItem = merged[wordId];
    if (!localItem || new Date(remoteItem.updatedAt).getTime() >= new Date(localItem.updatedAt).getTime()) {
      merged[wordId] = remoteItem;
    }
  }
  return merged;
}

function applyEventsToProgress(progress: Record<string, Progress>, events: ProgressEvent[]) {
  const next = { ...progress };
  for (const event of events) {
    const current = next[event.wordId] ?? {
      wordId: event.wordId,
      knownCount: 0,
      unknownCount: 0,
      correctCount: 0,
      wrongCount: 0,
      masteryWrittenCorrect: 0,
      masteryWrittenWrong: 0,
      masteryOralCorrect: 0,
      masteryOralWrong: 0,
      updatedAt: event.createdAt,
    };
    next[event.wordId] = {
      ...current,
      knownCount: current.knownCount + (event.result === "known" ? 1 : 0),
      unknownCount: current.unknownCount + (event.result === "unknown" ? 1 : 0),
      correctCount: current.correctCount + (event.result === "correct" ? 1 : 0),
      wrongCount: current.wrongCount + (event.result === "wrong" ? 1 : 0),
      masteryWrittenCorrect: (current.masteryWrittenCorrect ?? 0) + (event.practiceKind === "written-es" && event.result === "correct" ? 1 : 0),
      masteryWrittenWrong: (current.masteryWrittenWrong ?? 0) + (event.practiceKind === "written-es" && event.result === "wrong" ? 1 : 0),
      masteryOralCorrect: (current.masteryOralCorrect ?? 0) + (event.practiceKind === "oral" && event.result === "known" ? 1 : 0),
      masteryOralWrong: (current.masteryOralWrong ?? 0) + (event.practiceKind === "oral" && event.result === "unknown" ? 1 : 0),
      lastResult: event.result,
      activityDates: Array.from(new Set([...(current.activityDates ?? []), dateKey(new Date(event.createdAt))])),
      updatedAt: event.createdAt,
    };
  }
  return next;
}

function getActivityDays(progress: Record<string, Progress>) {
  return Array.from(new Set(Object.values(progress).flatMap((item) => item.activityDates ?? [dateKey(new Date(item.updatedAt))]))).sort();
}

function getCurrentStreak(days: string[]) {
  const active = new Set(days);
  let cursor = new Date();
  let streak = 0;
  while (active.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function correctTotal(item?: Progress) {
  return (item?.knownCount ?? 0) + (item?.correctCount ?? 0);
}

function wrongTotal(item?: Progress) {
  return (item?.unknownCount ?? 0) + (item?.wrongCount ?? 0);
}

function progressGap(item?: Progress) {
  return correctTotal(item) - wrongTotal(item);
}

function weightedStudyOrder(words: Word[], progress: Record<string, Progress>) {
  if (!words.length) return [];
  const gaps = words.map((word) => progressGap(progress[word.id]));
  const strongestGap = Math.max(...gaps, 0);
  return words
    .map((word) => {
      const weakPriority = Math.min(40, strongestGap - progressGap(progress[word.id]));
      const weight = 1 + weakPriority;
      return {
        id: word.id,
        priority: Math.log(Math.random()) / weight,
      };
    })
    .sort((left, right) => right.priority - left.priority)
    .map((item) => item.id);
}

function getPracticeKind(mode: Mode): PracticeKind {
  if (mode === "type-ru-es") return "written-es";
  if (mode === "flash-ru-es" || mode === "flash-es-ru") return "oral";
  return "ignored";
}

function isMasteredForAutoDisable(item?: Progress) {
  const writtenGap = (item?.masteryWrittenCorrect ?? 0) - (item?.masteryWrittenWrong ?? 0);
  const oralGap = (item?.masteryOralCorrect ?? 0) - (item?.masteryOralWrong ?? 0);
  return writtenGap >= 20 && oralGap >= 20;
}

function resetMasteryCounters(item: Progress): Progress {
  return {
    ...item,
    masteryWrittenCorrect: 0,
    masteryWrittenWrong: 0,
    masteryOralCorrect: 0,
    masteryOralWrong: 0,
    updatedAt: now(),
  };
}

function userCacheKey(email: string, key: string) {
  return `user:${email.trim().toLowerCase() || "anonymous"}:${key}`;
}

function createDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet<T>(key: string, fallback: T): Promise<T> {
  const db = await createDb();
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readonly");
    const request = tx.objectStore("kv").get(key);
    request.onsuccess = () => resolve((request.result as T) ?? fallback);
    request.onerror = () => resolve(fallback);
  });
}

async function dbSet<T>(key: string, value: T): Promise<void> {
  const db = await createDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data as T;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("palabra-token") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("palabra-email") || "");
  const [lists, setLists] = useState<WordList[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [queue, setQueue] = useState<ProgressEvent[]>([]);
  const [disabledWordIds, setDisabledWordIds] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("flash-ru-es");
  const [view, setView] = useState<View>("study");
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    const hydrate = async () => {
      const cachedLists = await dbGet<WordList[]>(userCacheKey(email, "lists"), []);
      const cachedProgress = await dbGet<Record<string, Progress>>(userCacheKey(email, "progress"), {});
      const cachedQueue = await dbGet<ProgressEvent[]>(userCacheKey(email, "queue"), []);
      const cachedDisabledWordIds = await dbGet<string[]>(userCacheKey(email, "disabledWordIds"), []);
      const cachedSelectedLists = await dbGet<string[]>(userCacheKey(email, "selectedLists"), []);
      setLists(cachedLists.length ? cachedLists : sampleLists);
      const availableLists = cachedLists.length ? cachedLists : sampleLists;
      const validSelectedLists = cachedSelectedLists.filter((id) => availableLists.some((list) => list.id === id));
      setSelectedLists(validSelectedLists.length ? validSelectedLists : availableLists.slice(0, 1).map((item) => item.id));
      setProgress(cachedProgress);
      setQueue(cachedQueue);
      setDisabledWordIds(cachedDisabledWordIds);
    };
    hydrate();
  }, [token, email]);

  useEffect(() => {
    const setOn = () => setOnline(true);
    const setOff = () => setOnline(false);
    window.addEventListener("online", setOn);
    window.addEventListener("offline", setOff);
    return () => {
      window.removeEventListener("online", setOn);
      window.removeEventListener("offline", setOff);
    };
  }, []);

  useEffect(() => {
    if (token && email && online) sync();
  }, [token, email, online]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  async function persistLists(next: WordList[]) {
    setLists(next);
    await dbSet(userCacheKey(email, "lists"), next);
  }

  async function persistProgress(next: Record<string, Progress>) {
    setProgress(next);
    await dbSet(userCacheKey(email, "progress"), next);
  }

  async function persistQueue(next: ProgressEvent[]) {
    setQueue(next);
    await dbSet(userCacheKey(email, "queue"), next);
  }

  async function persistDisabledWordIds(next: string[]) {
    setDisabledWordIds(next);
    await dbSet(userCacheKey(email, "disabledWordIds"), next);
  }

  async function sync(eventsOverride?: ProgressEvent[]) {
    if (!token || !email || !navigator.onLine) return;
    setSyncing(true);
    setNotice("");
    try {
      const previousLists = lists;
      const pending = eventsOverride ?? await dbGet<ProgressEvent[]>(userCacheKey(email, "queue"), queue);
      if (pending.length) {
        await api("/api/sync/progress", token, { method: "POST", body: JSON.stringify({ events: pending }) });
        await persistQueue([]);
      }
      const data = await api<{ lists: WordList[]; progress: Record<string, Progress>; disabledWordIds: string[]; email: string }>("/api/sync", token);
      await persistLists(data.lists);
      await persistProgress(mergeProgress(await dbGet<Record<string, Progress>>(userCacheKey(email, "progress"), progress), data.progress));
      await persistDisabledWordIds(data.disabledWordIds ?? []);
      setEmail(data.email);
      localStorage.setItem("palabra-email", data.email);
      setSelectedLists((current) => {
        const validSelected = current.filter((id) => data.lists.some((list) => list.id === id));
        const selectedTitles = previousLists.filter((list) => current.includes(list.id)).map((list) => list.title);
        const titleMatched = data.lists.filter((list) => selectedTitles.includes(list.title)).map((list) => list.id);
        const nextSelected = validSelected.length ? validSelected : titleMatched.length ? titleMatched : data.lists.slice(0, 1).map((list) => list.id);
        dbSet(userCacheKey(data.email, "selectedLists"), nextSelected).catch(() => undefined);
        return nextSelected;
      });
      setNotice("Синхронизировано");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Синхронизация не удалась");
    } finally {
      setSyncing(false);
    }
  }

  async function mark(wordId: string, result: ProgressEvent["result"], practiceKind: PracticeKind) {
    const event: ProgressEvent = { id: uid("event"), wordId, result, practiceKind, createdAt: now() };
    const nextQueue = [...queue, event];
    const nextProgress = applyEventsToProgress(progress, [event]);
    await persistProgress(nextProgress);
    if (isMasteredForAutoDisable(nextProgress[wordId]) && !disabledWordIds.includes(wordId)) {
      await persistDisabledWordIds([...disabledWordIds, wordId]);
    }
    await persistQueue(nextQueue);
    if (token && navigator.onLine) sync(nextQueue);
  }

  async function toggleWordDisabled(wordId: string, disabled: boolean) {
    const next = disabled ? Array.from(new Set([...disabledWordIds, wordId])) : disabledWordIds.filter((id) => id !== wordId);
    await api(`/api/words/${wordId}/disabled`, token, { method: "POST", body: JSON.stringify({ disabled }) });
    if (!disabled && progress[wordId]) {
      await persistProgress({ ...progress, [wordId]: resetMasteryCounters(progress[wordId]) });
    }
    await persistDisabledWordIds(next);
    setNotice(disabled ? "Слово выключено из тренировки" : "Слово возвращено в тренировку");
  }

  function signOut() {
    localStorage.removeItem("palabra-token");
    localStorage.removeItem("palabra-email");
    setToken("");
    setEmail("");
    setLists([]);
    setProgress({});
    setQueue([]);
    setDisabledWordIds([]);
    setSelectedLists([]);
    setView("study");
    setNotice("");
  }

  if (!token) {
    return <AuthScreen setToken={setToken} setEmail={setEmail} online={online} />;
  }

  return (
    <div className="shell">
      <Sidebar view={view} setView={setView} email={email} signOut={signOut} online={online} syncing={syncing} />
      <main className="workspace">
        <Topbar online={online} syncing={syncing} sync={sync} notice={notice} signOut={signOut} />
        {view === "study" && (
          <Study
            lists={lists}
            selectedLists={selectedLists}
            setSelectedLists={setSelectedLists}
            mode={mode}
            setMode={setMode}
            progress={progress}
            disabledWordIds={disabledWordIds}
            mark={mark}
          />
        )}
        {view === "admin" && (
          <Admin
            lists={lists}
            token={token}
            online={online}
            progress={progress}
            disabledWordIds={disabledWordIds}
            persistLists={persistLists}
            toggleWordDisabled={toggleWordDisabled}
            setNotice={setNotice}
          />
        )}
        {view === "stats" && <Stats lists={lists} progress={progress} queue={queue} />}
      </main>
      <MobileNav view={view} setView={setView} />
    </div>
  );
}

function AuthScreen({ setToken, setEmail, online }: { setToken: (token: string) => void; setEmail: (email: string) => void; online: boolean }) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!online) {
      setError("Вход и регистрация доступны только онлайн");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; email: string }>(`/api/auth/${authMode}`, undefined, {
        method: "POST",
        body: JSON.stringify({ email: emailValue, password }),
      });
      localStorage.setItem("palabra-token", data.token);
      localStorage.setItem("palabra-email", data.email);
      setToken(data.token);
      setEmail(data.email);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-row">
          <AppIcon />
          <div>
            <h1>Palabra</h1>
            <p>Испанские слова, которые остаются в памяти.</p>
          </div>
        </div>
        <div className="auth-tabs" role="tablist">
          <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Вход</button>
          <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Регистрация</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={emailValue} onChange={(event) => setEmailValue(event.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} placeholder="Минимум 6 символов" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary wide" disabled={loading}>{loading ? "Подождите..." : authMode === "login" ? "Войти" : "Создать аккаунт"}</button>
        </form>
      </section>
    </main>
  );
}

function Study({ lists, selectedLists, setSelectedLists, mode, setMode, progress, disabledWordIds, mark }: {
  lists: WordList[];
  selectedLists: string[];
  setSelectedLists: (ids: string[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  progress: Record<string, Progress>;
  disabledWordIds: string[];
  mark: (wordId: string, result: ProgressEvent["result"], practiceKind: PracticeKind) => Promise<void>;
}) {
  const disabledWords = useMemo(() => new Set(disabledWordIds), [disabledWordIds]);
  const selectedAllWords = useMemo(() => lists.filter((list) => selectedLists.includes(list.id)).flatMap((list) => list.words), [lists, selectedLists]);
  const words = useMemo(() => selectedAllWords.filter((word) => !disabledWords.has(word.id)), [selectedAllWords, disabledWords]);
  const wordIdsKey = useMemo(() => words.map((word) => word.id).sort().join("|"), [words]);
  const [session, setSession] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [needsAcknowledge, setNeedsAcknowledge] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const touchStart = useRef<number | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const modePickerRef = useRef<HTMLDivElement | null>(null);

  function restartSession() {
    const ids = weightedStudyOrder(words, progress);
    setSession(ids);
    setCurrentId(ids[0] ?? "");
    setFlipped(false);
    setAnswer("");
    setFeedback("");
    setNeedsAcknowledge(false);
  }

  useEffect(() => {
    restartSession();
  }, [wordIdsKey, mode]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!modePickerRef.current?.contains(event.target as Node)) setModeMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setModeMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modeMenuOpen]);

  const current = words.find((word) => word.id === currentId);
  const currentIndex = session.indexOf(currentId);
  const done = words.length ? words.length - session.length : 0;
  const selectedWordIds = new Set(selectedAllWords.map((word) => word.id));
  const selectedProgress = Object.values(progress).filter((item) => selectedWordIds.has(item.wordId));
  const learnedTotal = selectedProgress.filter((item) => correctTotal(item) > 0).length;
  const activityDays = getActivityDays(progress);
  const streak = getCurrentStreak(activityDays);
  const dailyGoal = Math.min(30, words.length);
  const today = dateKey();
  const dailyDone = Math.min(dailyGoal, selectedProgress.filter((item) => item.activityDates?.includes(today)).length);
  const currentMode = MODES.find((item) => item.id === mode)!;
  const typeMode = mode.startsWith("type");
  const practiceKind = getPracticeKind(mode);

  function nextKnown() {
    if (!current) return;
    mark(current.id, typeMode ? "correct" : "known", practiceKind);
    const next = session.filter((id) => id !== current.id);
    setSession(next);
    setCurrentId(next[0] ?? "");
    setFlipped(false);
    setAnswer("");
    setFeedback("");
    setNeedsAcknowledge(false);
  }

  function nextUnknown() {
    if (!current) return;
    mark(current.id, typeMode ? "wrong" : "unknown", practiceKind);
    const others = session.filter((id) => id !== current.id);
    const retryWindow = Math.min(5, others.length);
    const index = retryWindow ? 1 + Math.floor(Math.random() * retryWindow) : 0;
    const next = [...others.slice(0, index), current.id, ...others.slice(index)];
    setSession(next);
    setCurrentId(next[0] ?? current.id);
    setFlipped(false);
    setAnswer("");
    setFeedback("");
    setNeedsAcknowledge(false);
  }

  function checkAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    const expected = mode === "type-ru-es" ? current.es : current.ru;
    if (normalizeAnswer(answer) === normalizeAnswer(expected)) {
      setFeedback(`Верно: ${expected}`);
      window.setTimeout(nextKnown, 450);
    } else {
      setFeedback(`Пока нет. Правильно: ${expected}`);
      setNeedsAcknowledge(true);
    }
  }

  function insertAccent(char: string) {
    const input = answerInputRef.current;
    if (!input) {
      setAnswer((value) => `${value}${char}`);
      return;
    }
    const start = input.selectionStart ?? answer.length;
    const end = input.selectionEnd ?? answer.length;
    const next = `${answer.slice(0, start)}${char}${answer.slice(end)}`;
    setAnswer(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + char.length, start + char.length);
    });
  }

  function toggleList(id: string) {
    const next = selectedLists.includes(id) ? selectedLists.filter((item) => item !== id) : [...selectedLists, id];
    const nextSelected = next.length ? next : [id];
    setSelectedLists(nextSelected);
    dbSet(userCacheKey(localStorage.getItem("palabra-email") || "", "selectedLists"), nextSelected).catch(() => undefined);
  }

  return (
    <section className="study-grid">
      <div className="study-main">
        <div className="section-head">
          <div>
            <p className="eyebrow">Тренировка</p>
            <h2>{currentMode.title}</h2>
          </div>
          <div className="mode-picker" ref={modePickerRef}>
            <button className="mode-trigger" type="button" onClick={() => setModeMenuOpen((open) => !open)} aria-expanded={modeMenuOpen}>
              <span>{currentMode.title}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {modeMenuOpen && (
              <div className="mode-menu">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === mode ? "active" : ""}
                    onClick={() => {
                      setMode(item.id);
                      setModeMenuOpen(false);
                    }}
                  >
                    <b>{item.title}</b>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="list-strip">
          {lists.map((list) => (
            <button key={list.id} className={selectedLists.includes(list.id) ? "chip active" : "chip"} onClick={() => toggleList(list.id)}>
              <span>{list.icon}</span>{list.title}<small>{list.words.filter((word) => !disabledWords.has(word.id)).length} / {list.words.length}</small>
            </button>
          ))}
        </div>
        <div className="progress-line">
          <span>{done} / {words.length}</span>
          <div><i style={{ width: `${words.length ? (done / words.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="mobile-goal-card">
          <GoalCard streak={streak} learned={learnedTotal} done={dailyDone} goal={dailyGoal} />
        </div>
        {!current && (
          <div className="empty-state">
            <h3>{selectedAllWords.length && !words.length ? "Все слова выключены" : "Сессия закончена"}</h3>
            <p>{selectedAllWords.length && !words.length ? "Включите слова в админке или добавьте новые в выбранные списки." : "Вы прошли выбранные списки. Смените режим или список, чтобы продолжить."}</p>
            {!!words.length && <button className="primary restart-button" type="button" onClick={restartSession}>Запустить еще раз</button>}
          </div>
        )}
        {current && !typeMode && (
          <>
            <button
              className={`flip-card ${flipped ? "flipped" : ""}`}
              onClick={() => setFlipped(!flipped)}
              onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
              onTouchEnd={(event) => {
                if (touchStart.current === null) return;
                if (!flipped) {
                  touchStart.current = null;
                  return;
                }
                const delta = event.changedTouches[0].clientX - touchStart.current;
                if (delta < -70) nextUnknown();
                if (delta > 70) nextKnown();
                touchStart.current = null;
              }}
            >
              <span className="card-counter">{currentIndex + 1} / {session.length}</span>
              <span className="card-word">{!flipped ? (mode === "flash-ru-es" ? current.ru : current.es) : (mode === "flash-ru-es" ? current.es : current.ru)}</span>
              {flipped && mode === "flash-ru-es" && current.esPronunciation && <span className="pronunciation">{current.esPronunciation}</span>}
              <span className="hint">Нажмите, чтобы перевернуть</span>
            </button>
            {flipped && (
              <div className="actions">
                <button className="danger" onClick={nextUnknown}>× Не знаю</button>
                <button className="primary" onClick={nextKnown}>✓ Знаю</button>
              </div>
            )}
          </>
        )}
        {current && typeMode && (
          <form className="typing-card" onSubmit={checkAnswer}>
            <p>{mode === "type-ru-es" ? "Как будет на испанском?" : "Как будет по-русски?"}</p>
            <h3>{mode === "type-ru-es" ? current.ru : current.es}</h3>
            <input ref={answerInputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} autoFocus placeholder="Введите ответ" disabled={needsAcknowledge} />
            {feedback && <div className={feedback.startsWith("Верно") ? "feedback ok" : "feedback bad"}>{feedback}</div>}
            {!needsAcknowledge && <button className="primary wide">Проверить</button>}
            {needsAcknowledge && <button className="primary wide" type="button" onClick={nextUnknown}>Понял</button>}
            <div className="accent-keys" aria-label="Испанские символы">
              {["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"].map((char) => (
                <button key={char} type="button" onClick={() => insertAccent(char)} aria-label={`Вставить ${char}`} disabled={needsAcknowledge}>
                  {char}
                </button>
              ))}
            </div>
          </form>
        )}
      </div>
      <aside className="study-side">
        <GoalCard streak={streak} learned={learnedTotal} done={dailyDone} goal={dailyGoal} />
        <h3>Сегодня</h3>
        <Metric label="Активных слов" value={String(words.length)} />
        <Metric label="Осталось" value={String(session.length)} />
        <Metric label="Очередь ошибок" value={String(Object.values(progress).filter((item) => item.lastResult === "unknown" || item.lastResult === "wrong").length)} />
      </aside>
    </section>
  );
}

function GoalCard({ streak, learned, done, goal }: { streak: number; learned: number; done: number; goal: number }) {
  const progress = goal ? Math.min(100, (done / goal) * 100) : 0;
  return (
    <div className="goal-card">
      <div className="goal-top">
        <div className="goal-number">
          <span>🔥</span>
          <b>{streak}</b>
          <small>дней<br />серия</small>
        </div>
        <div className="goal-number">
          <b>{learned}</b>
          <small>слов выучено</small>
        </div>
      </div>
      <div className="goal-divider" />
      <div className="goal-row">
        <span>Цель на сегодня</span>
        <b>{done} / {goal}</b>
      </div>
      <div className="goal-progress">
        <i style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function Admin({ lists, token, online, progress, disabledWordIds, persistLists, toggleWordDisabled, setNotice }: {
  lists: WordList[];
  token: string;
  online: boolean;
  progress: Record<string, Progress>;
  disabledWordIds: string[];
  persistLists: (lists: WordList[]) => Promise<void>;
  toggleWordDisabled: (wordId: string, disabled: boolean) => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [activeListId, setActiveListId] = useState(lists[0]?.id ?? "");
  const [draftList, setDraftList] = useState({ title: "", icon: "📚", color: "#087d86" });
  const [listEdit, setListEdit] = useState({ title: "", icon: "📚" });
  const [word, setWord] = useState({ ru: "", es: "", esPronunciation: "" });
  const [editingWordId, setEditingWordId] = useState("");
  const [wordEdit, setWordEdit] = useState({ ru: "", es: "", esPronunciation: "" });
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const active = lists.find((list) => list.id === activeListId) ?? lists[0];
  const disabledWords = new Set(disabledWordIds);

  useEffect(() => {
    if (!activeListId && lists[0]) setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  useEffect(() => {
    if (active) setListEdit({ title: active.title, icon: active.icon });
    setConfirmDeleteList(false);
  }, [active?.id, active?.title, active?.icon]);

  async function saveList(event: React.FormEvent) {
    event.preventDefault();
    if (!online) return;
    const created = await api<WordList>("/api/lists", token, { method: "POST", body: JSON.stringify(draftList) });
    await persistLists([...lists, created]);
    setDraftList({ title: "", icon: "📚", color: "#087d86" });
    setActiveListId(created.id);
    setNotice("Список создан");
  }

  async function updateList(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active) return;
    const updated = await api<WordList>(`/api/lists/${active.id}`, token, { method: "PATCH", body: JSON.stringify(listEdit) });
    await persistLists(lists.map((list) => list.id === active.id ? { ...updated, words: list.words } : list));
    setNotice("Список обновлен");
  }

  async function deleteList() {
    if (!online || !active) return;
    await api(`/api/lists/${active.id}`, token, { method: "DELETE" });
    const nextLists = lists.filter((list) => list.id !== active.id);
    await persistLists(nextLists);
    setActiveListId(nextLists[0]?.id ?? "");
    setConfirmDeleteList(false);
    setNotice("Список удален");
  }

  function exportActiveList() {
    if (!active) return;
    downloadTextFile(`${safeFilename(active.title)}.csv`, wordsToCsv(active.words));
    setNotice("CSV скачан");
  }

  async function importWordsFromCsv(file: File) {
    if (!online || !active) return;
    const drafts = csvRowsToWordDrafts(await file.text());
    if (!drafts.length) {
      setNotice("В CSV не нашлось слов для импорта");
      return;
    }
    const created: Word[] = [];
    for (let index = 0; index < drafts.length; index += 10) {
      const batch = drafts.slice(index, index + 10);
      const wordsBatch = await Promise.all(batch.map((item) => (
        api<Word>(`/api/lists/${active.id}/words`, token, { method: "POST", body: JSON.stringify(item) })
      )));
      created.push(...wordsBatch);
    }
    await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: [...list.words, ...created] } : list));
    setNotice(`Импортировано слов: ${created.length}`);
  }

  async function saveWord(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active) return;
    const created = await api<Word>(`/api/lists/${active.id}/words`, token, { method: "POST", body: JSON.stringify(word) });
    await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: [...list.words, created] } : list));
    setWord({ ru: "", es: "", esPronunciation: "" });
    setNotice("Слово добавлено");
  }

  function startWordEdit(item: Word) {
    setEditingWordId(item.id);
    setWordEdit({
      ru: item.ru,
      es: item.es,
      esPronunciation: item.esPronunciation ?? "",
    });
  }

  function cancelWordEdit() {
    setEditingWordId("");
    setWordEdit({ ru: "", es: "", esPronunciation: "" });
  }

  async function updateWord(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active || !editingWordId) return;
    const updated = await api<Word>(`/api/words/${editingWordId}`, token, { method: "PATCH", body: JSON.stringify(wordEdit) });
    await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: list.words.map((item) => item.id === updated.id ? updated : item) } : list));
    cancelWordEdit();
    setNotice("Слово обновлено");
  }

  async function deleteWord(wordId: string) {
    if (!online || !active) return;
    await api(`/api/words/${wordId}`, token, { method: "DELETE" });
    await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: list.words.filter((item) => item.id !== wordId) } : list));
  }

  return (
    <section className="admin-layout">
      <div className="section-head">
        <div>
          <p className="eyebrow">Админка</p>
          <h2>Списки слов</h2>
        </div>
      </div>
      {!online && <div className="offline-note">Админка доступна только онлайн. Тренировки продолжат работать без интернета.</div>}
      <div className="admin-grid">
        <div className="panel">
          <h3>Темы</h3>
          <div className="list-admin">
            {lists.map((list) => (
              <button key={list.id} className={active?.id === list.id ? "list-row active" : "list-row"} onClick={() => setActiveListId(list.id)}>
                <span>{list.icon}</span><b>{list.title}</b><small>{list.words.filter((item) => !disabledWords.has(item.id)).length} / {list.words.length}</small>
              </button>
            ))}
          </div>
          <form className="compact-form" onSubmit={saveList}>
            <input value={draftList.icon} onChange={(event) => setDraftList({ ...draftList, icon: event.target.value })} aria-label="Иконка" />
            <input value={draftList.title} onChange={(event) => setDraftList({ ...draftList, title: event.target.value })} placeholder="Новый список" required />
            <button className="primary" disabled={!online}>+</button>
          </form>
        </div>
        <div className="panel">
          <h3>{active ? `${active.icon} ${active.title}` : "Слова"}</h3>
          {active && (
            <div className="list-settings">
              <form className="list-edit-form" onSubmit={updateList}>
                <input value={listEdit.icon} onChange={(event) => setListEdit({ ...listEdit, icon: event.target.value })} aria-label="Иконка списка" />
                <input value={listEdit.title} onChange={(event) => setListEdit({ ...listEdit, title: event.target.value })} placeholder="Название списка" required />
                <button className="ghost" disabled={!online}>Сохранить</button>
              </form>
              <div className="list-tools">
                <button className="ghost" type="button" onClick={exportActiveList} disabled={!active?.words.length}>Экспорт CSV</button>
                <button className="ghost" type="button" onClick={() => importInputRef.current?.click()} disabled={!online || !active}>Импорт CSV</button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) importWordsFromCsv(file).catch((error) => setNotice(error instanceof Error ? error.message : "Импорт не удался"));
                  }}
                />
              </div>
              {!confirmDeleteList && (
                <button className="danger outline wide" type="button" onClick={() => setConfirmDeleteList(true)} disabled={!online}>Удалить список</button>
              )}
              {confirmDeleteList && (
                <div className="confirm-delete">
                  <p>Удалить список "{active.title}" вместе со всеми словами?</p>
                  <div>
                    <button className="danger" type="button" onClick={deleteList}>Удалить навсегда</button>
                    <button className="ghost" type="button" onClick={() => setConfirmDeleteList(false)}>Отмена</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="word-table">
            {active?.words.map((item) => {
              const itemProgress = progress[item.id];
              const disabled = disabledWords.has(item.id);
              const mastered = isMasteredForAutoDisable(itemProgress);
              const editing = editingWordId === item.id;
              return (
                <div className={disabled ? "word-row disabled" : "word-row"} key={item.id}>
                  {editing ? (
                    <form className="word-edit-form" onSubmit={updateWord}>
                      <input value={wordEdit.ru} onChange={(event) => setWordEdit({ ...wordEdit, ru: event.target.value })} placeholder="Русский текст" required />
                      <input value={wordEdit.es} onChange={(event) => setWordEdit({ ...wordEdit, es: event.target.value })} placeholder="Испанский текст" required />
                      <input value={wordEdit.esPronunciation} onChange={(event) => setWordEdit({ ...wordEdit, esPronunciation: event.target.value })} placeholder="Произношение ES" />
                      <div className="word-edit-actions">
                        <button className="primary" disabled={!online}>Сохранить</button>
                        <button className="ghost" type="button" onClick={cancelWordEdit}>Отмена</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div><b>{item.ru}</b></div>
                      <div><b>{item.es}</b><small>{item.esPronunciation}</small></div>
                      <div className="word-stats">
                        <span className="ok">✓ {correctTotal(itemProgress)}</span>
                        <span className="bad">× {wrongTotal(itemProgress)}</span>
                        {mastered && <span>30+</span>}
                      </div>
                      <label className="word-toggle">
                        <input
                          type="checkbox"
                          checked={!disabled}
                          onChange={(event) => toggleWordDisabled(item.id, !event.target.checked)}
                          disabled={!online}
                        />
                        <span>{disabled ? "Выкл" : "Вкл"}</span>
                      </label>
                      <button className="icon-button" onClick={() => startWordEdit(item)} disabled={!online} aria-label="Редактировать">✎</button>
                      <button className="icon-button" onClick={() => deleteWord(item.id)} disabled={!online} aria-label="Удалить">⌫</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <form className="panel word-form" onSubmit={saveWord}>
          <h3>Добавить слово</h3>
          <input value={word.ru} onChange={(event) => setWord({ ...word, ru: event.target.value })} placeholder="Русский текст" required />
          <input value={word.es} onChange={(event) => setWord({ ...word, es: event.target.value })} placeholder="Испанский текст" required />
          <input value={word.esPronunciation} onChange={(event) => setWord({ ...word, esPronunciation: event.target.value })} placeholder="Произношение ES, если нужно" />
          <button className="primary wide" disabled={!online || !active}>Добавить</button>
        </form>
      </div>
    </section>
  );
}

function Stats({ lists, progress, queue }: { lists: WordList[]; progress: Record<string, Progress>; queue: ProgressEvent[] }) {
  const words = lists.flatMap((list) => list.words);
  const known = Object.values(progress).filter((item) => item.knownCount + item.correctCount > 0).length;
  const difficult = Object.values(progress).filter((item) => item.unknownCount + item.wrongCount > 0).length;
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">Статистика</p>
          <h2>Прогресс</h2>
        </div>
      </div>
      <div className="stats-grid">
        <Metric label="Всего слов" value={String(words.length)} />
        <Metric label="Есть успех" value={String(known)} />
        <Metric label="Повторить" value={String(difficult)} />
        <Metric label="Ждет синхронизации" value={String(queue.length)} />
      </div>
    </section>
  );
}

function Sidebar({ view, setView, email, signOut, online, syncing }: {
  view: View;
  setView: (view: View) => void;
  email: string;
  signOut: () => void;
  online: boolean;
  syncing: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <AppIcon />
        <b>Palabra</b>
      </div>
      <nav>
        <NavButton active={view === "study"} onClick={() => setView("study")} icon="▣" label="Учить слова" />
        <NavButton active={view === "admin"} onClick={() => setView("admin")} icon="✎" label="Списки слов" />
        <NavButton active={view === "stats"} onClick={() => setView("stats")} icon="▥" label="Статистика" />
      </nav>
      <div className="sidebar-footer">
        <span className={online ? "status online" : "status"}>{syncing ? "Синхронизация" : online ? "Онлайн" : "Офлайн"}</span>
        <small>{email}</small>
        <button className="ghost" onClick={signOut}>Выйти</button>
      </div>
    </aside>
  );
}

function Topbar({ online, syncing, sync, notice, signOut }: { online: boolean; syncing: boolean; sync: () => void; notice: string; signOut: () => void }) {
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <span className="app-icon small">ñ</span>
        <b>Palabra</b>
        <button className="mobile-signout" type="button" onClick={signOut}>Выйти</button>
      </div>
      <div>
        <h1>Учить слова</h1>
        <p>Карточки, письмо и повторение до уверенного ответа.</p>
      </div>
      <div className="sync-pill">
        <span className={online ? "dot on" : "dot"} />
        {syncing ? "Синхронизация..." : notice || (online ? "Онлайн" : "Офлайн")}
        <button onClick={sync} disabled={!online || syncing} aria-label="Синхронизировать">↻</button>
      </div>
    </header>
  );
}

function MobileNav({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <nav className="mobile-nav">
      <NavButton active={view === "study"} onClick={() => setView("study")} icon="▣" label="Учить" />
      <NavButton active={view === "admin"} onClick={() => setView("admin")} icon="✎" label="Списки" />
      <NavButton active={view === "stats"} onClick={() => setView("stats")} icon="▥" label="Статистика" />
    </nav>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><b>{value}</b><span>{label}</span></div>;
}

function AppIcon() {
  return <span className="app-icon">ñ</span>;
}

createRoot(document.getElementById("root")!).render(<App />);

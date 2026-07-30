import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Word = {
  id: string;
  listId: string;
  ru: string;
  es: string;
  esPronunciation?: string;
  esAudioUrl?: string;
  hint?: string;
  updatedAt?: string;
};

type LanguageCode = "es" | "en" | "am" | "ge" | "pt" | "de" | "ar" | "it" | "zh" | "nl" | "fr" | "sr" | "sk" | "sl" | "pl" | "el";

type WordList = {
  id: string;
  title: string;
  icon: string;
  color: string;
  language?: LanguageCode;
  isGlobal?: boolean;
  userId?: string;
  ownerEmail?: string;
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
type MasteryKind = "oral" | "written";

type ProgressEvent = {
  id: string;
  wordId: string;
  result: "known" | "unknown" | "correct" | "wrong";
  practiceKind?: PracticeKind;
  createdAt: string;
};

type Mode = "flash-ru-es" | "flash-es-ru" | "type-ru-es" | "type-es-ru";
type View = "learn" | "test" | "admin" | "users" | "stats";
type AuthMode = "login" | "register";

type AuthUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt?: string;
};

type ManagedUser = AuthUser;

type LanguageInfo = {
  code: LanguageCode;
  pair: string;
  short: string;
  name: string;
  adjective: string;
  htmlLang: string;
  keys: string[];
};

const STORE = "palabra-store";
const DB_NAME = "palabra-db";
const DB_VERSION = 1;
const SESSION_WORST_COUNT = 20;
const SESSION_BEST_COUNT = 10;
const SESSION_BEST_POOL = 40;
const RETRY_AFTER_WORDS = 5;
const LANGUAGE_STORAGE_KEY = "palabra-language";

const LANGUAGES: LanguageInfo[] = [
  {
    code: "es",
    pair: "RU → ES",
    short: "ES",
    name: "Испанский",
    adjective: "испанском",
    htmlLang: "es",
    keys: ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"],
  },
  {
    code: "en",
    pair: "RU → EN",
    short: "EN",
    name: "Английский",
    adjective: "английском",
    htmlLang: "en",
    keys: ["'", "’", "-"],
  },
  {
    code: "am",
    pair: "RU → AM",
    short: "AM",
    name: "Армянский",
    adjective: "армянском",
    htmlLang: "hy",
    keys: [
      "ա", "բ", "գ", "դ", "ե", "զ", "է", "ը", "թ", "ժ", "ի", "լ", "խ",
      "ծ", "կ", "հ", "ձ", "ղ", "ճ", "մ", "յ", "ն", "շ", "ո", "չ", "պ",
      "ջ", "ռ", "ս", "վ", "տ", "ր", "ց", "ու", "փ", "ք", "օ", "ֆ", "և",
    ],
  },
  {
    code: "ge",
    pair: "RU → GE",
    short: "GE",
    name: "Грузинский",
    adjective: "грузинском",
    htmlLang: "ka",
    keys: [
      "ა", "ბ", "გ", "დ", "ე", "ვ", "ზ", "თ", "ი", "კ", "ლ", "მ", "ნ",
      "ო", "პ", "ჟ", "რ", "ს", "ტ", "უ", "ფ", "ქ", "ღ", "ყ", "შ", "ჩ",
      "ც", "ძ", "წ", "ჭ", "ხ", "ჯ", "ჰ",
    ],
  },
  {
    code: "pt",
    pair: "RU → PT",
    short: "PT",
    name: "Португальский",
    adjective: "португальском",
    htmlLang: "pt",
    keys: ["á", "à", "â", "ã", "ç", "é", "ê", "í", "ó", "ô", "õ", "ú", "ü"],
  },
  {
    code: "de",
    pair: "RU → DE",
    short: "DE",
    name: "Немецкий",
    adjective: "немецком",
    htmlLang: "de",
    keys: ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"],
  },
  {
    code: "ar",
    pair: "RU → AR",
    short: "AR",
    name: "Арабский",
    adjective: "арабском",
    htmlLang: "ar",
    keys: [
      "ا", "أ", "إ", "آ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز",
      "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن",
      "ه", "و", "ي", "ة", "ى", "ء", "ئ", "ؤ", "لا", "؟", "،",
    ],
  },
  {
    code: "it",
    pair: "RU → IT",
    short: "IT",
    name: "Итальянский",
    adjective: "итальянском",
    htmlLang: "it",
    keys: ["à", "è", "é", "ì", "ò", "ù"],
  },
  {
    code: "zh",
    pair: "RU → ZH",
    short: "ZH",
    name: "Китайский",
    adjective: "китайском",
    htmlLang: "zh",
    keys: [
      "ā", "á", "ǎ", "à", "ē", "é", "ě", "è", "ī", "í", "ǐ", "ì",
      "ō", "ó", "ǒ", "ò", "ū", "ú", "ǔ", "ù", "ǖ", "ǘ", "ǚ", "ǜ", "ü",
      "、", "。", "？", "！", "，",
    ],
  },
  {
    code: "nl",
    pair: "RU → NL",
    short: "NL",
    name: "Голландский",
    adjective: "голландском",
    htmlLang: "nl",
    keys: ["á", "é", "í", "ó", "ú", "ä", "ë", "ï", "ö", "ü"],
  },
  {
    code: "fr",
    pair: "RU → FR",
    short: "FR",
    name: "Французский",
    adjective: "французском",
    htmlLang: "fr",
    keys: ["à", "â", "ä", "é", "è", "ê", "ë", "î", "ï", "ô", "ö", "ù", "û", "ü", "ç", "œ", "æ"],
  },
  {
    code: "sr",
    pair: "RU → SR",
    short: "SR",
    name: "Сербский",
    adjective: "сербском",
    htmlLang: "sr",
    keys: ["č", "ć", "đ", "š", "ž", "Č", "Ć", "Đ", "Š", "Ž"],
  },
  {
    code: "sk",
    pair: "RU → SK",
    short: "SK",
    name: "Словацкий",
    adjective: "словацком",
    htmlLang: "sk",
    keys: ["á", "ä", "č", "ď", "é", "í", "ĺ", "ľ", "ň", "ó", "ô", "ŕ", "š", "ť", "ú", "ý", "ž"],
  },
  {
    code: "sl",
    pair: "RU → SL",
    short: "SL",
    name: "Словенский",
    adjective: "словенском",
    htmlLang: "sl",
    keys: ["č", "š", "ž", "Č", "Š", "Ž", "á", "é", "í", "ó", "ú"],
  },
  {
    code: "pl",
    pair: "RU → PL",
    short: "PL",
    name: "Польский",
    adjective: "польском",
    htmlLang: "pl",
    keys: ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"],
  },
  {
    code: "el",
    pair: "RU → EL",
    short: "EL",
    name: "Греческий",
    adjective: "греческом",
    htmlLang: "el",
    keys: [
      "α", "ά", "β", "γ", "δ", "ε", "έ", "ζ", "η", "ή", "θ", "ι", "ί", "κ", "λ", "μ",
      "ν", "ξ", "ο", "ό", "π", "ρ", "σ", "ς", "τ", "υ", "ύ", "φ", "χ", "ψ", "ω", "ώ",
    ],
  },
];

function getLanguage(code?: string | null): LanguageInfo {
  return LANGUAGES.find((item) => item.code === code) ?? LANGUAGES[0];
}

function listLanguage(list: WordList): LanguageCode {
  return getLanguage(list.language).code;
}

function modesFor(language: LanguageInfo): Array<{ id: Mode; title: string; description: string }> {
  const code = language.short;
  return [
    { id: "flash-ru-es", title: `Карточки RU → ${code}`, description: `Увидеть русское, вспомнить ${language.name.toLowerCase()}` },
    { id: "flash-es-ru", title: `Карточки ${code} → RU`, description: `Увидеть ${language.name.toLowerCase()}, вспомнить русский` },
    { id: "type-ru-es", title: `Письмо RU → ${code}`, description: `Напечатать перевод на ${language.adjective}` },
    { id: "type-es-ru", title: `Письмо ${code} → RU`, description: "Напечатать русский перевод" },
  ];
}

function localAudioUrl(url?: string) {
  const match = url?.match(/^https:\/\/flashcardo\.com\/audio\/([^/]+)\/([^/?#]+\.mp3)$/);
  return match ? `/audio/flashcardo/${match[1]}/${match[2]}` : url || "";
}

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
    ["ru", "es", "esPronunciation", "hint"],
    ...words.map((word) => [word.ru, word.es, word.esPronunciation ?? "", word.hint ?? ""]),
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
  const hintIndex = hasHeader && first ? first.indexOf("hint") : -1;
  return rows.slice(hasHeader ? 1 : 0)
    .map((row) => ({
      ru: (row[0] ?? "").trim(),
      es: (row[1] ?? "").trim(),
      esPronunciation: (row[esPronunciationIndex >= 0 ? esPronunciationIndex : row.length >= 4 ? 3 : 2] ?? "").trim(),
      hint: (hintIndex >= 0 ? row[hintIndex] ?? "" : "").trim(),
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

function practiceMasteryCorrect(item: Progress | undefined, kind: MasteryKind) {
  return kind === "oral" ? (item?.masteryOralCorrect ?? 0) : (item?.masteryWrittenCorrect ?? 0);
}

function practiceMasteryWrong(item: Progress | undefined, kind: MasteryKind) {
  return kind === "oral" ? (item?.masteryOralWrong ?? 0) : (item?.masteryWrittenWrong ?? 0);
}

function practiceMasteryGap(item: Progress | undefined, kind: MasteryKind) {
  return practiceMasteryCorrect(item, kind) - practiceMasteryWrong(item, kind);
}

function shuffleIds(ids: string[]) {
  const next = [...ids];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function pickRandomIds(ids: string[], count: number) {
  return shuffleIds(ids).slice(0, Math.max(0, count));
}

function masteryKindForMode(mode: Mode): MasteryKind {
  return mode.startsWith("type") ? "written" : "oral";
}

function buildTestSession(words: Word[], progress: Record<string, Progress>, kind: MasteryKind) {
  if (!words.length) return [];

  const sortedWorstFirst = [...words].sort((left, right) => {
    const leftItem = progress[left.id];
    const rightItem = progress[right.id];
    const gapDiff = practiceMasteryGap(leftItem, kind) - practiceMasteryGap(rightItem, kind);
    if (gapDiff !== 0) return gapDiff;
    const wrongDiff = practiceMasteryWrong(rightItem, kind) - practiceMasteryWrong(leftItem, kind);
    if (wrongDiff !== 0) return wrongDiff;
    return practiceMasteryCorrect(leftItem, kind) - practiceMasteryCorrect(rightItem, kind);
  });

  const worst = sortedWorstFirst.slice(0, Math.min(SESSION_WORST_COUNT, sortedWorstFirst.length));
  const remaining = sortedWorstFirst.slice(worst.length);
  const sortedBestFirst = [...remaining].sort((left, right) => {
    const leftItem = progress[left.id];
    const rightItem = progress[right.id];
    const gapDiff = practiceMasteryGap(rightItem, kind) - practiceMasteryGap(leftItem, kind);
    if (gapDiff !== 0) return gapDiff;
    return practiceMasteryCorrect(rightItem, kind) - practiceMasteryCorrect(leftItem, kind);
  });

  const bestPoolSize = Math.min(sortedBestFirst.length, Math.max(SESSION_BEST_COUNT, SESSION_BEST_POOL));
  const bestPoolIds = sortedBestFirst.slice(0, bestPoolSize).map((word) => word.id);
  const bestIds = pickRandomIds(bestPoolIds, Math.min(SESSION_BEST_COUNT, bestPoolIds.length));
  const worstIds = worst.map((word) => word.id);

  return shuffleIds([...worstIds, ...bestIds]);
}

function getPracticeKind(mode: Mode): PracticeKind {
  if (mode.startsWith("type")) return "written-es";
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
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [lists, setLists] = useState<WordList[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [queue, setQueue] = useState<ProgressEvent[]>([]);
  const [disabledWordIds, setDisabledWordIds] = useState<string[]>([]);
  const [learnedWordIds, setLearnedWordIds] = useState<string[]>([]);
  const [learnSelectedLists, setLearnSelectedLists] = useState<string[]>([]);
  const [testSelectedLists, setTestSelectedLists] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("flash-ru-es");
  const [view, setView] = useState<View>("learn");
  const [languageCode, setLanguageCode] = useState<LanguageCode>(() => getLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)).code);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const language = getLanguage(languageCode);
  const languageLists = useMemo(
    () => lists.filter((list) => listLanguage(list) === languageCode),
    [lists, languageCode]
  );

  function changeLanguage(code: LanguageCode) {
    setLanguageCode(code);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    setLearnSelectedLists((current) => {
      const nextLists = lists.filter((list) => listLanguage(list) === code);
      const valid = current.filter((id) => nextLists.some((list) => list.id === id));
      const next = valid.length ? valid : nextLists.slice(0, 1).map((list) => list.id);
      dbSet(userCacheKey(email, "learnSelectedLists"), next).catch(() => undefined);
      return next;
    });
    setTestSelectedLists((current) => {
      const nextLists = lists.filter((list) => listLanguage(list) === code);
      const valid = current.filter((id) => nextLists.some((list) => list.id === id));
      const next = valid.length ? valid : nextLists.slice(0, 1).map((list) => list.id);
      dbSet(userCacheKey(email, "testSelectedLists"), next).catch(() => undefined);
      return next;
    });
  }

  useEffect(() => {
    if (!token) return;
    const hydrate = async () => {
      const cachedLists = await dbGet<WordList[]>(userCacheKey(email, "lists"), []);
      const cachedProgress = await dbGet<Record<string, Progress>>(userCacheKey(email, "progress"), {});
      const cachedQueue = await dbGet<ProgressEvent[]>(userCacheKey(email, "queue"), []);
      const cachedDisabledWordIds = await dbGet<string[]>(userCacheKey(email, "disabledWordIds"), []);
      const cachedLearnedWordIds = await dbGet<string[]>(userCacheKey(email, "learnedWordIds"), []);
      const legacySelectedLists = await dbGet<string[]>(userCacheKey(email, "selectedLists"), []);
      const cachedLearnSelectedLists = await dbGet<string[]>(userCacheKey(email, "learnSelectedLists"), legacySelectedLists);
      const cachedTestSelectedLists = await dbGet<string[]>(userCacheKey(email, "testSelectedLists"), legacySelectedLists);
      setLists(cachedLists);
      const currentLanguage = getLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)).code;
      const languageCached = cachedLists.filter((list) => listLanguage(list) === currentLanguage);
      const pickSelected = (cached: string[]) => {
        const valid = cached.filter((id) => languageCached.some((list) => list.id === id));
        return valid.length ? valid : languageCached.slice(0, 1).map((item) => item.id);
      };
      setLearnSelectedLists(pickSelected(cachedLearnSelectedLists));
      setTestSelectedLists(pickSelected(cachedTestSelectedLists));
      setProgress(cachedProgress);
      setQueue(cachedQueue);
      setDisabledWordIds(cachedDisabledWordIds);
      setLearnedWordIds(cachedLearnedWordIds);
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
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) {
      // SW cache-first breaks Vite HMR and can leave a blank screen.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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

  async function persistLearnedWordIds(next: string[]) {
    setLearnedWordIds(next);
    await dbSet(userCacheKey(email, "learnedWordIds"), next);
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
      const data = await api<{ lists: WordList[]; progress: Record<string, Progress>; disabledWordIds: string[]; learnedWordIds: string[]; email: string; user: AuthUser }>("/api/sync", token);
      await persistLists(data.lists);
      await persistProgress(mergeProgress(await dbGet<Record<string, Progress>>(userCacheKey(email, "progress"), progress), data.progress));
      await persistDisabledWordIds(data.disabledWordIds ?? []);
      const localLearned = await dbGet<string[]>(userCacheKey(email, "learnedWordIds"), learnedWordIds);
      const remoteLearned = data.learnedWordIds ?? [];
      const missingOnServer = localLearned.filter((id) => !remoteLearned.includes(id));
      for (const wordId of missingOnServer) {
        await api(`/api/words/${wordId}/learned`, token, { method: "POST", body: JSON.stringify({ learned: true }) }).catch(() => undefined);
      }
      await persistLearnedWordIds(Array.from(new Set([...localLearned, ...remoteLearned])));
      setEmail(data.email);
      setCurrentUser(data.user);
      localStorage.setItem("palabra-email", data.email);
      const currentLanguage = getLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)).code;
      const languageDataLists = data.lists.filter((list) => listLanguage(list) === currentLanguage);
      setLearnSelectedLists((current) => {
        const validSelected = current.filter((id) => languageDataLists.some((list) => list.id === id));
        const selectedTitles = previousLists
          .filter((list) => current.includes(list.id) && listLanguage(list) === currentLanguage)
          .map((list) => list.title);
        const titleMatched = languageDataLists.filter((list) => selectedTitles.includes(list.title)).map((list) => list.id);
        const nextSelected = validSelected.length ? validSelected : titleMatched.length ? titleMatched : languageDataLists.slice(0, 1).map((list) => list.id);
        dbSet(userCacheKey(data.email, "learnSelectedLists"), nextSelected).catch(() => undefined);
        return nextSelected;
      });
      setTestSelectedLists((current) => {
        const validSelected = current.filter((id) => languageDataLists.some((list) => list.id === id));
        const selectedTitles = previousLists
          .filter((list) => current.includes(list.id) && listLanguage(list) === currentLanguage)
          .map((list) => list.title);
        const titleMatched = languageDataLists.filter((list) => selectedTitles.includes(list.title)).map((list) => list.id);
        const nextSelected = validSelected.length ? validSelected : titleMatched.length ? titleMatched : languageDataLists.slice(0, 1).map((list) => list.id);
        dbSet(userCacheKey(data.email, "testSelectedLists"), nextSelected).catch(() => undefined);
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

  async function markWordLearned(wordId: string, learned = true) {
    const next = learned
      ? Array.from(new Set([...learnedWordIds, wordId]))
      : learnedWordIds.filter((id) => id !== wordId);
    await persistLearnedWordIds(next);
    if (token && navigator.onLine) {
      await api(`/api/words/${wordId}/learned`, token, { method: "POST", body: JSON.stringify({ learned }) });
    }
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
    setCurrentUser(null);
    setLists([]);
    setProgress({});
    setQueue([]);
    setDisabledWordIds([]);
    setLearnedWordIds([]);
    setLearnSelectedLists([]);
    setTestSelectedLists([]);
    setView("learn");
    setNotice("");
  }

  useEffect(() => {
    if (view === "users" && !currentUser?.isAdmin) setView("learn");
  }, [view, currentUser?.isAdmin]);

  if (!token) {
    return <AuthScreen setToken={setToken} setEmail={setEmail} setCurrentUser={setCurrentUser} online={online} />;
  }

  return (
    <div className="shell">
      <Sidebar
        view={view}
        setView={setView}
        email={email}
        currentUser={currentUser}
        signOut={signOut}
        online={online}
        syncing={syncing}
        language={language}
        setLanguage={changeLanguage}
      />
      <main className="workspace">
        <Topbar
          view={view}
          online={online}
          syncing={syncing}
          sync={sync}
          notice={notice}
          signOut={signOut}
          language={language}
          setLanguage={changeLanguage}
        />
        {view === "learn" && (
          <Learn
            lists={languageLists}
            language={language}
            selectedLists={learnSelectedLists}
            setSelectedLists={setLearnSelectedLists}
            learnedWordIds={learnedWordIds}
            markWordLearned={markWordLearned}
          />
        )}
        {view === "test" && (
          <Test
            lists={languageLists}
            language={language}
            selectedLists={testSelectedLists}
            setSelectedLists={setTestSelectedLists}
            mode={mode}
            setMode={setMode}
            progress={progress}
            disabledWordIds={disabledWordIds}
            learnedWordIds={learnedWordIds}
            mark={mark}
          />
        )}
        {view === "admin" && (
          <Admin
            lists={languageLists}
            language={language}
            token={token}
            online={online}
            currentUser={currentUser}
            sync={sync}
            progress={progress}
            disabledWordIds={disabledWordIds}
            learnedWordIds={learnedWordIds}
            persistLists={persistLists}
            toggleWordDisabled={toggleWordDisabled}
            setNotice={setNotice}
          />
        )}
        {view === "users" && currentUser?.isAdmin && (
          <UsersAdmin
            token={token}
            online={online}
            currentUser={currentUser}
            sync={sync}
            setNotice={setNotice}
          />
        )}
        {view === "stats" && <Stats lists={languageLists} progress={progress} queue={queue} learnedWordIds={learnedWordIds} />}
      </main>
      <MobileNav view={view} setView={setView} currentUser={currentUser} />
    </div>
  );
}

function AuthScreen({ setToken, setEmail, setCurrentUser, online }: {
  setToken: (token: string) => void;
  setEmail: (email: string) => void;
  setCurrentUser: (user: AuthUser | null) => void;
  online: boolean;
}) {
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
      const data = await api<{ token: string; email: string; user: AuthUser }>(`/api/auth/${authMode}`, undefined, {
        method: "POST",
        body: JSON.stringify({ email: emailValue, password }),
      });
      localStorage.setItem("palabra-token", data.token);
      localStorage.setItem("palabra-email", data.email);
      setToken(data.token);
      setEmail(data.email);
      setCurrentUser(data.user);
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
            <p>Слова на разных языках, которые остаются в памяти.</p>
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

function Learn({ lists, language, selectedLists, setSelectedLists, learnedWordIds, markWordLearned }: {
  lists: WordList[];
  language: LanguageInfo;
  selectedLists: string[];
  setSelectedLists: (ids: string[]) => void;
  learnedWordIds: string[];
  markWordLearned: (wordId: string, learned?: boolean) => Promise<void>;
}) {
  const learnedWords = useMemo(() => new Set(learnedWordIds), [learnedWordIds]);
  const selectedAllWords = useMemo(
    () => lists.filter((list) => selectedLists.includes(list.id)).flatMap((list) => list.words),
    [lists, selectedLists]
  );
  const wordsToLearn = useMemo(
    () => selectedAllWords.filter((word) => !learnedWords.has(word.id)),
    [selectedAllWords, learnedWords]
  );
  const wordIdsKey = useMemo(() => selectedAllWords.map((word) => word.id).join("|"), [selectedAllWords]);
  const [session, setSession] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [flipped, setFlipped] = useState(false);
  const touchStart = useRef<number | null>(null);
  const learnedCount = selectedAllWords.filter((word) => learnedWords.has(word.id)).length;
  const sessionTotal = selectedAllWords.length;

  function orderSession(learnedSet: Set<string>, options?: { unknownId?: string }) {
    const learned = selectedAllWords
      .filter((word) => learnedSet.has(word.id))
      .map((word) => word.id);
    let unlearned = selectedAllWords
      .filter((word) => !learnedSet.has(word.id))
      .map((word) => word.id);
    const unknownId = options?.unknownId;
    if (unknownId && unlearned.includes(unknownId)) {
      unlearned = unlearned.filter((id) => id !== unknownId);
      const index = Math.min(RETRY_AFTER_WORDS, unlearned.length);
      unlearned = [...unlearned.slice(0, index), unknownId, ...unlearned.slice(index)];
    }
    return { ids: [...learned, ...unlearned], unlearned };
  }

  function restartSession() {
    const { ids, unlearned } = orderSession(learnedWords);
    setSession(ids);
    setCurrentId(unlearned[0] ?? ids[0] ?? "");
    setFlipped(false);
  }

  useEffect(() => {
    restartSession();
  }, [wordIdsKey]);

  const current = selectedAllWords.find((word) => word.id === currentId);
  const currentLearned = Boolean(current && learnedWords.has(current.id));
  const currentIndex = Math.max(0, session.indexOf(currentId));
  const currentStep = session.length ? currentIndex + 1 : 0;

  function applySelectedLists(ids: string[]) {
    setSelectedLists(ids);
    dbSet(userCacheKey(localStorage.getItem("palabra-email") || "", "learnSelectedLists"), ids).catch(() => undefined);
  }

  function toggleList(id: string) {
    const next = selectedLists.includes(id) ? selectedLists.filter((item) => item !== id) : [...selectedLists, id];
    applySelectedLists(next.length ? next : [id]);
  }

  function goPrev() {
    if (session.length < 2) return;
    const nextIndex = currentIndex <= 0 ? session.length - 1 : currentIndex - 1;
    setCurrentId(session[nextIndex]);
    setFlipped(false);
  }

  function goNext() {
    if (session.length < 2) return;
    const nextIndex = currentIndex >= session.length - 1 ? 0 : currentIndex + 1;
    setCurrentId(session[nextIndex]);
    setFlipped(false);
  }

  function nextUnlearnedId(learnedSet: Set<string>, fallbackId: string) {
    if (!session.length) return fallbackId;
    for (let offset = 1; offset <= session.length; offset += 1) {
      const candidate = session[(currentIndex + offset) % session.length];
      if (!learnedSet.has(candidate)) return candidate;
    }
    return fallbackId;
  }

  async function onRemembered() {
    if (!current) return;
    const id = current.id;
    const learnedSet = new Set(learnedWords);
    learnedSet.add(id);
    const nextId = nextUnlearnedId(learnedSet, id);
    await markWordLearned(id, true);
    setCurrentId(nextId);
    setFlipped(false);
  }

  async function onUnknown() {
    if (!current) return;
    const id = current.id;
    if (learnedWords.has(id)) {
      await markWordLearned(id, false);
    }
    const learnedSet = new Set(learnedWords);
    learnedSet.delete(id);
    const { ids, unlearned } = orderSession(learnedSet, { unknownId: id });
    setSession(ids);
    setCurrentId(unlearned[0] ?? id);
    setFlipped(false);
  }

  return (
    <section className="study-grid">
      <div className="study-main">
        <div className="section-head">
          <div>
            <p className="eyebrow">Обучение</p>
            <h2>Запоминание слов</h2>
          </div>
        </div>
        <ListMultiselect
          lists={lists}
          selectedLists={selectedLists}
          toggleList={toggleList}
          setSelectedLists={applySelectedLists}
          countFor={(list) => list.words.filter((word) => learnedWords.has(word.id)).length}
        />
        <div className="progress-line">
          <span>{learnedCount} / {sessionTotal}</span>
          <div><i style={{ width: `${sessionTotal ? (learnedCount / sessionTotal) * 100 : 0}%` }} /></div>
        </div>
        {!current && (
          <div className="empty-state">
            <h3>Нет слов</h3>
            <p>Выберите список слов, чтобы начать обучение.</p>
          </div>
        )}
        {current && (
          <>
            <button
              className={`flip-card ${flipped ? "flipped" : ""} ${currentLearned ? "learned" : ""}`}
              onClick={() => setFlipped(!flipped)}
              onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
              onTouchEnd={(event) => {
                if (touchStart.current === null) return;
                const delta = event.changedTouches[0].clientX - touchStart.current;
                touchStart.current = null;
                if (Math.abs(delta) < 70) return;
                if (delta > 0) goPrev();
                else goNext();
              }}
            >
              <span className="card-counter">{currentStep} / {session.length}</span>
              {currentLearned && <span className="learned-badge" aria-label="Выучено">✓</span>}
              {flipped && <span className="card-prompt">{current.ru}</span>}
              <span className="card-word">{flipped ? current.es : current.ru}</span>
              {current.hint && <span className="word-hint">{current.hint}</span>}
              {flipped && current.esPronunciation && <span className="pronunciation">{current.esPronunciation}</span>}
              {flipped && current.esAudioUrl && (
                <button
                  className="audio-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    new Audio(localAudioUrl(current.esAudioUrl)).play().catch(() => undefined);
                  }}
                >
                  ▶ Произношение
                </button>
              )}
              <span className="hint">
                {currentLearned
                  ? (flipped ? "Выученное слово — можно листать дальше" : "Выучено · нажмите для перевода")
                  : (flipped ? `Запомните слово на ${language.name.toLowerCase()}` : "Нажмите для перевода, свайп для листания")}
              </span>
            </button>
            <div className="learn-nav">
              <button className="ghost" type="button" onClick={goPrev} disabled={session.length < 2}>← Назад</button>
              <button className="ghost" type="button" onClick={goNext} disabled={session.length < 2}>Вперёд →</button>
            </div>
            {flipped && (
              <div className="actions">
                <button className="danger" type="button" onClick={() => onUnknown().catch(() => undefined)}>× Не знаю</button>
                {currentLearned ? (
                  <button className="ghost learned-done" type="button" disabled>✓ Выучено</button>
                ) : (
                  <button className="primary" type="button" onClick={() => onRemembered().catch(() => undefined)}>✓ Запомнил</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <aside className="study-side">
        <h3>Обучение</h3>
        <Metric label="Выбрано слов" value={String(selectedAllWords.length)} />
        <Metric label="Уже выучено" value={String(learnedCount)} />
        <Metric label="Осталось выучить" value={String(wordsToLearn.length)} />
      </aside>
    </section>
  );
}

function Test({ lists, language, selectedLists, setSelectedLists, mode, setMode, progress, disabledWordIds, learnedWordIds, mark }: {
  lists: WordList[];
  language: LanguageInfo;
  selectedLists: string[];
  setSelectedLists: (ids: string[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  progress: Record<string, Progress>;
  disabledWordIds: string[];
  learnedWordIds: string[];
  mark: (wordId: string, result: ProgressEvent["result"], practiceKind: PracticeKind) => Promise<void>;
}) {
  const disabledWords = useMemo(() => new Set(disabledWordIds), [disabledWordIds]);
  const learnedWords = useMemo(() => new Set(learnedWordIds), [learnedWordIds]);
  const selectedAllWords = useMemo(() => lists.filter((list) => selectedLists.includes(list.id)).flatMap((list) => list.words), [lists, selectedLists]);
  const words = useMemo(
    () => selectedAllWords.filter((word) => learnedWords.has(word.id) && !disabledWords.has(word.id)),
    [selectedAllWords, learnedWords, disabledWords]
  );
  const wordIdsKey = useMemo(() => words.map((word) => word.id).sort().join("|"), [words]);
  const [session, setSession] = useState<string[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
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
    const ids = buildTestSession(words, progress, masteryKindForMode(mode));
    setSession(ids);
    setSessionTotal(ids.length);
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
    if (!needsAcknowledge) return;
    window.requestAnimationFrame(() => answerInputRef.current?.focus());
  }, [needsAcknowledge, currentId]);

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
  const done = sessionTotal ? sessionTotal - session.length : 0;
  const currentStep = current ? Math.min(sessionTotal, done + 1) : done;
  const selectedWordIds = new Set(selectedAllWords.map((word) => word.id));
  const selectedProgress = Object.values(progress).filter((item) => selectedWordIds.has(item.wordId));
  const learnedTotal = selectedAllWords.filter((word) => learnedWords.has(word.id)).length;
  const activityDays = getActivityDays(progress);
  const streak = getCurrentStreak(activityDays);
  const dailyGoal = Math.min(30, words.length || 1);
  const today = dateKey();
  const dailyDone = Math.min(dailyGoal, selectedProgress.filter((item) => item.activityDates?.includes(today)).length);
  const modes = modesFor(language);
  const currentMode = modes.find((item) => item.id === mode)!;
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

  function requeueCurrent() {
    if (!current) return;
    const others = session.filter((id) => id !== current.id);
    const index = Math.min(RETRY_AFTER_WORDS, others.length);
    const next = [...others.slice(0, index), current.id, ...others.slice(index)];
    setSession(next);
    setCurrentId(next[0] ?? current.id);
    setFlipped(false);
    setAnswer("");
    setFeedback("");
    setNeedsAcknowledge(false);
  }

  function nextUnknown() {
    if (!current) return;
    mark(current.id, typeMode ? "wrong" : "unknown", practiceKind);
    requeueCurrent();
  }

  function advanceAfterWrittenMiss() {
    requeueCurrent();
  }

  function expectedAnswers() {
    if (!current) return [] as string[];
    const expected = mode === "type-ru-es" ? current.es : current.ru;
    const accepted = [expected];
    if (mode === "type-ru-es" && (language.code === "zh" || language.code === "ar" || language.code === "el") && current.esPronunciation) {
      accepted.push(current.esPronunciation);
    }
    return accepted;
  }

  function checkAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    const accepted = expectedAnswers();
    const expected = accepted[0];
    const normalized = normalizeAnswer(answer);
    const isCorrect = accepted.some((item) => normalizeAnswer(item) === normalized);

    if (needsAcknowledge) {
      if (isCorrect) {
        setFeedback("Запомнили. Продолжаем");
        window.setTimeout(advanceAfterWrittenMiss, 350);
      } else {
        setFeedback(`Ещё раз. Правильно: ${expected}`);
        setAnswer("");
      }
      return;
    }

    if (isCorrect) {
      setFeedback(`Верно: ${expected}`);
      window.setTimeout(nextKnown, 450);
      return;
    }

    mark(current.id, "wrong", practiceKind);
    setFeedback(`Неверно. Напишите правильно: ${expected}`);
    setAnswer("");
    setNeedsAcknowledge(true);
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

  function applySelectedLists(ids: string[]) {
    setSelectedLists(ids);
    dbSet(userCacheKey(localStorage.getItem("palabra-email") || "", "testSelectedLists"), ids).catch(() => undefined);
  }

  function toggleList(id: string) {
    const next = selectedLists.includes(id) ? selectedLists.filter((item) => item !== id) : [...selectedLists, id];
    applySelectedLists(next.length ? next : [id]);
  }

  return (
    <section className="study-grid">
      <div className="study-main">
        <div className="section-head">
          <div>
            <p className="eyebrow">Тестирование</p>
            <h2>{currentMode.title}</h2>
          </div>
          <div className="mode-picker" ref={modePickerRef}>
            <button className="mode-trigger" type="button" onClick={() => setModeMenuOpen((open) => !open)} aria-expanded={modeMenuOpen}>
              <span>{currentMode.title}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {modeMenuOpen && (
              <div className="mode-menu">
                {modes.map((item) => (
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
        <ListMultiselect
          lists={lists}
          selectedLists={selectedLists}
          toggleList={toggleList}
          setSelectedLists={applySelectedLists}
          countFor={(list) => list.words.filter((word) => learnedWords.has(word.id) && !disabledWords.has(word.id)).length}
        />
        <div className="progress-line">
          <span>{done} / {sessionTotal}</span>
          <div><i style={{ width: `${sessionTotal ? (done / sessionTotal) * 100 : 0}%` }} /></div>
        </div>
        {!current && (
          <div className="empty-state">
            <h3>
              {!selectedAllWords.length
                ? "Нет слов"
                : !selectedAllWords.some((word) => learnedWords.has(word.id))
                  ? "Нет выученных слов"
                  : !words.length
                    ? "Все слова выключены"
                    : "Сессия закончена"}
            </h3>
            <p>
              {!selectedAllWords.length
                ? "Выберите список слов."
                : !selectedAllWords.some((word) => learnedWords.has(word.id))
                  ? "Сначала выучите слова в разделе Обучение. В тестирование попадают только запомненные слова."
                  : !words.length
                    ? "Включите слова в админке или выучите новые."
                    : "Вы прошли выбранные списки. Смените режим или список, чтобы продолжить."}
            </p>
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
              <span className="card-counter">{currentStep} / {sessionTotal}</span>
              {flipped && mode === "flash-ru-es" && <span className="card-prompt">{current.ru}</span>}
              <span className="card-word">{!flipped ? (mode === "flash-ru-es" ? current.ru : current.es) : (mode === "flash-ru-es" ? current.es : current.ru)}</span>
              {current.hint && <span className="word-hint">{current.hint}</span>}
              {((flipped && mode === "flash-ru-es") || (!flipped && mode === "flash-es-ru")) && current.esPronunciation && (
                <span className="pronunciation">{current.esPronunciation}</span>
              )}
              {((flipped && mode === "flash-ru-es") || (!flipped && mode === "flash-es-ru")) && current.esAudioUrl && (
                <button
                  className="audio-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    new Audio(localAudioUrl(current.esAudioUrl)).play().catch(() => undefined);
                  }}
                >
                  ▶ Произношение
                </button>
              )}
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
            <p>
              {needsAcknowledge
                ? "Напишите правильный ответ, чтобы запомнить"
                : mode === "type-ru-es"
                  ? `Как будет на ${language.adjective}?`
                  : "Как будет по-русски?"}
            </p>
            <h3>{mode === "type-ru-es" ? current.ru : current.es}</h3>
            {current.hint && <p className="word-hint">{current.hint}</p>}
            {needsAcknowledge && (
              <p className="correction-expected">Правильно: <strong>{expectedAnswers()[0]}</strong></p>
            )}
            <input
              ref={answerInputRef}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoFocus
              placeholder={needsAcknowledge ? "Введите правильный ответ" : "Введите ответ"}
              lang={mode === "type-ru-es" ? language.htmlLang : "ru"}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {feedback && (
              <div className={feedback.startsWith("Верно") || feedback.startsWith("Запомнили") ? "feedback ok" : "feedback bad"}>
                {feedback}
              </div>
            )}
            <button className="primary wide">{needsAcknowledge ? "Проверить написание" : "Проверить"}</button>
            {mode === "type-ru-es" && language.keys.length > 0 && (
              <div className={`accent-keys ${language.keys.length > 12 ? "wide" : ""}`} aria-label={`Символы: ${language.name}`}>
                {language.keys.map((char) => (
                  <button key={char} type="button" onClick={() => insertAccent(char)} aria-label={`Вставить ${char}`}>
                    {char}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
        <div className="mobile-goal-card">
          <GoalCard streak={streak} learned={learnedTotal} done={dailyDone} goal={dailyGoal} />
        </div>
      </div>
      <aside className="study-side">
        <GoalCard streak={streak} learned={learnedTotal} done={dailyDone} goal={dailyGoal} />
        <h3>Сегодня</h3>
        <Metric label="В тестировании" value={String(words.length)} />
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

function UsersAdmin({ token, online, currentUser, sync, setNotice }: {
  token: string;
  online: boolean;
  currentUser: AuthUser;
  sync: () => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [newUser, setNewUser] = useState({ email: "", password: "", isAdmin: false });
  const [userEdit, setUserEdit] = useState({ email: "", isAdmin: false });
  const [passwordReset, setPasswordReset] = useState("");
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const activeUser = users.find((item) => item.id === activeUserId) ?? users[0];

  useEffect(() => {
    if (!token || !online) return;
    api<{ users: ManagedUser[] }>("/api/admin/users", token)
      .then((data) => setUsers(data.users))
      .catch((error) => setNotice(error instanceof Error ? error.message : "Не удалось загрузить пользователей"));
  }, [token, online]);

  useEffect(() => {
    if (!activeUserId && users[0]) setActiveUserId(users[0].id);
  }, [users, activeUserId]);

  useEffect(() => {
    if (activeUser) {
      setUserEdit({ email: activeUser.email, isAdmin: activeUser.isAdmin });
      setPasswordReset("");
      setConfirmDeleteUser(false);
    }
  }, [activeUser?.id, activeUser?.email, activeUser?.isAdmin]);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (!online) return;
    const data = await api<{ user: ManagedUser }>("/api/admin/users", token, { method: "POST", body: JSON.stringify(newUser) });
    const nextUsers = [...users, data.user].sort((left, right) => left.email.localeCompare(right.email));
    setUsers(nextUsers);
    setActiveUserId(data.user.id);
    setNewUser({ email: "", password: "", isAdmin: false });
    setNotice("Пользователь создан");
  }

  async function updateUser(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !activeUser) return;
    const data = await api<{ user: ManagedUser }>(`/api/admin/users/${activeUser.id}`, token, { method: "PATCH", body: JSON.stringify(userEdit) });
    setUsers(users.map((item) => item.id === data.user.id ? data.user : item));
    if (activeUser.id === currentUser.id) await sync();
    setNotice("Данные пользователя обновлены");
  }

  async function resetUserPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !activeUser) return;
    await api(`/api/admin/users/${activeUser.id}/password`, token, { method: "POST", body: JSON.stringify({ password: passwordReset }) });
    setPasswordReset("");
    setNotice("Пароль пользователя обновлен");
  }

  async function deleteUser() {
    if (!online || !activeUser) return;
    await api(`/api/admin/users/${activeUser.id}`, token, { method: "DELETE" });
    const nextUsers = users.filter((item) => item.id !== activeUser.id);
    setUsers(nextUsers);
    setActiveUserId(nextUsers[0]?.id ?? "");
    setConfirmDeleteUser(false);
    setNotice("Пользователь удален");
  }

  return (
    <section className="admin-layout">
      <div className="section-head">
        <div>
          <p className="eyebrow">Админка</p>
          <h2>Пользователи</h2>
        </div>
      </div>
      {!online && <div className="offline-note">Управление пользователями доступно только онлайн.</div>}
      <div className="panel admin-users-panel">
        <div className="admin-users-grid">
          <div className="list-admin">
            {users.map((item) => (
              <button key={item.id} className={activeUser?.id === item.id ? "list-row active user-row" : "list-row user-row"} onClick={() => setActiveUserId(item.id)}>
                <span>{item.isAdmin ? "★" : "•"}</span>
                <div className="list-row-meta">
                  <b>{item.email}</b>
                  <small>{item.isAdmin ? "Администратор системы" : "Пользователь"}</small>
                </div>
              </button>
            ))}
          </div>
          <div className="admin-user-forms">
            <form className="word-form admin-form-card" onSubmit={createUser}>
              <h3>Новый пользователь</h3>
              <input type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} placeholder="Email" required />
              <input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} minLength={6} placeholder="Пароль" required />
              <label className="checkbox-row">
                <input type="checkbox" checked={newUser.isAdmin} onChange={(event) => setNewUser({ ...newUser, isAdmin: event.target.checked })} />
                <span>Сделать администратором</span>
              </label>
              <button className="primary wide" disabled={!online}>Создать пользователя</button>
            </form>
            {activeUser && (
              <>
                <form className="word-form admin-form-card" onSubmit={updateUser}>
                  <h3>Данные пользователя</h3>
                  <input type="email" value={userEdit.email} onChange={(event) => setUserEdit({ ...userEdit, email: event.target.value })} placeholder="Email" required />
                  <label className="checkbox-row">
                    <input type="checkbox" checked={userEdit.isAdmin} onChange={(event) => setUserEdit({ ...userEdit, isAdmin: event.target.checked })} />
                    <span>Администратор системы</span>
                  </label>
                  <button className="ghost wide" disabled={!online}>Сохранить данные</button>
                </form>
                <form className="word-form admin-form-card" onSubmit={resetUserPassword}>
                  <h3>Новый пароль</h3>
                  <input type="password" value={passwordReset} onChange={(event) => setPasswordReset(event.target.value)} minLength={6} placeholder="Минимум 6 символов" required />
                  <button className="ghost wide" disabled={!online}>Сменить пароль</button>
                </form>
                <div className="admin-form-card">
                  <h3>Удаление</h3>
                  {activeUser.id === currentUser.id ? (
                    <p className="admin-hint">Свой аккаунт удалить нельзя.</p>
                  ) : !confirmDeleteUser ? (
                    <button className="danger outline wide" type="button" onClick={() => setConfirmDeleteUser(true)} disabled={!online}>
                      Удалить пользователя
                    </button>
                  ) : (
                    <div className="confirm-delete">
                      <p>Удалить пользователя "{activeUser.email}" вместе с его личными списками?</p>
                      <div>
                        <button className="danger" type="button" onClick={() => deleteUser().catch((error) => setNotice(error instanceof Error ? error.message : "Не удалось удалить"))}>
                          Удалить навсегда
                        </button>
                        <button className="ghost" type="button" onClick={() => setConfirmDeleteUser(false)}>Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Admin({ lists, language, token, online, currentUser, sync, progress, disabledWordIds, learnedWordIds, persistLists, toggleWordDisabled, setNotice }: {
  lists: WordList[];
  language: LanguageInfo;
  token: string;
  online: boolean;
  currentUser: AuthUser | null;
  sync: () => Promise<void>;
  progress: Record<string, Progress>;
  disabledWordIds: string[];
  learnedWordIds: string[];
  persistLists: (lists: WordList[]) => Promise<void>;
  toggleWordDisabled: (wordId: string, disabled: boolean) => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const isAdmin = Boolean(currentUser?.isAdmin);
  const [activeListId, setActiveListId] = useState(lists[0]?.id ?? "");
  const [draftList, setDraftList] = useState({ title: "", icon: "📚", color: "#087d86", isGlobal: false, language: language.code });
  const [listEdit, setListEdit] = useState({ title: "", icon: "📚", isGlobal: false, language: language.code });
  const [word, setWord] = useState({ ru: "", es: "", esPronunciation: "", hint: "" });
  const [editingWordId, setEditingWordId] = useState("");
  const [wordEdit, setWordEdit] = useState({ ru: "", es: "", esPronunciation: "", hint: "" });
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [adminLists, setAdminLists] = useState<WordList[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const editableLists = (isAdmin ? adminLists : lists).filter((list) => listLanguage(list) === language.code);
  const active = editableLists.find((list) => list.id === activeListId) ?? editableLists[0];
  const disabledWords = new Set(disabledWordIds);
  const learnedWords = new Set(learnedWordIds);

  useEffect(() => {
    if (!activeListId && editableLists[0]) setActiveListId(editableLists[0].id);
    if (activeListId && !editableLists.some((list) => list.id === activeListId)) {
      setActiveListId(editableLists[0]?.id ?? "");
    }
  }, [editableLists, activeListId]);

  useEffect(() => {
    setDraftList((current) => ({ ...current, language: language.code }));
  }, [language.code]);

  useEffect(() => {
    if (active) setListEdit({ title: active.title, icon: active.icon, isGlobal: Boolean(active.isGlobal), language: listLanguage(active) });
    setConfirmDeleteList(false);
  }, [active?.id, active?.title, active?.icon, active?.isGlobal, active?.language]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminLists([]);
      return;
    }
    if (!token || !online) return;
    api<{ lists: WordList[] }>("/api/admin/lists", token)
      .then((data) => setAdminLists(data.lists))
      .catch((error) => setNotice(error instanceof Error ? error.message : "Не удалось загрузить списки пользователей"));
  }, [isAdmin, token, online]);

  async function saveList(event: React.FormEvent) {
    event.preventDefault();
    if (!online) return;
    const created = await api<WordList>("/api/lists", token, { method: "POST", body: JSON.stringify(draftList) });
    if (isAdmin) {
      setAdminLists([created, ...adminLists]);
      await sync();
    } else {
      await persistLists([...lists, created]);
    }
    setDraftList({ title: "", icon: "📚", color: "#087d86", isGlobal: false, language: language.code });
    setActiveListId(created.id);
    setNotice("Список создан");
  }

  async function updateList(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active) return;
    const updated = await api<WordList>(`/api/lists/${active.id}`, token, { method: "PATCH", body: JSON.stringify(listEdit) });
    if (isAdmin) {
      setAdminLists(editableLists.map((list) => list.id === active.id ? { ...updated, words: updated.words } : list));
      await sync();
    } else {
      await persistLists(lists.map((list) => list.id === active.id ? { ...updated, words: list.words } : list));
    }
    setNotice("Список обновлен");
  }

  async function deleteList() {
    if (!online || !active) return;
    await api(`/api/lists/${active.id}`, token, { method: "DELETE" });
    const nextLists = editableLists.filter((list) => list.id !== active.id);
    if (isAdmin) {
      setAdminLists(nextLists);
      await sync();
    } else {
      await persistLists(nextLists);
    }
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
    if (isAdmin) {
      setAdminLists(editableLists.map((list) => list.id === active.id ? { ...list, words: [...list.words, ...created] } : list));
      await sync();
    } else {
      await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: [...list.words, ...created] } : list));
    }
    setNotice(`Импортировано слов: ${created.length}`);
  }

  async function saveWord(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active) return;
    const created = await api<Word>(`/api/lists/${active.id}/words`, token, { method: "POST", body: JSON.stringify(word) });
    if (isAdmin) {
      setAdminLists(editableLists.map((list) => list.id === active.id ? { ...list, words: [...list.words, created] } : list));
      await sync();
    } else {
      await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: [...list.words, created] } : list));
    }
    setWord({ ru: "", es: "", esPronunciation: "", hint: "" });
    setNotice("Слово добавлено");
  }

  function startWordEdit(item: Word) {
    setEditingWordId(item.id);
    setWordEdit({
      ru: item.ru,
      es: item.es,
      esPronunciation: item.esPronunciation ?? "",
      hint: item.hint ?? "",
    });
  }

  function cancelWordEdit() {
    setEditingWordId("");
    setWordEdit({ ru: "", es: "", esPronunciation: "", hint: "" });
  }

  async function updateWord(event: React.FormEvent) {
    event.preventDefault();
    if (!online || !active || !editingWordId) return;
    const updated = await api<Word>(`/api/words/${editingWordId}`, token, { method: "PATCH", body: JSON.stringify(wordEdit) });
    if (isAdmin) {
      setAdminLists(editableLists.map((list) => list.id === active.id ? { ...list, words: list.words.map((item) => item.id === updated.id ? updated : item) } : list));
      await sync();
    } else {
      await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: list.words.map((item) => item.id === updated.id ? updated : item) } : list));
    }
    cancelWordEdit();
    setNotice("Слово обновлено");
  }

  async function deleteWord(wordId: string) {
    if (!online || !active) return;
    await api(`/api/words/${wordId}`, token, { method: "DELETE" });
    if (isAdmin) {
      setAdminLists(editableLists.map((list) => list.id === active.id ? { ...list, words: list.words.filter((item) => item.id !== wordId) } : list));
      await sync();
    } else {
      await persistLists(lists.map((list) => list.id === active.id ? { ...list, words: list.words.filter((item) => item.id !== wordId) } : list));
    }
  }

  return (
    <section className="admin-layout">
      <div className="section-head">
        <div>
          <p className="eyebrow">{isAdmin ? "Админка" : "Списки"}</p>
          <h2>Списки слов</h2>
        </div>
      </div>
      {!online && <div className="offline-note">Админка доступна только онлайн. Тренировки продолжат работать без интернета.</div>}
      <div className="admin-grid">
        <div className="panel">
          <h3>Темы</h3>
          <div className="list-admin">
            {editableLists.map((list) => (
              <button key={list.id} className={active?.id === list.id ? "list-row active" : "list-row"} onClick={() => setActiveListId(list.id)}>
                <span>{list.icon}</span>
                <div className="list-row-meta">
                  <b>{list.title}</b>
                  <small>{getLanguage(list.language).short} · {list.isGlobal ? "Глобальный" : list.ownerEmail ?? "Личный список"}</small>
                </div>
                <small>{list.words.filter((item) => !disabledWords.has(item.id)).length} / {list.words.length}</small>
              </button>
            ))}
          </div>
          <form className="compact-form" onSubmit={saveList}>
            <input value={draftList.icon} onChange={(event) => setDraftList({ ...draftList, icon: event.target.value })} aria-label="Иконка" />
            <input value={draftList.title} onChange={(event) => setDraftList({ ...draftList, title: event.target.value })} placeholder="Новый список" required />
            <select
              value={draftList.language}
              onChange={(event) => setDraftList({ ...draftList, language: event.target.value as LanguageCode })}
              aria-label="Язык списка"
            >
              {LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>{item.short}</option>
              ))}
            </select>
            <button className="primary" disabled={!online}>+</button>
          </form>
          {isAdmin && (
            <label className="checkbox-row">
              <input type="checkbox" checked={draftList.isGlobal} onChange={(event) => setDraftList({ ...draftList, isGlobal: event.target.checked })} />
              <span>Сразу сделать список глобальным</span>
            </label>
          )}
        </div>
        <div className="panel">
          <h3>{active ? `${active.icon} ${active.title}` : "Слова"}</h3>
          {active && (
            <div className="list-settings">
              <div className="list-owner-line">
                <span>{active.isGlobal ? "Виден всем пользователям" : "Личный список"}</span>
                {active.ownerEmail && <small>Владелец: {active.ownerEmail}</small>}
              </div>
              <form className="list-edit-form" onSubmit={updateList}>
                <input value={listEdit.icon} onChange={(event) => setListEdit({ ...listEdit, icon: event.target.value })} aria-label="Иконка списка" />
                <input value={listEdit.title} onChange={(event) => setListEdit({ ...listEdit, title: event.target.value })} placeholder="Название списка" required />
                <select
                  value={listEdit.language}
                  onChange={(event) => setListEdit({ ...listEdit, language: event.target.value as LanguageCode })}
                  aria-label="Язык списка"
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>{item.pair}</option>
                  ))}
                </select>
                <button className="ghost" disabled={!online}>Сохранить</button>
              </form>
              {isAdmin && (
                <label className="checkbox-row">
                  <input type="checkbox" checked={listEdit.isGlobal} onChange={(event) => setListEdit({ ...listEdit, isGlobal: event.target.checked })} />
                  <span>Глобальный список, виден всем пользователям</span>
                </label>
              )}
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
              const learned = learnedWords.has(item.id);
              const editing = editingWordId === item.id;
              return (
                <div className={disabled ? "word-row disabled" : "word-row"} key={item.id}>
                  {editing ? (
                    <form className="word-edit-form" onSubmit={updateWord}>
                      <input value={wordEdit.ru} onChange={(event) => setWordEdit({ ...wordEdit, ru: event.target.value })} placeholder="Русский текст" required />
                      <input value={wordEdit.es} onChange={(event) => setWordEdit({ ...wordEdit, es: event.target.value })} placeholder={`Текст (${language.short})`} required />
                      <input value={wordEdit.esPronunciation} onChange={(event) => setWordEdit({ ...wordEdit, esPronunciation: event.target.value })} placeholder={`Произношение ${language.short}`} />
                      <input value={wordEdit.hint} onChange={(event) => setWordEdit({ ...wordEdit, hint: event.target.value })} placeholder="Подсказка" />
                      <div className="word-edit-actions">
                        <button className="primary" disabled={!online}>Сохранить</button>
                        <button className="ghost" type="button" onClick={cancelWordEdit}>Отмена</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div>
                        <b>{item.ru}</b>
                        {item.hint && <small className="word-hint-inline">{item.hint}</small>}
                      </div>
                      <div>
                        <b>{item.es}</b>
                        <small>{item.esPronunciation}</small>
                        {item.esAudioUrl && (
                          <button
                            className="ghost audio-inline"
                            type="button"
                            onClick={() => new Audio(localAudioUrl(item.esAudioUrl)).play().catch(() => undefined)}
                          >
                            ▶
                          </button>
                        )}
                      </div>
                      <div className="word-stats">
                        <span className="ok">✓ {correctTotal(itemProgress)}</span>
                        <span className="bad">× {wrongTotal(itemProgress)}</span>
                        {learned && <span>выучено</span>}
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
          <input value={word.es} onChange={(event) => setWord({ ...word, es: event.target.value })} placeholder={`Текст (${language.short})`} required />
          <input value={word.esPronunciation} onChange={(event) => setWord({ ...word, esPronunciation: event.target.value })} placeholder={`Произношение ${language.short}, если нужно`} />
          <input value={word.hint} onChange={(event) => setWord({ ...word, hint: event.target.value })} placeholder="Подсказка, если нужно" />
          <button className="primary wide" disabled={!online || !active}>Добавить</button>
        </form>
      </div>
    </section>
  );
}

function Stats({ lists, progress, queue, learnedWordIds }: { lists: WordList[]; progress: Record<string, Progress>; queue: ProgressEvent[]; learnedWordIds: string[] }) {
  const [masteryKind, setMasteryKind] = useState<MasteryKind>("oral");
  const [masteryRank, setMasteryRank] = useState<MasteryRank>("best");
  const words = lists.flatMap((list) => list.words);
  const wordById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words]);
  const learnedInLanguage = useMemo(
    () => learnedWordIds.filter((id) => wordById.has(id)),
    [learnedWordIds, wordById]
  );
  const known = Object.values(progress).filter((item) => wordById.has(item.wordId) && item.knownCount + item.correctCount > 0).length;
  const difficult = Object.values(progress).filter((item) => wordById.has(item.wordId) && item.unknownCount + item.wrongCount > 0).length;

  const rankedRows = useMemo(
    () => rankWordsByMastery(learnedInLanguage, progress, masteryKind, masteryRank),
    [learnedInLanguage, progress, masteryKind, masteryRank]
  );

  const kindMeta = masteryKind === "oral"
    ? { title: "Устный тест", description: "Карточки: разница между «знаю» и «не знаю»." }
    : { title: "Письменный тест", description: "Печать перевода: разница между верными и ошибочными ответами." };
  const rankTitle = masteryRank === "best" ? "Лучше всего знает" : "Хуже всего знает";

  return (
    <section className="stats-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">Статистика</p>
          <h2>Прогресс</h2>
        </div>
      </div>
      <div className="stats-grid">
        <Metric label="Всего слов" value={String(words.length)} />
        <Metric label="Выучено" value={String(learnedInLanguage.length)} />
        <Metric label="Есть успех в тестах" value={String(known)} />
        <Metric label="Повторить" value={String(difficult)} />
        <Metric label="Ждет синхронизации" value={String(queue.length)} />
      </div>

      <div className="stats-mastery-block">
        <div className="stats-mastery-head">
          <h3>Рейтинг выученных слов</h3>
          <p>Выберите тип теста и сортировку — список строится только для текущего выбора.</p>
        </div>
        <div className="stats-tabs" role="tablist" aria-label="Тип теста">
          <button type="button" role="tab" className={masteryKind === "oral" ? "active" : ""} aria-selected={masteryKind === "oral"} onClick={() => setMasteryKind("oral")}>Устный</button>
          <button type="button" role="tab" className={masteryKind === "written" ? "active" : ""} aria-selected={masteryKind === "written"} onClick={() => setMasteryKind("written")}>Письменный</button>
        </div>
        <div className="stats-tabs secondary" role="tablist" aria-label="Сортировка рейтинга">
          <button type="button" role="tab" data-rank="best" className={masteryRank === "best" ? "active" : ""} aria-selected={masteryRank === "best"} onClick={() => setMasteryRank("best")}>Лучше всего</button>
          <button type="button" role="tab" data-rank="worst" className={masteryRank === "worst" ? "active" : ""} aria-selected={masteryRank === "worst"} onClick={() => setMasteryRank("worst")}>Хуже всего</button>
        </div>
        <StatsRankList
          title={`${kindMeta.title}: ${rankTitle}`}
          description={kindMeta.description}
          empty="Пока нет выученных слов."
          rows={rankedRows}
          wordById={wordById}
          tone={masteryRank}
        />
      </div>
    </section>
  );
}

type MasteryRank = "best" | "worst";

type MasteryRow = {
  wordId: string;
  correct: number;
  wrong: number;
  gap: number;
};

function masteryCounts(item: Progress | undefined, kind: MasteryKind) {
  if (kind === "oral") {
    return {
      correct: item?.masteryOralCorrect ?? 0,
      wrong: item?.masteryOralWrong ?? 0,
    };
  }
  return {
    correct: item?.masteryWrittenCorrect ?? 0,
    wrong: item?.masteryWrittenWrong ?? 0,
  };
}

function rankWordsByMastery(
  wordIds: string[],
  progress: Record<string, Progress>,
  kind: MasteryKind,
  rank: MasteryRank
): MasteryRow[] {
  const rows = wordIds.map((wordId) => {
    const counts = masteryCounts(progress[wordId], kind);
    return {
      wordId,
      correct: counts.correct,
      wrong: counts.wrong,
      gap: counts.correct - counts.wrong,
    };
  });

  rows.sort((left, right) => {
    if (rank === "best") {
      if (right.gap !== left.gap) return right.gap - left.gap;
      if (right.correct !== left.correct) return right.correct - left.correct;
      return left.wrong - right.wrong;
    }
    if (left.gap !== right.gap) return left.gap - right.gap;
    if (right.wrong !== left.wrong) return right.wrong - left.wrong;
    return left.correct - right.correct;
  });

  return rows;
}

function StatsRankList({
  title,
  description,
  empty,
  rows,
  wordById,
  tone,
}: {
  title: string;
  description?: string;
  empty: string;
  rows: MasteryRow[];
  wordById: Map<string, Word>;
  tone: "best" | "worst";
}) {
  return (
    <div className={`stats-rank-card ${tone}`}>
      <h4>{title}</h4>
      {description && <p className="stats-rank-desc">{description}</p>}
      {!rows.length && <p className="stats-rank-empty">{empty}</p>}
      {!!rows.length && (
        <ol className="stats-rank-list">
          {rows.map((row, index) => {
            const word = wordById.get(row.wordId);
            if (!word) return null;
            const gapLabel = row.gap > 0 ? `+${row.gap}` : String(row.gap);
            return (
              <li key={row.wordId}>
                <span className="stats-rank-index">{index + 1}</span>
                <div className="stats-rank-word">
                  <b>{word.ru}</b>
                  <small>{word.es}</small>
                </div>
                <div className="stats-rank-score">
                  <span className="ok">✓ {row.correct}</span>
                  <span className="bad">× {row.wrong}</span>
                  <span className={`gap ${row.gap >= 0 ? "positive" : "negative"}`}>{gapLabel}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Sidebar({ view, setView, email, currentUser, signOut, online, syncing, language, setLanguage }: {
  view: View;
  setView: (view: View) => void;
  email: string;
  currentUser: AuthUser | null;
  signOut: () => void;
  online: boolean;
  syncing: boolean;
  language: LanguageInfo;
  setLanguage: (code: LanguageCode) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <AppIcon />
        <b>Palabra</b>
      </div>
      <LanguageSwitcher language={language} setLanguage={setLanguage} />
      <nav>
        <NavButton active={view === "learn"} onClick={() => setView("learn")} icon="◎" label="Обучение" />
        <NavButton active={view === "test"} onClick={() => setView("test")} icon="▣" label="Тестирование" />
        <NavButton active={view === "admin"} onClick={() => setView("admin")} icon="✎" label="Списки слов" />
        {currentUser?.isAdmin && (
          <NavButton active={view === "users"} onClick={() => setView("users")} icon="☺" label="Пользователи" />
        )}
        <NavButton active={view === "stats"} onClick={() => setView("stats")} icon="▥" label="Статистика" />
      </nav>
      <div className="sidebar-footer">
        <span className={online ? "status online" : "status"}>{syncing ? "Синхронизация" : online ? "Онлайн" : "Офлайн"}</span>
        <small>{email}</small>
        <small>{currentUser?.isAdmin ? "Администратор системы" : "Пользователь"}</small>
        <button className="ghost" onClick={signOut}>Выйти</button>
      </div>
    </aside>
  );
}

function ListMultiselect({
  lists,
  selectedLists,
  toggleList,
  setSelectedLists,
  countFor,
}: {
  lists: WordList[];
  selectedLists: string[];
  toggleList: (id: string) => void;
  setSelectedLists: (ids: string[]) => void;
  countFor: (list: WordList) => number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = lists.filter((list) => selectedLists.includes(list.id));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    !selected.length
      ? "Выберите списки"
      : selected.length <= 2
        ? selected.map((list) => `${list.icon} ${list.title}`).join(", ")
        : `${selected.slice(0, 2).map((list) => `${list.icon} ${list.title}`).join(", ")} +${selected.length - 2}`;

  return (
    <div className={`list-multiselect ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="list-multiselect-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="list-multiselect-summary">{summary}</span>
        <span className="list-multiselect-meta">
          <small>{selected.length}/{lists.length}</small>
          <span className="list-multiselect-caret" aria-hidden>▾</span>
        </span>
      </button>

      {open && (
        <div className="list-multiselect-panel" role="listbox" aria-multiselectable="true">
          <div className="list-multiselect-actions">
            <button type="button" onClick={() => setSelectedLists(lists.map((list) => list.id))}>Все</button>
            <button type="button" onClick={() => setSelectedLists([])}>Сбросить</button>
          </div>
          <div className="list-multiselect-options">
            {lists.map((list) => {
              const checked = selectedLists.includes(list.id);
              const count = countFor(list);
              return (
                <button
                  key={list.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={checked ? "list-option active" : "list-option"}
                  onClick={() => toggleList(list.id)}
                >
                  <span className="list-option-check" aria-hidden>{checked ? "✓" : ""}</span>
                  <span className="list-option-icon">{list.icon}</span>
                  <span className="list-option-title">{list.title}</span>
                  <small>{count} / {list.words.length}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Topbar({ view, online, syncing, sync, notice, signOut, language, setLanguage }: {
  view: View;
  online: boolean;
  syncing: boolean;
  sync: () => void;
  notice: string;
  signOut: () => void;
  language: LanguageInfo;
  setLanguage: (code: LanguageCode) => void;
}) {
  const titles: Record<View, { title: string; subtitle: string }> = {
    learn: { title: "Обучение", subtitle: `Смотрите перевод и запоминайте слова: ${language.pair}.` },
    test: { title: "Тестирование", subtitle: `Проверяйте выученные слова (${language.pair}).` },
    admin: { title: "Списки слов", subtitle: `Темы для языка: ${language.name}.` },
    users: { title: "Пользователи", subtitle: "Создавайте аккаунты и меняйте доступы." },
    stats: { title: "Статистика", subtitle: `Прогресс по языку: ${language.name}.` },
  };
  const current = titles[view] ?? titles.learn;
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <span className="app-icon small">ñ</span>
        <b>Palabra</b>
        <LanguageSwitcher language={language} setLanguage={setLanguage} compact />
        <button className="mobile-signout" type="button" onClick={signOut}>Выйти</button>
      </div>
      <div>
        <h1>{current.title}</h1>
        <p>{current.subtitle}</p>
      </div>
      <div className="topbar-tools">
        <div className="sync-pill">
          <span className={online ? "dot on" : "dot"} />
          {syncing ? "Синхронизация..." : notice || (online ? "Онлайн" : "Офлайн")}
          <button onClick={sync} disabled={!online || syncing} aria-label="Синхронизировать">↻</button>
        </div>
      </div>
    </header>
  );
}

function LanguageSwitcher({ language, setLanguage, compact = false }: {
  language: LanguageInfo;
  setLanguage: (code: LanguageCode) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`language-switcher ${compact ? "compact" : ""}`} ref={rootRef}>
      {!compact && <span className="language-label">Язык</span>}
      <div className={`language-select-wrap ${open ? "open" : ""}`}>
        <button
          type="button"
          className="language-select-trigger"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Язык обучения"
        >
          {compact ? (
            <span>{language.short}</span>
          ) : (
            <span className="language-select-current">
              <b>{language.short}</b>
              <small>{language.name}</small>
            </span>
          )}
          <span className="language-select-caret" aria-hidden>▾</span>
        </button>
        {open && (
          <div className="language-select-menu" role="listbox" aria-label="Язык обучения">
            {LANGUAGES.map((item) => {
              const active = item.code === language.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? "active" : ""}
                  onClick={() => {
                    setLanguage(item.code);
                    setOpen(false);
                  }}
                >
                  <b>{item.short}</b>
                  <small>{item.name}</small>
                  {active && <span className="language-select-check" aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileNav({ view, setView, currentUser }: { view: View; setView: (view: View) => void; currentUser: AuthUser | null }) {
  const isAdmin = Boolean(currentUser?.isAdmin);
  return (
    <nav className={isAdmin ? "mobile-nav admin wide" : "mobile-nav wide"}>
      <NavButton active={view === "learn"} onClick={() => setView("learn")} icon="◎" label="Учить" />
      <NavButton active={view === "test"} onClick={() => setView("test")} icon="▣" label="Тест" />
      <NavButton active={view === "admin"} onClick={() => setView("admin")} icon="✎" label="Списки" />
      {isAdmin && <NavButton active={view === "users"} onClick={() => setView("users")} icon="☺" label="Люди" />}
      <NavButton active={view === "stats"} onClick={() => setView("stats")} icon="▥" label="Стат" />
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

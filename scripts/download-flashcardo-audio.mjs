import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const seedPath = join(process.cwd(), "data", "flashcardo-topics.json");
const outputRoot = join(process.cwd(), "public", "audio", "flashcardo");
const concurrency = Number(process.env.AUDIO_DOWNLOAD_CONCURRENCY || 8);

function localPathFor(url) {
  const match = String(url).match(/^https:\/\/flashcardo\.com\/audio\/([^/]+)\/([^/?#]+\.mp3)$/);
  if (!match) return null;
  return join(outputRoot, match[1], match[2]);
}

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function download(url, index, total) {
  const path = localPathFor(url);
  if (!path) return { status: "skipped", url };
  if (await exists(path)) return { status: "cached", url };

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error(`Empty audio response for ${url}`);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);

  if (index % 100 === 0 || index === total) {
    console.log(`Downloaded ${index}/${total}`);
  }
  return { status: "downloaded", url };
}

const root = JSON.parse(await readFile(seedPath, "utf8"));
const urls = new Set();

for (const list of root.lists || []) {
  for (const word of list.words || []) {
    if (word.esAudioUrl) urls.add(word.esAudioUrl);
  }
}

const queue = [...urls].sort();
let next = 0;
const counts = { downloaded: 0, cached: 0, skipped: 0 };
const failures = [];

async function worker() {
  while (next < queue.length) {
    const current = next++;
    const url = queue[current];
    try {
      const result = await download(url, current + 1, queue.length);
      counts[result.status] += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(JSON.stringify({ total: queue.length, ...counts, failures: failures.length }, null, 2));

if (failures.length) {
  console.error(failures.slice(0, 20).join("\n"));
  process.exit(1);
}

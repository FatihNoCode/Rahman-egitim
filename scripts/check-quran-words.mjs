#!/usr/bin/env node
/**
 * Verifies every Elif-Ba word against the Quran.com API.
 *
 * Run it after touching WORDS_1..WORDS_4 in ElifBaPage.tsx:
 *
 *   node scripts/check-quran-words.mjs
 *
 * It answers the only two questions that matter for those clips, both of
 * which have already been got wrong once:
 *
 *   1. Does the audio actually say the word we display? The CDN file index is
 *      the word's position in the verse. It is NOT the `audio_url` the API
 *      returns per word — that field counts pause marks, the CDN does not, so
 *      the two drift apart in any verse that has one. Following audio_url is
 *      how مَا ("not") ended up playing ٱلسَّمَـٰوَٰتِ ("the heavens").
 *
 *   2. Does the audio say the harakat we display? Not if the reciter stops
 *      there. On the last word of a verse, or a word carrying a pause mark,
 *      the ending is elongated and the short vowel is dropped — ٱلنَّاسِ closing
 *      114:1 is nearly twice the length of the same word mid-verse.
 *
 * Exits non-zero on any problem, so it can go in CI.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src/app/components/ElifBaPage.tsx');
const API = 'https://api.quran.com/api/v4/verses/by_key';

// Quranic annotation and pause marks. A word carrying one of these is a place
// the reciter may stop, which is exactly what rule 2 rejects.
const MARKS = /[ۖ-ۭ۞۩]/u;

/** Strip marks and whitespace so two spellings of the same word compare equal. */
function normalise(text) {
  return (text || '').normalize('NFC').replace(MARKS, '').replace(/\s+/gu, '');
}

/** Pull the { id, arabic, ref } triples straight out of the component. */
function readWords() {
  const src = readFileSync(SOURCE, 'utf8');
  const entries = [];
  const re = /\{\s*id:\s*'([^']+)',\s*arabic:\s*'([^']+)',[^}]*?ref:\s*'(\d+):(\d+):(\d+)'\s*\}/gu;
  for (const m of src.matchAll(re)) {
    entries.push({ id: m[1], arabic: m[2], surah: +m[3], ayah: +m[4], position: +m[5] });
  }
  return entries;
}

const verseCache = new Map();
async function verseWords(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (!verseCache.has(key)) {
    const url = `${API}/${key}?words=true&word_fields=text_uthmani`;
    const res = await fetch(url, { headers: { 'User-Agent': 'rahman-egitim-check' } });
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    const body = await res.json();
    verseCache.set(key, body.verse.words.filter((w) => w.char_type_name === 'word'));
  }
  return verseCache.get(key);
}

const pad3 = (n) => String(n).padStart(3, '0');

const words = readWords();
if (words.length === 0) {
  console.error('No words parsed from ElifBaPage.tsx — has the shape of QWord changed?');
  process.exit(1);
}

let failures = 0;
for (const w of words) {
  const file = `${pad3(w.surah)}_${pad3(w.ayah)}_${pad3(w.position)}.mp3`;
  let problems = [];
  try {
    const ws = await verseWords(w.surah, w.ayah);
    const hit = ws.find((x) => x.position === w.position);
    if (!hit) {
      problems.push(`no word at position ${w.position} (verse has ${ws.length})`);
    } else {
      if (normalise(hit.text_uthmani) !== normalise(w.arabic)) {
        problems.push(`plays ${hit.text_uthmani.trim()}, shows ${w.arabic}`);
      }
      if (hit.position === ws[ws.length - 1].position) {
        problems.push('verse-final: reciter stops, final vowel not pronounced');
      }
      if (MARKS.test(hit.text_uthmani || '')) {
        problems.push('carries a pause mark');
      }
    }
  } catch (err) {
    problems.push(`lookup failed: ${err.message}`);
  }

  if (problems.length === 0) {
    console.log(`  ok    ${w.id.padEnd(12)} ${file}`);
  } else {
    failures++;
    console.error(`  FAIL  ${w.id.padEnd(12)} ${file}  ${problems.join('; ')}`);
  }
}

console.log(`\n${words.length - failures}/${words.length} words verified.`);
process.exit(failures === 0 ? 0 : 1);

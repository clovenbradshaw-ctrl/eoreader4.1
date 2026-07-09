#!/usr/bin/env node
// Prefetch every model in data/models.manifest.json into a local cache directory,
// so the reader (or a mirror you host) can serve weights fast instead of hitting
// Hugging Face cold. Single-file backends (gguf, onnx) are downloaded directly;
// MLC/transformers-repo backends are git-cloned (they ship many shard files).
//
//   node scripts/prefetch-models.mjs [outDir] [--filter=<substring>] [--mlc]
//
//   outDir            where to write (default: ./model-cache)
//   --filter=pleias   only fetch models whose id/repo contains the substring
//   --mlc             also clone the multi-file MLC / embed repos (needs git+git-lfs)
//
// Direct file downloads need only Node 18+ (global fetch). Repo clones need git.

import { readFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', 'data', 'models.manifest.json');

const args = process.argv.slice(2);
const outDir = resolve(args.find((a) => !a.startsWith('--')) || 'model-cache');
const filter = (args.find((a) => a.startsWith('--filter=')) || '').split('=')[1] || '';
const doMlc = args.includes('--mlc');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const models = manifest.models.filter(
  (m) => !filter || `${m.id} ${m.hfRepo}`.toLowerCase().includes(filter.toLowerCase()),
);

const exists = async (p) => stat(p).then(() => true).catch(() => false);

async function download(url, dest) {
  if (await exists(dest)) { console.log(`  skip (exists): ${dest}`); return; }
  await mkdir(dirname(dest), { recursive: true });
  process.stdout.write(`  GET ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`  -> ${dest}`);
}

function clone(repo, dest) {
  if (spawnSync('git', ['--version']).status !== 0) {
    console.log(`  SKIP clone (git not found): ${repo}`); return;
  }
  const url = `https://huggingface.co/${repo}`;
  console.log(`  CLONE ${url}`);
  const r = spawnSync('git', ['clone', '--depth', '1', url, dest], { stdio: 'inherit' });
  if (r.status !== 0) console.log(`  clone failed (need git-lfs?): ${repo}`);
}

let ok = 0, failed = 0, skipped = 0;
for (const m of models) {
  console.log(`\n[${m.id}]  ${m.hfRepo}  (${m.params}, ${m.runtime})`);
  const repoDir = join(outDir, m.hfRepo);
  try {
    if (Array.isArray(m.files) && m.files.length) {
      for (const url of m.files) await download(url, join(repoDir, url.split('/resolve/main/')[1]));
      ok++;
    } else if (doMlc) {
      clone(m.hfRepo, repoDir); ok++;
    } else {
      console.log('  (multi-file repo — pass --mlc to clone it)'); skipped++;
    }
  } catch (e) {
    console.error(`  FAILED: ${e.message}`); failed++;
  }
}

console.log(`\nDone. ${ok} fetched, ${skipped} skipped, ${failed} failed.  Cache: ${outDir}`);
process.exit(failed ? 1 : 0);

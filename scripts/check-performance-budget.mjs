import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, stdout } from 'node:process';
import { gzipSync } from 'node:zlib';

const distDir = join(cwd(), 'dist');
const html = await readFile(join(distDir, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/u);
if (!scriptMatch?.[1]) throw new Error('Could not locate the production entry script.');

const entryRelative = scriptMatch[1].replace(/^\/notes\//u, '').replace(/^\.\//u, '');
const entry = await readFile(join(distDir, entryRelative));
const entryBytes = entry.byteLength;
const entryGzipBytes = gzipSync(entry).byteLength;
const maxEntryBytes = 520 * 1024;
const maxEntryGzipBytes = 155 * 1024;

if (entryBytes > maxEntryBytes) {
  throw new Error(`Entry JS ${entryBytes} B exceeds ${maxEntryBytes} B budget.`);
}
if (entryGzipBytes > maxEntryGzipBytes) {
  throw new Error(`Entry JS gzip ${entryGzipBytes} B exceeds ${maxEntryGzipBytes} B budget.`);
}

const searchRepository = await readFile(
  join(cwd(), 'src', 'features', 'search', 'searchRepository.ts'),
  'utf8',
);
if (/attachments\.toArray\(\)/u.test(searchRepository)) {
  throw new Error('Search must not materialize Blob-bearing attachment rows.');
}
if (
  !searchRepository.includes("orderBy('[noteId+name]').keys()") ||
  !searchRepository.includes("orderBy('[noteId+mimeType]').keys()")
) {
  throw new Error('Search attachment metadata indexes are missing from the production source.');
}

const sw = await readFile(join(distDir, 'sw.js'), 'utf8');
for (const forbidden of [
  'ocr/lang/eng.traineddata.gz',
  'ocr/lang/deu.traineddata.gz',
  'ocr/lang/fra.traineddata.gz',
  'ocr/core/tesseract-core-simd-lstm.wasm',
]) {
  if (sw.includes(forbidden)) {
    throw new Error(`OCR asset ${forbidden} leaked back into the install-time precache.`);
  }
}

const coreFiles = await readdir(join(distDir, 'ocr', 'core'));
stdout.write(
  `[perf] entry ${(entryBytes / 1024).toFixed(1)} KiB (${(entryGzipBytes / 1024).toFixed(1)} KiB gzip); OCR deferred from precache; ${coreFiles.length} local core assets.\n`,
);

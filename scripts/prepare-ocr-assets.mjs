import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(rootDir, 'public', 'ocr');
const coreOutputDir = join(outputDir, 'core');
const languageOutputDir = join(outputDir, 'lang');

const tesseractDir = dirname(require.resolve('tesseract.js/package.json'));
const coreDir = dirname(require.resolve('tesseract.js-core/package.json'));
const languages = ['eng', 'deu', 'fra'];

await rm(outputDir, { recursive: true, force: true });
await mkdir(coreOutputDir, { recursive: true });
await mkdir(languageOutputDir, { recursive: true });

await cp(join(tesseractDir, 'dist', 'worker.min.js'), join(outputDir, 'worker.min.js'));

const coreFiles = await readdir(coreDir);
for (const fileName of coreFiles) {
  if (!/^tesseract-core(?:-[a-z]+)*(?:-lstm)?\.wasm(?:\.js)?$/u.test(fileName)) continue;
  await cp(join(coreDir, fileName), join(coreOutputDir, fileName));
}

for (const language of languages) {
  const dataDir = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  await cp(
    join(dataDir, '4.0.0_best_int', `${language}.traineddata.gz`),
    join(languageOutputDir, `${language}.traineddata.gz`),
  );
}

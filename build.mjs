/* 책갈피 단일파일 빌드 — prototype/index.html 의 <script src="schools.js"> 를 인라인으로 치환.
   사용: node build.mjs   → dist/index.html, 책갈피_단일파일.html, netlify_publish/index.html 갱신 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'prototype/index.html'), 'utf8');
const schools = readFileSync(join(root, 'prototype/schools.js'), 'utf8');

const tag = '<script src="schools.js"></script>';
if (!html.includes(tag)) {
  console.error('!! schools.js script 태그를 찾지 못했습니다. 빌드 중단.');
  process.exit(1);
}
const inlined = html.replace(tag, `<script>\n${schools}\n</script>`);

const outputs = ['dist/index.html', '책갈피_단일파일.html', 'netlify_publish/index.html'];
for (const rel of outputs) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, inlined, 'utf8');
  console.log('✓', rel, (inlined.length / 1024).toFixed(0) + 'KB');
}
console.log('빌드 완료.');

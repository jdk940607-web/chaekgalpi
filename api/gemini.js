/* ============================================================================
   책갈피 AI 프록시 — Vercel 서버리스 함수 버전
   ----------------------------------------------------------------------------
   설정 방법
     1) 이 파일을 프로젝트의  /api/ai-proxy.js  로 둔다(Vercel은 api/ 폴더를 함수로 인식).
     2) Vercel → Project Settings → Environment Variables 에 GEMINI_API_KEY 등록.
     3) 배포 URL  https://<프로젝트>.vercel.app/api/ai-proxy  를
        index.html 의  AI_CONFIG.proxyUrl  에 입력.
   ============================================================================ */
const MODEL = 'gemini-2.5-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 운영 시 도메인 제한 권장
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).send('POST only');
  if (!process.env.GEMINI_API_KEY) return res.status(500).send('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
  });
  const text = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
}

/* ============================================================================
   책갈피 AI 프록시 — Cloudflare Workers 버전 (무료·콜드스타트 없음, 권장)
   ----------------------------------------------------------------------------
   왜 프록시인가?
     정적 사이트(브라우저)에 Gemini 키를 직접 넣으면 누구나 키를 볼 수 있어
     도용·과금 폭탄 위험이 있다. 키는 반드시 서버(이 워커)에만 둔다.

   설정 방법
     1) Cloudflare 대시보드 → Workers & Pages → Create Worker → 이 코드 붙여넣기
     2) Settings → Variables and Secrets → GEMINI_API_KEY 에 본인 Gemini 키 등록(Secret)
     3) 배포된 워커 URL(예: https://chaek-ai.<계정>.workers.dev)을
        index.html 의  AI_CONFIG.proxyUrl  에 입력
     4) ALLOW_ORIGIN 을 운영 도메인으로 제한하면 더 안전하다(예: 'https://책갈피도메인').
   ============================================================================ */
const MODEL = 'gemini-2.5-flash';
const ALLOW_ORIGIN = '*'; // 운영 시 본인 사이트 도메인으로 제한 권장

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') return cors(new Response('POST only', { status: 405 }));
    if (!env.GEMINI_API_KEY) return cors(new Response('GEMINI_API_KEY not set', { status: 500 }));

    const body = await request.text(); // 클라이언트가 만든 Gemini 요청 본문을 그대로 전달
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return cors(new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    }));
  },
};

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

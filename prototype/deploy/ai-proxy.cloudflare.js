/* ============================================================================
   책갈피 AI + 맞춤법 프록시 — Cloudflare Workers 버전 (무료·콜드스타트 없음, 권장)
   ----------------------------------------------------------------------------
   왜 프록시인가?
     정적 사이트(브라우저)에 Gemini 키를 직접 넣으면 누구나 키를 볼 수 있어
     도용·과금 폭탄 위험이 있다. 키는 반드시 서버(이 워커)에만 둔다.
     또 다음/네이버 맞춤법 검사기는 브라우저에서 직접 부르면 CORS로 막히므로
     이 워커가 서버사이드로 대신 호출해 준다.

   두 가지 일을 한다(요청 본문으로 자동 분기):
     · {contents:...}            → Gemini 첨삭 (GEMINI_API_KEY 필요)
     · {text:"검사할 문장"}       → Daum 맞춤법 검사 (키 불필요)

   설정 방법
     1) Cloudflare 대시보드 → Workers & Pages → Create Worker → 이 코드 붙여넣기
     2) Settings → Variables and Secrets → GEMINI_API_KEY 에 본인 Gemini 키 등록(Secret)
     3) 배포된 워커 URL(예: https://chaek-ai.<계정>.workers.dev)을
        index.html 의  AI_CONFIG.proxyUrl  과  AI_CONFIG.spellUrl  에 입력
     4) ALLOW_ORIGIN 을 운영 도메인으로 제한하면 더 안전하다.
   ============================================================================ */
const MODEL = 'gemini-2.5-flash';
const ALLOW_ORIGIN = '*'; // 운영 시 본인 사이트 도메인으로 제한 권장

const DAUM_URL = 'https://dic.daum.net/grammar_checker.do';
const DAUM_MAX = 950;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') return cors(new Response('POST only', { status: 405 }));

    const raw = await request.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* ignore */ }

    // 맞춤법 검사 요청 분기
    if (parsed && (parsed.text || parsed.spell || parsed.sentence) && !parsed.contents) {
      const text = String(parsed.text || parsed.spell || parsed.sentence || '');
      return cors(await spellCheck(text));
    }

    // 기본: Gemini 첨삭
    if (!env.GEMINI_API_KEY) return cors(new Response('GEMINI_API_KEY not set', { status: 500 }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    });
    return cors(new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    }));
  },
};

/* ---- Daum 맞춤법 검사 (hanspell의 Daum 백엔드 포팅) ---- */
async function spellCheck(text) {
  const clean = text.replace(/<[^>]*>/g, ' ');
  if (!clean.trim()) return json({ typos: [] });
  try {
    const parts = chunk(clean, DAUM_MAX);
    let typos = [];
    for (const p of parts) {
      if (!p.trim()) continue;
      typos = typos.concat(await checkOne(p));
      if (parts.length > 1) await new Promise((r) => setTimeout(r, 350));
    }
    const seen = new Set();
    typos = typos.filter((t) => (seen.has(t.token) ? false : (seen.add(t.token), true)));
    return json({ typos, engine: 'daum' });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 502);
  }
}
async function checkOne(sentence) {
  const res = await fetch(DAUM_URL, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sentence }).toString(),
  });
  const body = await res.text();
  if (res.status !== 200 || body.indexOf('맞춤법 검사기 본문') === -1) throw new Error('Daum ' + res.status);
  return parseTypos(body);
}
function parseTypos(html) {
  const typos = [];
  let i = -1;
  for (;;) {
    i = html.indexOf('data-error-type', i + 1);
    if (i < 0) break;
    const end = html.indexOf('>', i + 1);
    if (end < 0) break;
    const line = html.substring(i, end);
    const token = dec(getAttr(line, 'data-error-input=')).trim();
    const suggestion = dec(getAttr(line, 'data-error-output=')).trim();
    if (!token || !suggestion || token === suggestion) continue;
    typos.push({ token, suggestion });
  }
  return typos;
}
function getAttr(line, key) {
  const f = line.indexOf(key); if (f < 0) return '';
  const q1 = line.indexOf('"', f + 1); const q2 = line.indexOf('"', q1 + 1);
  if (q1 < 0 || q2 < 0) return '';
  return line.substring(q1 + 1, q2);
}
function dec(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function chunk(text, limit) {
  const out = []; let buf = ''; const re = /[^.!?\n]*[.!?\n]?/g; let m;
  while ((m = re.exec(text)) !== null) {
    const piece = m[0]; if (piece === '') break;
    if ((buf + piece).length > limit && buf) { out.push(buf); buf = piece; } else buf += piece;
  }
  if (buf.trim()) out.push(buf);
  return out.length ? out : [text.slice(0, limit)];
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

/* 책갈피 맞춤법 검사 — Vercel 함수 (Daum 검사기 서버사이드 프록시, hanspell 포팅)
   POST /api/spell  body: {"text":"검사할 문장"}
   응답: { typos: [ { token, suggestion } ] } / 실패 시 502 → 클라이언트 내장사전 폴백 */
const DAUM_URL = 'https://dic.daum.net/grammar_checker.do';
const DAUM_MAX = 950;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function getAttr(line, key) {
  const f = line.indexOf(key);
  if (f < 0) return '';
  const q1 = line.indexOf('"', f + 1);
  const q2 = line.indexOf('"', q1 + 1);
  if (q1 < 0 || q2 < 0) return '';
  return line.substring(q1 + 1, q2);
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
    const token = decodeEntities(getAttr(line, 'data-error-input=')).trim();
    const suggestion = decodeEntities(getAttr(line, 'data-error-output=')).trim();
    if (!token || !suggestion || token === suggestion) continue;
    typos.push({ token, suggestion });
  }
  return typos;
}
function chunk(text, limit) {
  const out = [];
  let buf = '';
  const re = /[^.!?\n]*[.!?\n]?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const piece = m[0];
    if (piece === '') break;
    if ((buf + piece).length > limit && buf) { out.push(buf); buf = piece; }
    else buf += piece;
  }
  if (buf.trim()) out.push(buf);
  return out.length ? out : [text.slice(0, limit)];
}
async function checkOne(sentence) {
  const res = await fetch(DAUM_URL, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sentence }).toString(),
  });
  const body = await res.text();
  if (res.status !== 200 || body.indexOf('맞춤법 검사기 본문') === -1) {
    throw new Error('Daum invalid response (' + res.status + ')');
  }
  return parseTypos(body);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let text = '';
  try {
    const j = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    text = (j.text || j.spell || j.sentence || '').toString();
  } catch (e) {
    return res.status(400).json({ error: 'bad json' });
  }
  text = text.replace(/<[^>]*>/g, ' ').replace(/ /g, ' ');
  if (!text.trim()) return res.status(200).json({ typos: [] });

  try {
    const parts = chunk(text, DAUM_MAX);
    let typos = [];
    for (const p of parts) {
      if (!p.trim()) continue;
      typos = typos.concat(await checkOne(p));
      if (parts.length > 1) await new Promise((r) => setTimeout(r, 350));
    }
    const seen = new Set();
    typos = typos.filter((t) => {
      if (seen.has(t.token)) return false;
      seen.add(t.token);
      return true;
    });
    return res.status(200).json({ typos, engine: 'daum' });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
}

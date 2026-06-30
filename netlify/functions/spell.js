/* ============================================================================
   책갈피 맞춤법 검사 — Netlify Function (서버사이드, 키 불필요)
   ----------------------------------------------------------------------------
   왜 서버 함수인가?
     다음(Daum)·네이버 맞춤법 검사기는 브라우저에서 직접 부르면 CORS로 막힌다.
     이 함수가 같은 도메인에서 서버사이드로 Daum 검사기에 요청을 대신 보내고,
     결과를 파싱해 JSON으로 돌려준다. (hanspell의 Daum 백엔드를 포팅)
   엔드포인트:  POST /.netlify/functions/spell   body: {"text":"검사할 문장"}
   응답:       { "typos": [ { "token":"틀린말", "suggestion":"고친말" }, ... ] }
   실패 시 502 → 클라이언트는 내장 사전(규칙기반)으로 자동 폴백한다.
   ============================================================================ */
const DAUM_URL = 'https://dic.daum.net/grammar_checker.do';
const DAUM_MAX = 950; // Daum 한도 1000자 — 여유
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Daum 응답 한 줄에서 key="값" 형태의 값을 뽑는다.
function getAttr(line, key) {
  const f = line.indexOf(key);
  if (f < 0) return '';
  const q1 = line.indexOf('"', f + 1);
  const q2 = line.indexOf('"', q1 + 1);
  if (q1 < 0 || q2 < 0) return '';
  return line.substring(q1 + 1, q2);
}

// data-error-input(틀린말) / data-error-output(고친말) 추출
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

// 긴 글은 문장부호/줄바꿈 기준으로 ~950자 단위로 자른다.
function chunk(text, limit) {
  const out = [];
  let buf = '';
  const re = /[^.!?\n]*[.!?\n]?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const piece = m[0];
    if (piece === '') break;
    if ((buf + piece).length > limit && buf) {
      out.push(buf);
      buf = piece;
    } else {
      buf += piece;
    }
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let text = '';
  try {
    const j = JSON.parse(event.body || '{}');
    text = (j.text || j.spell || j.sentence || '').toString();
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'bad json' }) };
  }
  // 태그 제거 + 정규화
  text = text.replace(/<[^>]*>/g, ' ').replace(/ /g, ' ');
  if (!text.trim()) return { statusCode: 200, headers: CORS, body: JSON.stringify({ typos: [] }) };

  try {
    const parts = chunk(text, DAUM_MAX);
    let typos = [];
    for (const p of parts) {
      if (!p.trim()) continue;
      typos = typos.concat(await checkOne(p));
      if (parts.length > 1) await new Promise((r) => setTimeout(r, 350)); // 다음 서버 예의상 간격
    }
    // 중복 제거
    const seen = new Set();
    typos = typos.filter((t) => {
      if (seen.has(t.token)) return false;
      seen.add(t.token);
      return true;
    });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ typos, engine: 'daum' }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};

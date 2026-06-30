/* ============================================================================
   책갈피 AI 프록시 — Netlify Function (Gemini generateContent)
   ----------------------------------------------------------------------------
   클라이언트(geminiCall)가 만든 Gemini 요청 본문을 그대로 받아, 운영자 키를 붙여
   Gemini API로 전달한다. 키는 이 서버(환경변수)에만 두므로 브라우저에 노출되지 않는다.
   이 함수 하나가 두 기능을 동시에 켠다:
     · 비전 OCR(geminiOCR) — 손글씨 사진을 멀티모달로 직접 판독(한국어 정확도↑)
     · AI 첨삭(aiReviewLLM/aiVerifyLLM) — 5축 루브릭 LLM 첨삭

   켜는 법:
     1) Netlify → Site settings → Environment variables → GEMINI_API_KEY 등록
        (무료 키: https://aistudio.google.com/app/apikey)
     2) index.html 의 AI_CONFIG.proxyUrl 을 '/.netlify/functions/gemini' 로 설정 후 재배포
     키가 없으면 503 → 클라이언트는 규칙기반 첨삭 + Tesseract OCR 로 자동 폴백한다.
   ============================================================================ */
const MODEL = 'gemini-2.5-flash';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'GEMINI_API_KEY not set' }) };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: event.body || '{}',
    });
    const text = await upstream.text();
    return { statusCode: upstream.status, headers: CORS, body: text };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};

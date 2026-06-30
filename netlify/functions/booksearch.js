/* ============================================================================
   책갈피 책 검색 — Netlify Function
   ----------------------------------------------------------------------------
   카카오 책 검색 API(우선) → 네이버 책 검색 API(폴백) 순서로 시도.
   엔드포인트: GET /.netlify/functions/booksearch?q=강아지똥&size=5
   응답: { books: [ {title, author, publisher, thumbnail, isbn} ] }
   env 필요: KAKAO_REST_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
   ============================================================================ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

function ok(data) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
}
function err(code, msg) {
  return { statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) };
}

async function searchKakao(q, size) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) throw new Error('NO_KAKAO_KEY');
  const url = `https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(q)}&size=${size}&target=title`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) throw new Error('KAKAO_' + res.status);
  const j = await res.json();
  return (j.documents || []).map((d) => ({
    title: d.title,
    author: (d.authors || []).join(', '),
    publisher: d.publisher || '',
    thumbnail: d.thumbnail || '',
    isbn: (d.isbn || '').trim(),
    description: (d.contents || '').trim(),
  }));
}

async function searchNaver(q, size) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('NO_NAVER_KEY');
  const url = `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(q)}&display=${size}`;
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
  });
  if (!res.ok) throw new Error('NAVER_' + res.status);
  const j = await res.json();
  return (j.items || []).map((d) => ({
    title: d.title.replace(/<[^>]*>/g, ''),
    author: (d.author || '').replace(/\^/g, ', '),
    publisher: d.publisher || '',
    thumbnail: d.image || '',
    isbn: (d.isbn || '').trim(),
    description: (d.description || '').replace(/<[^>]*>/g, '').trim(),
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return err(405, 'GET only');

  const q = (event.queryStringParameters || {}).q || '';
  const size = Math.min(8, parseInt((event.queryStringParameters || {}).size || '5', 10));
  if (!q.trim()) return ok({ books: [] });

  // 카카오 우선, 실패 시 네이버 폴백
  try {
    const books = await searchKakao(q, size);
    return ok({ books, engine: 'kakao' });
  } catch (e1) {
    try {
      const books = await searchNaver(q, size);
      return ok({ books, engine: 'naver' });
    } catch (e2) {
      console.error('booksearch fail', e1.message, e2.message);
      return err(502, '책 검색에 일시적으로 실패했습니다.');
    }
  }
};

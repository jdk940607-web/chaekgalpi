/* 책갈피 책 검색 — Vercel 함수. 카카오(우선) → 네이버(폴백).
   GET /api/booksearch?q=강아지똥&size=5
   env: KAKAO_REST_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET */

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const q = (req.query.q || '').toString();
  const size = Math.min(8, parseInt(req.query.size || '5', 10));
  if (!q.trim()) return res.status(200).json({ books: [] });

  try {
    const books = await searchKakao(q, size);
    return res.status(200).json({ books, engine: 'kakao' });
  } catch (e1) {
    try {
      const books = await searchNaver(q, size);
      return res.status(200).json({ books, engine: 'naver' });
    } catch (e2) {
      console.error('booksearch fail', e1.message, e2.message);
      return res.status(502).json({ error: '책 검색에 일시적으로 실패했습니다.' });
    }
  }
}

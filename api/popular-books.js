/* 책갈피 인기대출도서 — 도서관 정보나루(data4library) 서버 프록시
   GET /api/popular-books?size=10
   응답: { books: [{title, author, publisher, count}] }
   env: LIBRARY_AUTH_KEY (정보나루 발급 인증키)
   age=8 → 8~13세(초등) 구간 인기대출도서로 제한 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const key = process.env.LIBRARY_AUTH_KEY;
  if (!key) return res.status(500).json({ error: 'LIBRARY_AUTH_KEY not set' });

  const size = Math.min(30, parseInt(req.query.size || '10', 10));
  const url = `https://www.data4library.kr/api/loanItemSrch?authKey=${key}&format=json&pageSize=${size}&age=8`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error('HTTP ' + upstream.status);
    const j = await upstream.json();
    const docs = (j.response && j.response.docs) || [];
    const books = docs.map((d) => {
      const b = d.doc || {};
      return {
        title: (b.bookname || '').split(':')[0].trim(),
        author: (b.authors || '').replace(/지은이\s*:\s*/, '').split(/[;,]/)[0].replace(/\(.+?\)/g, '').trim(),
        publisher: b.publisher || '',
        cover: b.bookImageURL || '',
        count: parseInt(b.loan_count || '0', 10),
      };
    }).filter((b) => b.title);
    return res.status(200).json({ books });
  } catch (e) {
    console.error('popular-books fail', e.message);
    return res.status(502).json({ error: '인기대출도서 조회 실패' });
  }
}

/* 책갈피 도서관 정보나루(data4library) 활용 프록시 — 서버함수
   GET /api/library?action=analysis&isbn=<13자리>
     → { keywords:[..최대12], coLoan:[{title,author,cover,isbn}..최대8], reco:[..최대8] }
   GET /api/library?action=trend
     → { hot:[{title,author,cover,diff}..최대8], keywords:[..최대10] }
   env: LIBRARY_AUTH_KEY (정보나루 발급 인증키) */

const BASE = 'https://www.data4library.kr/api';

// bookname은 ':' 앞부분만, authors는 "지은이: " 제거 후 첫 명단만
function cTitle(s) {
  return (s || '').split(':')[0].trim();
}
function cAuthor(s) {
  return (s || '')
    .replace(/(지은이|글쓴이|글|그림|옮긴이|엮은이)\s*:\s*/g, '')
    .split(/[;,]/)[0]
    .replace(/\(.+?\)/g, '')
    .replace(/\s+(글|지음|그림|저|편|엮음|옮김)$/,'')
    .trim();
}

async function fetchJson(url) {
  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error('HTTP ' + upstream.status);
  return upstream.json();
}

async function doAnalysis(key, isbn) {
  const url = `${BASE}/usageAnalysisList?authKey=${key}&format=json&isbn13=${encodeURIComponent(isbn)}`;
  const j = await fetchJson(url);
  const r = (j && j.response) || {};

  const keywords = ((r.keywords || [])
    .map((k) => (k.keyword && k.keyword.word) || '')
    .filter(Boolean))
    .slice(0, 12);

  const toBook = (arr) =>
    (arr || []).map((x) => {
      const b = x.book || {};
      return {
        title: cTitle(b.bookname),
        author: cAuthor(b.authors),
        cover: b.bookImageURL || '',
        isbn: b.isbn13 || '',
      };
    }).filter((b) => b.title);

  const coLoan = toBook(r.coLoanBooks).slice(0, 8);

  // reco = maniaRecBooks + readerRecBooks 합치고 isbn 중복 제거
  const recoAll = toBook(r.maniaRecBooks).concat(toBook(r.readerRecBooks));
  const seen = new Set();
  const reco = [];
  for (const b of recoAll) {
    const id = b.isbn || b.title;
    if (seen.has(id)) continue;
    seen.add(id);
    reco.push(b);
    if (reco.length >= 8) break;
  }

  return { keywords, coLoan, reco };
}

async function doTrend(key) {
  const d = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  let hot = [];
  try {
    const j = await fetchJson(`${BASE}/hotTrend?authKey=${key}&format=json&searchDt=${d}`);
    const results = (j && j.response && j.response.results) || [];
    const docs = (results[0] && results[0].result && results[0].result.docs) || [];
    hot = docs.map((x) => {
      const b = x.doc || {};
      return {
        title: cTitle(b.bookname),
        author: cAuthor(b.authors),
        cover: b.bookImageURL || '',
        diff: parseInt(b.difference || '0', 10) || 0,
      };
    }).filter((b) => b.title).slice(0, 8);
  } catch (e) {
    console.error('hotTrend fail', e.message);
  }

  // monthlyKeywords: month 파라미터 없이 호출 (검증 결과 month 주면 빈 응답)
  let keywords = [];
  try {
    const j = await fetchJson(`${BASE}/monthlyKeywords?authKey=${key}&format=json`);
    const r = (j && j.response) || {};
    keywords = (r.keywords || [])
      .map((k) => (k.keyword && k.keyword.word) || '')
      .filter(Boolean)
      .slice(0, 10);
  } catch (e) {
    console.error('monthlyKeywords fail', e.message);
  }

  return { hot, keywords };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const key = process.env.LIBRARY_AUTH_KEY;
  if (!key) return res.status(500).json({ error: 'LIBRARY_AUTH_KEY not set' });

  const action = req.query.action || '';
  try {
    if (action === 'analysis') {
      const isbn = (req.query.isbn || '').replace(/[^0-9]/g, '');
      if (isbn.length !== 13) return res.status(400).json({ error: 'isbn(13자리) 필요' });
      return res.status(200).json(await doAnalysis(key, isbn));
    }
    if (action === 'trend') {
      return res.status(200).json(await doTrend(key));
    }
    return res.status(400).json({ error: 'action=analysis|trend 필요' });
  } catch (e) {
    console.error('library fail', action, e.message);
    return res.status(502).json({ error: '정보나루 조회 실패' });
  }
}

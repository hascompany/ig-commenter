// 순수 함수 모음 (테스트 가능하도록 index.js에서 분리)

export function extractShortcode(link) {
  const m = String(link || '').match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// HTML 엔티티 디코딩 (&amp;는 마지막에 처리해 이중 디코딩 방지)
export function decodeEntities(str) {
  const cp = (n) => {
    try {
      return String.fromCodePoint(n);
    } catch {
      return '';
    }
  };
  return str
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => cp(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => cp(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// og:description 값에서 실제 캡션만 추출
// 예: '1,234 likes, 5 comments - user on March 3, 2024: "caption".'
export function parseCaption(html) {
  const tag = html.match(/<meta[^>]+property=["']og:description["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content="([^"]*)"/i) || tag[0].match(/content='([^']*)'/i);
  if (!content) return null;

  let text = decodeEntities(content[1]).trim();
  // '통계 - 작성자 ...: "캡션"' 형태일 때만 접두어 제거 (접두어가 없으면 원문 유지)
  const m = text.match(/^[^"“]{0,200}? - [^:]{0,200}?:\s*["“]?([\s\S]*?)["”]?\.?\s*$/);
  if (m && m[1].trim()) text = m[1].trim();
  return text || null;
}

// 모델 응답을 줄 단위 댓글로 변환 (번호/기호가 붙어도 줄 앞에서만 제거)
export function parseComments(text, n) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, n);
}

// GPT-5 / o 시리즈는 temperature 지정을 지원하지 않는 경우가 있어 생략
export function supportsTemperature(model) {
  return !/^(gpt-5|o\d)/i.test(model);
}

// 메모리 기반 간단한 IP별 rate limiter
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let e = hits.get(key);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.count += 1;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
    }
    next();
  };
}

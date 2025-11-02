import 'dotenv/config';
import express from 'express';
import { OpenAI } from 'openai';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('views', './views');
app.use(express.static('views'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 인스타그램 링크에서 고유코드(shortcode) 추출
function extractShortcode(link) {
  const m = link.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// Puppeteer로 인스타그램 캡션 추출
async function fetchCaptionFromInstagram(link) {
  const shortcode = extractShortcode(link);
  if (!shortcode) throw new Error('유효한 인스타그램 링크가 아닙니다.');

  const url = `https://www.instagram.com/p/${shortcode}/`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 가장 안전한 방식: og:description 메타태그에서 캡션 읽기
    let caption = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:description"]');
      return og ? og.getAttribute('content') : null;
    });

    // 백업 방식: 화면 내 텍스트에서 가장 긴 문단 추출
    if (!caption) {
      caption = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('h1, h2, span, div'))
          .map(el => el.innerText)
          .filter(t => t && t.length > 0)
          .sort((a, b) => b.length - a.length);
        return candidates[0] || null;
      });
    }

    if (!caption || caption.trim().length === 0)
      throw new Error('캡션을 찾지 못했습니다. 공개 게시물인지 확인해주세요.');

    caption = caption.replace(/\s+/g, ' ').trim();
    return caption;
  } finally {
    await browser.close();
  }
}

// OpenAI를 이용한 댓글 생성 함수
async function generateComments({ caption, count }) {
  const n = Math.max(1, Math.min(10, Number(count) || 3));

  const sys = `You are a Korean social media copywriter. 
Return ONLY a JSON array of strings (UTF-8), no extra text.`;

  const user = `
인스타그램 캡션:
${caption}

요청:
- 캡션 분위기/내용을 반영한 자연스러운 한국어 댓글 ${n}개를 생성
- 각 댓글은 1~2문장, 존댓말, 20~90자
- 해시태그/이모지/물음표 금지
- 서로 표현/어휘/리듬을 다르게 하여 중복 방지
- JSON 배열만 출력 (예: ["문장1", "문장2", ...])
`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ],
    temperature: 0.8
  });

  const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    // 혹시 JSON 파싱 실패 시 줄 단위로 분리
    return raw.split('\n').map(s => s.trim()).filter(Boolean).slice(0, n);
  }
  return [];
}

// 기본 페이지 (index.html 표시)
app.get('/', (_req, res) => {
  res.sendFile('index.html', { root: './views' });
});

// 댓글 생성 API
app.post('/generate', async (req, res) => {
  try {
    const { link, count } = req.body;
    if (!link) return res.status(400).json({ ok: false, error: '링크를 입력하세요.' });

    const caption = await fetchCaptionFromInstagram(link);
    const comments = await generateComments({ caption, count });

    res.json({ ok: true, caption, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || '서버 오류' });
  }
});

// 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

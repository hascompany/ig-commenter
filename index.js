import 'dotenv/config';
import express from 'express';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('views', './views');
app.use(express.static('views'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 인스타 링크에서 shortcode 추출
function extractShortcode(link) {
  const m = link.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// Puppeteer 대신 og:description 메타태그 API 사용
async function fetchCaptionFromInstagram(link) {
  const shortcode = extractShortcode(link);
  if (!shortcode) throw new Error('유효한 인스타그램 링크가 아닙니다.');

  const url = `https://www.instagram.com/p/${shortcode}/`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('캡션을 불러올 수 없습니다.');

  const html = await res.text();
  const match = html.match(/<meta property="og:description" content="([^"]+)"/);
  if (!match) throw new Error('캡션 메타태그를 찾을 수 없습니다.');

  let caption = match[1];
  const parts = caption.split(':');
  caption = parts.length > 1 ? parts.slice(1).join(':').trim() : caption.trim();

  // ✅ HTML 엔티티 디코더 (10진수 + 16진수 모두 처리)
  const decode = (str) =>
    str
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      // 16진수 &#xXXXX; 형태 처리
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // 10진수 &#1234; 형태 처리
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));

  return decode(caption);
}




// AI 댓글 생성
async function generateComments({ caption, count }) {
  const n = Math.max(1, Math.min(10, Number(count) || 3));
  const sys = `You are a Korean social media copywriter. 
Return ONLY a JSON array of strings, no extra text.`;
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
      { role: 'user', content: user },
    ],
    temperature: 0.8,
  });
  const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return raw.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, n);
  }
  return [];
}

app.get('/', (_req, res) => res.sendFile('index.html', { root: './views' }));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

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

// 캡션 추출 (og:description 메타)
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
  // 종종 'username: 내용' 형식이라 ':' 뒤만 사용
  const parts = caption.split(':');
  caption = parts.length > 1 ? parts.slice(1).join(':').trim() : caption.trim();

  // HTML 엔티티 디코딩
  const decode = (str) =>
    str
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));

  return decode(caption);
}

// AI 댓글 생성 (v10 프롬프트)
async function generateComments({ caption, count }) {
  const n = Math.max(1, Math.min(parseInt(count || '5', 10), 50));

  const systemPrompt = `
You write Instagram comments in natural Korean, like real users, not an AI or a brand.

Rules:
- Friendly 해요/네요체. Never use 합니다/드립니다/바랍니다.
- About half the comments are one sentence, half are two. Vary tone, vocabulary, and endings.
- No generic praise. Avoid overusing 너무 예뻐요, 대박이에요, 멋지네요, 최고예요.
- Stay relevant to the caption; don't invent details.
- Emojis in about 40% of comments, varied in choice and position.
- No hashtags, no exclamation marks.
- Each comment should read as if a different person wrote it.
- Output only the comments, one per line, no numbering or explanations.

Examples of the style:
사진 분위기 너무 좋네요 ☺️
저도 가보고 싶어요. 다음엔 어디 가세요?
`.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Write ${n} comments for this caption:\n${caption}` }
    ],
    temperature: 0.9
  });

  const text = resp.choices?.[0]?.message?.content?.trim() || '';
  // 한 줄에 댓글 하나 (모델이 번호/기호를 붙여도 제거)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

  return lines.slice(0, n);
}

// 기본 페이지
app.get('/', (_req, res) => res.sendFile('index.html', { root: './views' }));

// 댓글 생성 API
app.post('/generate', async (req, res) => {
  try {
    const { link, count } = req.body;
    if (!link) return res.status(400).json({ ok: false, error: '링크를 입력하세요.' });

    const caption = await fetchCaptionFromInstagram(link);
    const comments = await generateComments({ caption, count });
    return res.json({ ok: true, caption, comments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || '서버 오류' });
  }
});

const PORT = process.env.PORT || 10000; // Render free 기본 포트 대응
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

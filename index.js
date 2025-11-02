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

// 📌 인스타 링크에서 shortcode 추출
function extractShortcode(link) {
  const m = link.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// 📌 캡션 추출 (메타태그 기반)
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

  // 🔹 HTML 엔티티 디코딩 (10진 + 16진)
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

// 📌 AI 댓글 생성 (최종 v9 프롬프트 반영)
async function generateComments({ caption, count }) {
  const systemPrompt = `
Write ${count} natural Korean Instagram comments reacting to this caption:

${caption}

Rules:
- Use polite, casual Korean (해요/네요체). No “합니다, 드립니다, 바랍니다.”
- Vary sentence length: about half one sentence, half two sentences.
- Avoid excessive punctuation or exclamation marks.
- About 40% of comments may include emojis naturally if it suits the mood.
`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: systemPrompt }],
    temperature: 0.9,
  });

  const text = resp.choices?.[0]?.message?.content?.trim() || '';
  return text
    .split(/\r?\n|\d+\.\s+/)

    .map((l) => l.replace(/^\d+[\).\s-]*/, '').trim()) // 🔹 넘버링 제거
    .filter(Boolean);
}


// 📌 기본 페이지
app.get('/', (_req, res) => res.sendFile('index.html', { root: './views' }));

// 📌 댓글 생성 요청
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

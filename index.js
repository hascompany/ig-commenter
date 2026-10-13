import 'dotenv/config';
import express from 'express';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import {
  extractShortcode,
  parseCaption,
  parseComments,
  supportsTemperature,
  createRateLimiter
} from './lib.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_LINK_LENGTH = 300;
const FETCH_TIMEOUT_MS = 10000;

const app = express();
app.set('trust proxy', 1); // Render 프록시 뒤에서 실제 IP 사용
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.set('views', './views');
app.use(express.static('views'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 캡션 추출 (og:description 메타)
async function fetchCaptionFromInstagram(link) {
  const shortcode = extractShortcode(link);
  if (!shortcode) throw new Error('유효한 인스타그램 링크가 아닙니다.');

  const url = `https://www.instagram.com/p/${shortcode}/`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error('캡션을 불러올 수 없습니다.');

  const caption = parseCaption(await res.text());
  if (!caption) throw new Error('캡션을 찾을 수 없습니다. 비공개 게시물이거나 접근이 제한되었을 수 있어요.');
  return caption;
}

const SYSTEM_PROMPT = `
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

// AI 댓글 생성
async function generateComments({ caption, count }) {
  const n = Math.max(1, Math.min(parseInt(count || '5', 10) || 5, 50));

  const params = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Write ${n} comments for this caption:\n${caption}` }
    ]
  };
  if (supportsTemperature(MODEL)) params.temperature = 0.9;

  const resp = await openai.chat.completions.create(params);
  return parseComments(resp.choices?.[0]?.message?.content, n);
}

// 기본 페이지
app.get('/', (_req, res) => res.sendFile('index.html', { root: './views' }));

// 댓글 생성 API (IP당 분당 10회)
const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
app.post('/generate', limiter, async (req, res) => {
  try {
    const { link, count } = req.body || {};
    if (!link || typeof link !== 'string') {
      return res.status(400).json({ ok: false, error: '링크를 입력하세요.' });
    }
    if (link.length > MAX_LINK_LENGTH) {
      return res.status(400).json({ ok: false, error: '링크가 너무 깁니다.' });
    }

    const caption = await fetchCaptionFromInstagram(link.trim());
    const comments = await generateComments({ caption, count });
    return res.json({ ok: true, caption, comments });
  } catch (err) {
    console.error(err);
    const msg = err.name === 'TimeoutError' ? '인스타그램 응답이 지연되고 있습니다.' : err.message;
    return res.status(500).json({ ok: false, error: msg || '서버 오류' });
  }
});

const PORT = process.env.PORT || 10000; // Render free 기본 포트 대응
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT} (model: ${MODEL})`));

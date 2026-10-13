# ig-commenter

인스타그램 게시물 링크의 캡션을 읽어 OpenAI로 한국어 댓글을 생성하는 Express 앱.

## 실행
```bash
npm install
cp .env.example .env   # OPENAI_API_KEY 입력
npm start
npm test
```

## 환경변수
| 이름 | 설명 | 기본값 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API 키 (필수) | - |
| `OPENAI_MODEL` | 사용할 모델 | `gpt-4o-mini` |
| `PORT` | 서버 포트 | `10000` |

## API
`POST /generate` `{ link, count }` → `{ ok, caption, comments }`
IP당 분당 10회로 제한됩니다.

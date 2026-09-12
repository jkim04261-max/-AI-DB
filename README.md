# 누리AI 스마트메이커

디자인 시안(모바일/PC 웹)을 기반으로 만든 반응형 홈 화면입니다. React + Vite + TypeScript + Tailwind CSS로 구성되어 있습니다.

## 주요 화면 & 기능

- **홈** (`/`): 검색창, 4개 카테고리 버튼(문서 분석·글 작성·아이디어·사업·업무), 최근 대화, AI 자동 선택 안내
- **대화** (`/chat`, `/chat/:id`): 대화 목록과 채팅 화면 — 메시지를 보내면 실제 Gemini API가 응답을 생성합니다
- **카테고리 상세** (`/category/:id`): 카테고리 설명과 추천 질문 — 클릭하면 바로 새 대화가 시작됩니다
- **템플릿 · 즐겨찾기 · 설정 · 마이페이지**: 기본 레이아웃이 구성된 페이지

모바일에서는 상단 헤더(햄버거 메뉴 + 알림) + 하단 탭바, PC 웹에서는 좌측 사이드바 내비게이션으로 전환됩니다.

## Gemini API 연동

`api/gemini.ts`는 Vercel Serverless Function으로, 브라우저가 아니라 서버에서만 Gemini API 키를 사용합니다.
프론트엔드는 `/api/gemini`를 호출할 뿐, API 키를 직접 다루지 않습니다 — 키가 클라이언트 번들에 노출되지 않습니다.

### 로컬 개발

1. `.env.example`을 `.env.local`로 복사하고 `GEMINI_API_KEY`에 발급받은 키를 채워 넣습니다. (`.env.local`은 git에 커밋되지 않습니다)
2. `/api` 함수까지 함께 로컬에서 띄우려면 `npx vercel dev`로 실행하세요. (`npm run dev`는 Vite만 띄우므로 `/api`가 동작하지 않습니다)

### Vercel 배포

Vercel 프로젝트 → **Settings → Environment Variables**에서 다음을 추가하세요.

| Key | Value | Environment |
| --- | --- | --- |
| `GEMINI_API_KEY` | 발급받은 Gemini API 키 | Production, Preview, Development 모두 체크 |

**주의**: 키 이름 앞에 `VITE_`를 붙이지 마세요. `VITE_` 접두사가 붙은 환경변수는 Vite가 빌드 시 클라이언트 JS 번들에 그대로 심어버려 누구나 브라우저 개발자도구에서 볼 수 있습니다. `GEMINI_API_KEY`는 접두사가 없으므로 서버(Serverless Function) 안에서만 읽히고 클라이언트로는 전달되지 않습니다.

환경변수를 추가/변경한 뒤에는 **Deployments → 최신 배포 → Redeploy**로 다시 배포해야 반영됩니다.

## 개발

```bash
npm install
npm run dev      # Vite 개발 서버 (프론트엔드만)
npx vercel dev   # 프론트엔드 + /api 함수를 함께 로컬 실행
npm run build    # 프로덕션 빌드
npm run lint     # 린트
```

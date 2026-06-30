# 책갈피 — AI 키 배포 가이드

운영자(개발자)의 **Gemini API 키 1개**로 전체 서비스의 AI 첨삭·OCR을 구동합니다.
교사·학생은 키를 입력하지 않습니다.

## ⚠️ 핵심 원칙: 키를 브라우저에 직접 넣지 마세요
정적 사이트의 JS에 키를 박으면 **누구나 개발자도구로 키를 볼 수 있어** 도용·과금 폭탄 위험이 있습니다.
키는 **서버(프록시)에만** 두고, 앱은 그 프록시를 호출합니다.

```
[학생/교사 브라우저] → POST → [내 프록시(키 보관)] → Gemini API
```

## 설정 (둘 중 하나 선택)

### A. Cloudflare Workers (무료·빠름, 권장)
1. `ai-proxy.cloudflare.js` 내용을 새 Worker에 붙여넣기
2. Worker 변수에 `GEMINI_API_KEY` (Secret) 등록
3. 배포 URL을 `index.html`의 `AI_CONFIG.proxyUrl`에 입력

### B. Vercel 서버리스 함수
1. `ai-proxy.vercel.js`를 프로젝트의 `/api/ai-proxy.js`로 배치
2. 환경변수 `GEMINI_API_KEY` 등록
3. `https://<프로젝트>.vercel.app/api/ai-proxy`를 `AI_CONFIG.proxyUrl`에 입력

> Firebase Hosting을 쓴다면 동일 로직을 Cloud Functions로 옮기면 됩니다(07_Firebase 설계 참조).

## index.html 설정
```js
const AI_CONFIG = {
  proxyUrl: 'https://chaek-ai.<계정>.workers.dev', // ← 배포한 프록시 URL
  devKey: ''                                       // ← 배포 빌드에는 비워둘 것!
};
```

## 로컬 테스트(개발자 PC에서만)
프록시 없이 빠르게 시험할 때만 `devKey`에 본인 키를 잠깐 넣습니다.
**배포(공개) 빌드에는 `devKey`를 절대 남기지 마세요.** 비워두면 규칙기반·브라우저 OCR로 자동 폴백합니다.

## 동작 확인
- 키/프록시 설정됨 → 독후감 제출 시 "🤖 진짜 AI" 태그, 사진 OCR에 "제미나이 비전" 태그
- 미설정 → 규칙기반 첨삭 + 브라우저(Tesseract) OCR로 무중단 동작

## 비용·보안 팁
- 프록시의 `ALLOW_ORIGIN`을 본인 사이트 도메인으로 제한
- Gemini 키에 사용량 상한/알림 설정
- 필요 시 프록시에 호출 빈도 제한(rate limit) 추가

# 실시간 DB 마이그레이션 설계 (localStorage → Firebase Firestore)

> 목적: 심사 시연 때 **교사 태블릿 ↔ 학생 패드 실시간 동기화**(학생이 제출 → 교사 화면에 즉시 뜸). 현재 프로토타입은 `localStorage`라 기기 간 공유 안 됨.
> 원칙: **작동 중인 코드를 함부로 갈아엎지 않는다.** 현재 `DB.load/DB.save` + `save()` 단일 seam만 교체하면 되도록 이미 구조화돼 있음. 실제 전환은 무료 Firebase 프로젝트 생성 후.

---

## 1. 왜 Firebase Firestore인가
- **무료 한도**(Spark 플랜): 문서 읽기 5만/일, 쓰기 2만/일, 저장 1GB — 학급/학교 시연·운영에 충분.
- **실시간 리스너**(onSnapshot): 학생 제출 → 교사 화면 자동 갱신(폴링 불필요).
- 서버 코드 없이 클라이언트 SDK만으로 동작(서버리스) → 03 문서의 "Edge-AI·서버리스" 기조 유지.
- 대안: **Supabase**(Postgres+Realtime, 무료 한도). 관계형 선호 시. 본 설계는 Firestore 기준.

## 2. 현재 구조의 교체 지점 (이미 격리돼 있음)
```js
const DB={ load(){...localStorage...}, save(d){...}, reset(){...} };
let db;                       // 메모리 캐시(앱 전체가 이걸 읽음)
function save(){ DB.save(db); refreshChrome(); }   // 변경 후 호출
```
→ **`db`(메모리 모델)와 화면 렌더는 그대로 두고**, `DB.load/save`만 Firestore 연동으로 바꾸면 됨. 즉 UI 코드 수정 거의 0.

## 3. Firestore 데이터 구조(컬렉션 설계)
현재 `db={accounts,reports,challenge,season,balance,topics}` 단일 객체 → 컬렉션으로 분해:
```
schools/{schoolCode}                         // (선택) 학교 메타
classes/{schoolCode_grade_class}             // 학급 = ckey, season/challenge 포함
  accounts/{accId}   {role,name,pw(해시),grade,classNo,points,lvl,wear,badges,...}
  reports/{reportId} {accId,book,body,level,rubric,tRubric,tComment,reviewed,shared,cheers,...}
  topics/{topicId}   {title,book, posts: subcollection}
balanceVotes/{classKey}/{qIndex}             // 밸런스 집계
```
- 학급 단위 컬렉션으로 나누면 **읽기 비용↓**(우리 반/학교만 구독), 보안규칙 단순화.
- 전국 랭킹용 집계는 `aggregates/schoolRanks` 문서에 주기적 합산(또는 Cloud Function).

## 4. 교체 코드 스케치
```js
// firebaseInit.js (CDN modular SDK)
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10/firebase-app.js';
import {getFirestore,doc,getDoc,setDoc,onSnapshot,collection} from '.../firebase-firestore.js';
const app=initializeApp({ /* 콘솔에서 발급한 config */ });
const fs=getFirestore(app);

// 현재 DB 객체를 Firestore 버전으로 교체
const DB={
  async load(){ /* 학급 문서 + 하위 컬렉션을 읽어 db 객체로 합성 */ },
  async save(d){ /* 변경분만 setDoc */ }
};
// 실시간 동기화: 로그인 후 우리 반 reports/accounts 구독
function subscribeClass(classKey){
  onSnapshot(collection(fs,`classes/${classKey}/reports`),snap=>{
    db.reports = snap.docs.map(d=>d.data());
    if(session) render();   // 변경 시 화면 자동 갱신
  });
}
```
- **점진적 전환**: ① 익명 인증(Anonymous Auth)로 시작 → ② 학교/학급/이름/비번 로그인을 Custom Claims 또는 단순 문서 매칭으로. 비번은 해시(bcrypt/Web Crypto) 저장.
- **오프라인**: Firestore 오프라인 캐시 자동 → 네트워크 불안정 교실에서도 동작.

## 5. 보안 규칙(요지)
```
match /classes/{cls}/reports/{r} {
  allow read: if 같은 학급 소속;
  allow create: if 본인(accId)==작성자;
  allow update: if 작성자 본인 || 해당 학급 교사;   // 교사 첨삭/승인
}
```
- 학생은 자기 글만 쓰기, 교사는 학급 글 검토/승인. 개인정보(독후감·이름)는 학급 범위로 제한.

## 6. 단계별 마이그레이션 로드맵
1. **Firebase 프로젝트 생성**(무료) → 웹 앱 등록 → config 발급.
2. `DB.load/save`를 Firestore 비동기 버전으로 교체(부팅을 async로). UI 변경 최소.
3. 로그인 후 `subscribeClass(ckey)`로 실시간 구독 → 교사·학생 기기 자동 동기화.
4. 비번 해시(Web Crypto SHA-256+salt), 보안규칙 적용.
5. 전국 랭킹 집계는 일배치/Function 또는 클라이언트 합산(시연은 시드 데이터로 충분).

## 7. 시연 팁(대회 현장)
- 교사 기기·학생 기기 둘 다 로그인 → 학생이 독후감 제출하면 **교사 '검토' 화면에 실시간 등장** → "AI 초안 → 교사 점수 조정·코멘트 → 최종 승인"을 라이브로 시연(①Human-in-the-Loop과 결합 시 강력).
- 인터넷 불안 대비: 현재 localStorage 버전을 **백업 데모**로 동시 준비(키 없이 즉시 동작).

---
**결론**: 지금은 localStorage로 안정적 시연 가능. Firebase는 위 설계대로 `DB.load/save` seam만 교체하면 UI 손상 없이 실시간 동기화로 확장됨. 프로젝트 생성·config 발급은 운영자님 계정으로 진행 후 함께 연결.

# 테니스 대진표 앱 - Firebase 설정 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `tennis-club`)
4. Google Analytics 설정 (선택사항) → 프로젝트 만들기

## 2. 웹 앱 등록 및 환경변수 설정

1. Firebase Console → 프로젝트 설정 (톱니바퀴 아이콘)
2. "내 앱" 섹션 → 웹 앱(`</>`) 추가
3. 앱 닉네임 입력 → 앱 등록
4. 표시되는 `firebaseConfig` 값을 복사

5. 프로젝트 루트에 `.env` 파일 생성:
```
VITE_FIREBASE_API_KEY=복사한_apiKey
VITE_FIREBASE_AUTH_DOMAIN=복사한_authDomain
VITE_FIREBASE_PROJECT_ID=복사한_projectId
VITE_FIREBASE_STORAGE_BUCKET=복사한_storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID=복사한_messagingSenderId
VITE_FIREBASE_APP_ID=복사한_appId
```

## 3. Authentication 설정

1. Firebase Console → Authentication → 시작하기
2. "이메일/비밀번호" 로그인 → 사용 설정

## 4. Firestore 데이터베이스 설정

1. Firebase Console → Firestore Database → 데이터베이스 만들기
2. "프로덕션 모드에서 시작" 선택
3. 위치 선택 (asia-northeast3 = 서울 권장)

## 5. Firestore 보안 규칙 설정

1. Firebase Console → Firestore Database → 규칙 탭
2. `firestore.rules` 파일 내용을 붙여넣기 → 게시

## 6. 첫 번째 관리자 계정 생성

앱이 처음 실행될 때 관리자가 없으므로, Firebase Console에서 직접 생성합니다:

1. Firebase Console → Authentication → 사용자 → 사용자 추가
   - 이메일과 비밀번호 입력

2. Firebase Console → Firestore Database → 데이터 탭
   - `admins` 컬렉션 만들기
   - 문서 ID: 위에서 만든 이메일 주소
   - 필드 추가:
     - `email` (string): 이메일 주소
     - `name` (string): 관리자 이름
     - `createdAt` (timestamp): 현재 시간

## 7. 개발 서버 실행

```bash
npm install
npm run dev
```

## 8. 배포 (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# public 디렉토리: dist
# SPA 설정: Yes
npm run build
firebase deploy
```

---

## 앱 사용법

### 일반 회원
- 홈 화면에서 다음 경기 확인
- 경기 일정 → 세션 클릭 → 참석/불참 투표
- 투표 마감 전까지 자유롭게 변경 가능

### 관리자
- 로그인 후 모든 기능 접근 가능
- 경기 일정 추가/삭제
- 투표 마감 후에도 참석 여부 변경 가능
- 게스트 추가/삭제
- 대진표 생성 및 재생성
- 경기 스코어 입력
- 다른 관리자 추가/삭제 (관리자 페이지)

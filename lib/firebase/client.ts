import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * Firebase 클라이언트 — RTDB 사용.
 * .env.local 에 NEXT_PUBLIC_FIREBASE_* 채워야 동작.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

let _app: FirebaseApp | null = null;
let _rtdb: Database | null = null;
let _auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }
  if (!firebaseConfig.apiKey) {
    throw new Error('Firebase 설정 누락 — .env.local에 NEXT_PUBLIC_FIREBASE_* 환경변수를 채우세요');
  }
  _app = initializeApp(firebaseConfig);
  return _app;
}

export function getRtdb(): Database {
  if (!_rtdb) _rtdb = getDatabase(getFirebaseApp());
  return _rtdb;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(getFirebaseApp());
  return _auth;
}

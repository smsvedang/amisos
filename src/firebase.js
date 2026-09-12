import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

const missingKeys = requiredKeys.filter((key) => !import.meta.env[key])

if (missingKeys.length) {
  console.error(`Firebase admin panel configuration is incomplete: ${missingKeys.join(', ')}`)
}

export const firebaseConfigError = missingKeys.length
  ? `Missing Vercel environment variables: ${missingKeys.join(', ')}`
  : null

const app = firebaseConfigError
  ? null
  : getApps()[0] || initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })

export const db = app ? getFirestore(app) : null
export const auth = app ? getAuth(app) : null

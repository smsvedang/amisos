import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAb8Y26Yh5CNBFj_XaD-6bfVcwgLUjnDIc',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'emergency-sos-792e6.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'emergency-sos-792e6',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'emergency-sos-792e6.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '368386996468',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:368386996468:web:37f3ce3183e97d894846a1',
}

export const firebaseConfigError = null

const app = getApps()[0] || initializeApp(firebaseConfig)

export const db = app ? getFirestore(app) : null
export const auth = app ? getAuth(app) : null

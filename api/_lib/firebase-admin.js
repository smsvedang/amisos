import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing server environment variable: ${name}`)
  return value
}

function privateKeyFromEnvironment() {
  const value = required('FIREBASE_PRIVATE_KEY').trim()
  const withoutWrappingQuotes = value.replace(/^(['"])(.*)\1$/s, '$2')
  const privateKey = withoutWrappingQuotes.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('FIREBASE_PRIVATE_KEY must contain a complete PEM private key')
  }
  return privateKey
}

const adminApp = getApps()[0] || initializeApp({
  credential: cert({
    projectId: required('FIREBASE_PROJECT_ID').trim(),
    clientEmail: required('FIREBASE_CLIENT_EMAIL').trim(),
    privateKey: privateKeyFromEnvironment(),
  }),
})

export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
export const adminMessaging = getMessaging(adminApp)

export async function verifyBearerToken(request) {
  const authorization = request.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) {
    const error = new Error('Missing Firebase ID token')
    error.statusCode = 401
    throw error
  }
  try {
    return await adminAuth.verifyIdToken(authorization.slice(7))
  } catch (error) {
    error.statusCode = 401
    error.message = 'Invalid Firebase ID token'
    throw error
  }
}

export function methodNotAllowed(response) {
  response.status(405).json({ error: 'Method not allowed' })
}

export function sendError(response, error) {
  const statusCode = error.statusCode || (error.code === 5 ? 503 : 500)
  const message = error.code === 5
    ? 'Firestore database not found. Create the (default) Firestore database in project emergency-sos-792e6 and verify FIREBASE_PROJECT_ID in Vercel.'
    : error.message
  console.error('[api error]', error)
  response.status(statusCode).json({
    error: message || 'Internal server error',
  })
}

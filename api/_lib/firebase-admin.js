import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing server environment variable: ${name}`)
  return value
}

const adminApp = getApps()[0] || initializeApp({
  credential: cert({
    projectId: required('FIREBASE_PROJECT_ID'),
    clientEmail: required('FIREBASE_CLIENT_EMAIL'),
    privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
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
  const statusCode = error.statusCode || 500
  console.error('[api error]', error)
  response.status(statusCode).json({
    error: statusCode === 500 ? (error.message || 'Internal server error') : error.message,
  })
}

import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb, methodNotAllowed, sendError, verifyBearerToken } from './_lib/firebase-admin.js'

function requireAdmin(claims) {
  if (claims.admin !== true) {
    const error = new Error('Admin permission required')
    error.statusCode = 403
    throw error
  }
}

async function sendVerificationEmail(uid) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY is required to send verification emails')
  const customToken = await adminAuth.createCustomToken(uid)
  const signInResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const signInResult = await signInResponse.json()
  if (!signInResponse.ok) throw new Error(signInResult.error?.message || 'Unable to create verification session')
  const emailResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: signInResult.idToken }),
  })
  const emailResult = await emailResponse.json()
  if (!emailResponse.ok) throw new Error(emailResult.error?.message || 'Unable to send verification email')
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return methodNotAllowed(response)

  try {
    const claims = await verifyBearerToken(request)
    requireAdmin(claims)
    const body = request.body || {}

    if (request.method === 'GET') {
      const snapshot = await adminDb.collection('users').get()
      const users = await Promise.all(snapshot.docs.map(async (document) => {
        const data = document.data()
        try {
          const authUser = await adminAuth.getUser(document.id)
          return { id: document.id, ...data, emailVerified: authUser.emailVerified }
        } catch (error) {
          if (error.code !== 'auth/user-not-found') throw error
          return { id: document.id, ...data, emailVerified: false, authAccountMissing: true }
        }
      }))
      const settingsSnapshot = await adminDb.collection('settings').doc('escalation').get()
      return response.status(200).json({ users, settings: settingsSnapshot.data() || { delaySeconds: 15 } })
    }

    if (request.method === 'POST' && body.entity === 'resendVerification') {
      if (!body.uid) return response.status(400).json({ error: 'A user id is required' })
      const authUser = await adminAuth.getUser(body.uid)
      if (authUser.emailVerified) return response.status(400).json({ error: 'This email is already verified' })
      await sendVerificationEmail(body.uid)
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'DELETE') {
      const { collectionName, id } = body
      if (!['users', 'branches', 'departments', 'classes', 'facultyAssignments'].includes(collectionName) || !id) {
        return response.status(400).json({ error: 'A valid collection and record id are required' })
      }
      if (collectionName === 'users') {
        await adminAuth.deleteUser(id).catch((error) => {
          if (error.code !== 'auth/user-not-found') throw error
        })
      }
      await adminDb.collection(collectionName).doc(id).delete()
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'PATCH' && body.entity === 'academic') {
      const { collectionName, id, name, code = '', departmentId = '', branchId = '' } = body
      if (!['branches', 'departments', 'classes'].includes(collectionName) || !id || !String(name).trim()) {
        return response.status(400).json({ error: 'A valid academic collection, id, and name are required' })
      }
      await adminDb.collection(collectionName).doc(id).set({ name: String(name).trim(), code: String(code).trim(), departmentId: String(departmentId).trim(), branchId: String(branchId).trim(), updatedAt: FieldValue.serverTimestamp(), updatedBy: claims.uid }, { merge: true })
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'PATCH' && body.entity === 'settings') {
      const delaySeconds = Number(body.delaySeconds)
      if (!Number.isInteger(delaySeconds) || delaySeconds < 5 || delaySeconds > 3600) {
        return response.status(400).json({ error: 'Escalation delay must be between 5 and 3600 seconds' })
      }
      await adminDb.collection('settings').doc('escalation').set({ delaySeconds, updatedAt: FieldValue.serverTimestamp(), updatedBy: claims.uid }, { merge: true })
      return response.status(200).json({ ok: true, delaySeconds })
    }

    if (request.method === 'PATCH' && body.entity === 'user') {
      const { id, email = '', name, phone = '', department = '', level = 'L1', branchId = '', classId = '', studentId = '', hostel = '', wing = '', roomNumber = '' } = body
      if (!id || !String(name).trim()) return response.status(400).json({ error: 'A user id and name are required' })
      await adminAuth.updateUser(id, { email: String(email).trim() || undefined, displayName: String(name).trim(), phoneNumber: String(phone).trim() || undefined })
      await adminDb.collection('users').doc(id).set({ email: String(email).trim(), name: String(name).trim(), phone: String(phone).trim(), department: String(department).trim(), level: String(level).trim(), branchId: String(branchId).trim(), classId: String(classId).trim(), studentId: String(studentId).trim(), hostel: String(hostel).trim(), wing: String(wing).trim(), roomNumber: String(roomNumber).trim(), updatedAt: FieldValue.serverTimestamp(), updatedBy: claims.uid }, { merge: true })
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'POST' && body.entity === 'academic') {
      const { collectionName, name, code = '', departmentId = '', branchId = '' } = body
      if (!['branches', 'departments', 'classes'].includes(collectionName) || !String(name).trim()) {
        return response.status(400).json({ error: 'A valid academic collection and name are required' })
      }
      const document = {
        name: String(name).trim(),
        code: String(code).trim(),
        departmentId: String(departmentId).trim(),
        branchId: String(branchId).trim(),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: claims.uid,
      }
      const reference = await adminDb.collection(collectionName).add(document)
      return response.status(201).json({
        id: reference.id,
        name: document.name,
        code: document.code,
        departmentId: document.departmentId,
        branchId: document.branchId,
      })
    }

    if (request.method === 'POST') {
      const { email, password, name, role, phone = '', department = '', level = 'L1', branchId = '', classId = '', studentId = '', hostel = '', wing = '', roomNumber = '' } = body
      if (!email || !password || !name || !['student', 'faculty'].includes(role)) {
        return response.status(400).json({ error: 'email, password, name, and role are required' })
      }
      const userRecord = await adminAuth.createUser({ email: email.trim(), password, displayName: name.trim() })
      try {
        await adminDb.collection('users').doc(userRecord.uid).set({
          uid: userRecord.uid,
          email: email.trim(),
          name: name.trim(),
          phone: String(phone).trim(),
          role,
          department: String(department).trim(),
          level: String(level).trim(),
          branchId: String(branchId).trim(),
          classId: String(classId).trim(),
          studentId: String(studentId).trim(),
          hostel: String(hostel).trim(),
          wing: String(wing).trim(),
          roomNumber: String(roomNumber).trim(),
          facultyIds: [],
          createdAt: FieldValue.serverTimestamp(),
        })
      } catch (firestoreError) {
        await adminAuth.deleteUser(userRecord.uid).catch(() => undefined)
        throw firestoreError
      }
      return response.status(201).json({ uid: userRecord.uid, email: userRecord.email, role })
    }

    const { studentUid, facultyUid, level, hostel = '', wing = '', floor = '' } = body
    if (!studentUid || !facultyUid || !level) {
      return response.status(400).json({ error: 'studentUid, facultyUid, and level are required' })
    }
    const [studentSnapshot, facultySnapshot] = await Promise.all([
      adminDb.collection('users').doc(studentUid).get(),
      adminDb.collection('users').doc(facultyUid).get(),
    ])
    if (!studentSnapshot.exists || studentSnapshot.data().role !== 'student') {
      return response.status(404).json({ error: 'Student not found' })
    }
    if (!facultySnapshot.exists || facultySnapshot.data().role !== 'faculty') {
      return response.status(404).json({ error: 'Faculty not found' })
    }
    await adminDb.collection('users').doc(studentUid).set({
      facultyIds: FieldValue.arrayUnion(facultyUid),
      assignment: { level, hostel, wing, floor, assignedAt: new Date().toISOString(), assignedBy: claims.uid },
    }, { merge: true })
    await adminDb.collection('facultyAssignments').add({
      studentUid,
      facultyUid,
      level,
      hostel,
      wing,
      floor,
      assignedAt: FieldValue.serverTimestamp(),
      assignedBy: claims.uid,
    })
    return response.status(200).json({ ok: true })
  } catch (error) {
    return sendError(response, error)
  }
}

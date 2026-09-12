import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb, methodNotAllowed, sendError, verifyBearerToken } from './_lib/firebase-admin.js'

function requireAdmin(claims) {
  if (claims.admin !== true) {
    const error = new Error('Admin permission required')
    error.statusCode = 403
    throw error
  }
}

export default async function handler(request, response) {
  if (!['POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response)

  try {
    const claims = await verifyBearerToken(request)
    requireAdmin(claims)
    const body = request.body || {}

    if (request.method === 'POST') {
      const { email, password, name, role, phone = '', department = '', level = 'campus' } = body
      if (!email || !password || !name || !['student', 'faculty'].includes(role)) {
        return response.status(400).json({ error: 'email, password, name, and role are required' })
      }
      const userRecord = await adminAuth.createUser({ email: email.trim(), password, displayName: name.trim() })
      await adminDb.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: email.trim(),
        name: name.trim(),
        phone: String(phone).trim(),
        role,
        department: String(department).trim(),
        level: String(level).trim(),
        facultyIds: [],
        createdAt: FieldValue.serverTimestamp(),
      })
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

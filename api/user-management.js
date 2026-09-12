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
      const { email, password, name, role, phone = '', department = '', level = 'L1', branchId = '', classId = '', studentId = '', hostel = '', roomNumber = '' } = body
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

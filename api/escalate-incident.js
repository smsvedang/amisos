import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb, adminMessaging, methodNotAllowed, sendError, verifyBearerToken } from './_lib/firebase-admin.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response)

  try {
    const caller = await verifyBearerToken(request)
    const { incidentId } = request.body || {}
    if (!incidentId) return response.status(400).json({ error: 'incidentId is required' })

    const incidentRef = adminDb.collection('incidents').doc(incidentId)
    const snapshot = await incidentRef.get()
    if (!snapshot.exists) return response.status(404).json({ error: 'Incident not found' })
    const incident = snapshot.data()
    if (incident.studentUid !== caller.uid && caller.admin !== true) {
      return response.status(403).json({ error: 'You cannot escalate this incident' })
    }
    if (incident.status !== 'ringing') return response.status(200).json({ escalated: false, status: incident.status })

    const nextAt = incident.nextEscalationAt?.toDate?.()
    if (nextAt && nextAt > new Date()) {
      return response.status(200).json({ escalated: false, remainingSeconds: Math.ceil((nextAt - new Date()) / 1000) })
    }

    const facultyIds = Array.isArray(incident.assignedFacultyIds) ? incident.assignedFacultyIds : []
    const nextIndex = Number(incident.currentFacultyIndex || 0) + 1
    if (nextIndex >= facultyIds.length) {
      await incidentRef.update({ status: 'unanswered', escalationCompletedAt: FieldValue.serverTimestamp() })
      return response.status(200).json({ escalated: false, status: 'unanswered' })
    }

    const facultyId = facultyIds[nextIndex]
    const facultySnapshot = await adminDb.collection('users').doc(facultyId).get()
    const faculty = facultySnapshot.data() || {}
    const token = faculty.fcmToken
    const settingsSnapshot = await adminDb.collection('settings').doc('escalation').get()
    const delaySeconds = Number(settingsSnapshot.data()?.delaySeconds || incident.escalationDelaySeconds || 15)
    await incidentRef.update({
      currentFacultyIndex: nextIndex,
      currentFacultyId: facultyId,
      nextEscalationAt: Timestamp.fromDate(new Date(Date.now() + delaySeconds * 1000)),
    })

    if (typeof token !== 'string' || token.length === 0) {
      return response.status(200).json({ escalated: true, sent: 0, facultyId })
    }
    const result = await adminMessaging.send({
      token,
      notification: {
        title: 'SOS emergency alert',
        body: `${incident.studentName || 'A student'} needs emergency assistance`,
      },
      data: {
        incidentId,
        status: 'ringing',
        facultyName: String(faculty.name || 'Faculty'),
        hostel: String(incident.hostel || ''),
        roomNumber: String(incident.roomNumber || ''),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'sos_alerts',
          priority: 'max',
          sound: 'default',
          visibility: 'public',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          fullScreenIntent: true,
        },
      },
    })
    return response.status(200).json({ escalated: true, sent: result ? 1 : 0, facultyId, delaySeconds })
  } catch (error) {
    return sendError(response, error)
  }
}

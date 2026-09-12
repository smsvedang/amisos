import { FieldPath } from 'firebase-admin/firestore'
import { adminDb, adminMessaging, methodNotAllowed, sendError, verifyBearerToken } from './_lib/firebase-admin.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response)

  try {
    const caller = await verifyBearerToken(request)
    const { incidentId } = request.body || {}
    if (!incidentId || typeof incidentId !== 'string') {
      return response.status(400).json({ error: 'incidentId is required' })
    }

    const incidentRef = adminDb.collection('incidents').doc(incidentId)
    const incidentSnapshot = await incidentRef.get()
    if (!incidentSnapshot.exists) {
      return response.status(404).json({ error: 'Incident not found' })
    }

    const incident = incidentSnapshot.data()
    if (incident.studentUid !== caller.uid && caller.admin !== true) {
      return response.status(403).json({ error: 'You cannot notify this incident' })
    }

    const facultyIds = Array.isArray(incident.assignedFacultyIds) ? incident.assignedFacultyIds : []
    if (facultyIds.length === 0) {
      return response.status(200).json({ sent: 0, message: 'No faculty assigned' })
    }

    const currentFacultyIndex = Number(incident.currentFacultyIndex || 0)
    const currentFacultyId = incident.currentFacultyId || facultyIds[currentFacultyIndex]
    const targetFacultyIds = currentFacultyId ? [currentFacultyId] : facultyIds
    if (!incident.currentFacultyId) {
      await incidentRef.update({ currentFacultyId, currentFacultyIndex })
    }

    const facultySnapshot = await adminDb.collection('users')
      .where(FieldPath.documentId(), 'in', targetFacultyIds.slice(0, 30))
      .get()
    const tokens = facultySnapshot.docs
      .map((document) => document.data().fcmToken)
      .filter((token) => typeof token === 'string' && token.length > 0)

    if (tokens.length === 0) {
      return response.status(200).json({ sent: 0, message: 'Assigned faculty have no FCM tokens' })
    }

    const result = await adminMessaging.sendEachForMulticast({
      tokens,
      notification: {
        title: 'SOS emergency alert',
        body: `${incident.studentName || 'A student'} needs emergency assistance`,
      },
      data: {
        incidentId,
        status: incident.status || 'ringing',
        facultyName: String(facultySnapshot.docs[0]?.data().name || 'Faculty'),
        hostel: String(incident.hostel || ''),
        roomNumber: String(incident.roomNumber || ''),
        latitude: String(incident.latitude ?? ''),
        longitude: String(incident.longitude ?? ''),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'sos_alerts',
          priority: 'max',
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public',
          notificationCount: 1,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          fullScreenIntent: true,
        },
      },
    })

    return response.status(200).json({ sent: result.successCount, failed: result.failureCount })
  } catch (error) {
    return sendError(response, error)
  }
}

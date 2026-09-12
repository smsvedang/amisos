import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { methodNotAllowed, sendError, verifyBearerToken } from './_lib/firebase-admin.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response)

  try {
    const caller = await verifyBearerToken(request)
    const { channelName, uid, role = 'publisher' } = request.body || {}
    const appId = process.env.AGORA_APP_ID
    const appCertificate = process.env.AGORA_APP_CERTIFICATE

    if (!appId || !appCertificate) {
      return response.status(503).json({ error: 'Agora server configuration is missing' })
    }
    if (!channelName || !uid) {
      return response.status(400).json({ error: 'channelName and uid are required' })
    }
    if (!/^[a-zA-Z0-9 !#$%&()+\-:;<=.?@[\]^_{}|~,]{1,64}$/.test(channelName)) {
      return response.status(400).json({ error: 'Invalid channelName' })
    }

    const numericUid = Number(uid)
    const tokenUid = Number.isInteger(numericUid) && numericUid > 0 ? numericUid : caller.uid
    const tokenRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER
    const expiresInSeconds = 900
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expiresInSeconds
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      tokenUid,
      tokenRole,
      privilegeExpiredTs,
      privilegeExpiredTs,
    )

    return response.status(200).json({
      token,
      appId,
      channelName,
      uid: tokenUid,
      expiresAt: privilegeExpiredTs,
    })
  } catch (error) {
    return sendError(response, error)
  }
}

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import './App.css'
import { auth, db, firebaseConfigError } from './firebase'

function formatTime(timestamp) {
  if (!timestamp?.toDate) return 'Pending'
  return timestamp.toDate().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
}

function App() {
  const [incidents, setIncidents] = useState([])
  const [users, setUsers] = useState([])
  const [error, setError] = useState(firebaseConfigError)
  const [adminUser, setAdminUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminUser(null)
        return
      }
      const token = await user.getIdTokenResult(true)
      if (token.claims.admin !== true) {
        await signOut(auth)
        setError('This account is not an admin account.')
        return
      }
      setAdminUser(user)
      setError(null)
    })
  }, [])

  useEffect(() => {
    if (!db || !adminUser) return undefined

    const unsubscribeIncidents = onSnapshot(
      collection(db, 'incidents'),
      (snapshot) => setIncidents(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
      (snapshotError) => setError(snapshotError.message),
    )
    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => setUsers(snapshot.docs.map((document) => ({ uid: document.id, ...document.data() }))),
      (snapshotError) => setError(snapshotError.message),
    )

    return () => {
      unsubscribeIncidents()
      unsubscribeUsers()
    }
  }, [adminUser])

  async function handleLogin(event) {
    event.preventDefault()
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (loginError) {
      setError(loginError.message)
    }
  }

  if (!adminUser) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-icon">SOS</div>
          <p className="eyebrow">Restricted access</p>
          <h1>Admin sign in</h1>
          <p>Use a Firebase account with the <code>admin: true</code> custom claim.</p>
          {error && <div className="error-banner">{error}</div>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary-btn" type="submit">Sign in</button>
        </form>
      </main>
    )
  }

  const faculty = users.filter((user) => user.role === 'faculty')
  const activeIncidents = incidents.filter((incident) => ['ringing', 'answered'].includes(incident.status))
  const answeredIncidents = incidents.filter((incident) => incident.status === 'answered')
  const criticalIncidents = incidents.filter((incident) => incident.status === 'ringing')
  const facultyById = Object.fromEntries(faculty.map((user) => [user.uid, user]))

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon">SOS</div>
          <div><h2>Emergency Desk</h2><small>Campus Control</small></div>
        </div>
        <nav className="nav">
          <button className="nav-item active">Overview</button>
          <button className="nav-item">Incidents</button>
          <button className="nav-item">Responders</button>
          <button className="nav-item">Assignments</button>
          <button className="nav-item">Reports</button>
        </nav>
        <div className="sidebar-card">
          <span>System</span>
          <strong>{error ? 'Needs setup' : 'Live'}</strong>
          <small>{error ? 'Firebase configuration required' : 'Firestore connected'}</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">Admin dashboard</p><h1>Emergency command center</h1></div>
          <div className="topbar-actions"><span className="live-indicator">Live Firestore data</span><button className="ghost-btn" onClick={() => signOut(auth)}>Sign out</button></div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <section className="stats-grid">
          <StatCard label="Active Incidents" value={activeIncidents.length} tone="danger" />
          <StatCard label="Answered" value={answeredIncidents.length} tone="success" />
          <StatCard label="Total Incidents" value={incidents.length} tone="warning" />
          <StatCard label="Unanswered Alerts" value={criticalIncidents.length} tone="danger" />
        </section>

        <section className="content-grid">
          <div className="panel large-panel">
            <div className="panel-header"><h3>Live incidents</h3><span className="record-count">{incidents.length} records</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Incident</th><th>Student</th><th>Location</th><th>Status</th><th>Responder</th><th>Time</th></tr></thead>
                <tbody>
                  {incidents.length === 0 ? (
                    <tr><td colSpan="6" className="empty-state">No incidents in Firestore.</td></tr>
                  ) : incidents.map((incident) => {
                    const responder = facultyById[incident.answeredBy]
                    return <tr key={incident.id}>
                      <td>{incident.id}</td>
                      <td>{incident.studentName || 'Unknown'}</td>
                      <td>{[incident.hostel, incident.wing, incident.roomNumber].filter(Boolean).join(', ') || 'Not provided'}</td>
                      <td><span className={`status-badge ${incident.status || 'unknown'}`}>{incident.status || 'unknown'}</span></td>
                      <td>{responder?.name || incident.answeredBy || 'Unassigned'}</td>
                      <td>{formatTime(incident.createdAt)}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel side-panel">
            <div className="panel-header"><h3>Faculty status</h3><span className="record-count">{faculty.length}</span></div>
            <div className="responder-list">
              {faculty.length === 0 ? <p className="empty-state">No faculty accounts found.</p> : faculty.map((responder) => (
                <div key={responder.uid} className="responder-item">
                  <div className="dot" />
                  <div><strong>{responder.name || responder.email}</strong><small>{responder.department || 'Faculty'}</small></div>
                  <span className="status-pill">{responder.status || 'Available'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function StatCard({ label, value, tone }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>
}

export default App

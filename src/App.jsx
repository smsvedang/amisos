import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import './App.css'
import { auth, db, firebaseConfigError } from './firebase'

const apiCall = async (token, method, body) => {
  const response = await fetch('/api/user-management', {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

function formatTime(timestamp) {
  return timestamp?.toDate ? timestamp.toDate().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) : 'Pending'
}

function App() {
  const [incidents, setIncidents] = useState([])
  const [users, setUsers] = useState([])
    const [error, setError] = useState(null)
  const [adminUser, setAdminUser] = useState(null)
  const [view, setView] = useState('overview')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
    const [facultyForm, setFacultyForm] = useState(emptyFaculty)
    const [studentForm, setStudentForm] = useState(emptyStudent)
    const [academicForm, setAcademicForm] = useState(emptyAcademic)
  const [assignment, setAssignment] = useState({ studentUid: '', facultyUid: '', level: 'hostel', hostel: '', wing: '', floor: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!auth) {
      setError(firebaseConfigError || 'Firebase is not configured for this deployment.')
      return undefined
    }
    return onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) return setAdminUser(null)
        const token = await user.getIdTokenResult(true)
        if (token.claims.admin !== true) {
          await signOut(auth)
          return setError('This account is not an admin account.')
        }
        setAdminUser(user)
        setError(null)
      } catch (authError) {
        setAdminUser(null)
        setError(authError.message || 'Unable to load Firebase admin session.')
      }
    })
  }, [])

  useEffect(() => {
    if (!db || !adminUser) return undefined
    const stopIncidents = onSnapshot(collection(db, 'incidents'), (snapshot) => setIncidents(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))), (snapshotError) => setError(snapshotError.message))
    const stopUsers = onSnapshot(collection(db, 'users'), (snapshot) => setUsers(snapshot.docs.map((document) => ({ uid: document.id, ...document.data() }))), (snapshotError) => setError(snapshotError.message))
    return () => { stopIncidents(); stopUsers() }
  }, [adminUser])

  async function handleLogin(event) {
    event.preventDefault(); setError(null)
    if (!auth) return setError('Firebase is not configured. Add the VITE_FIREBASE_* variables in Vercel and redeploy.')
    try { await signInWithEmailAndPassword(auth, email.trim(), password) } catch (loginError) { setError(loginError.message) }
  }

  async function handleCreateUser(event) {
    event.preventDefault(); setNotice('')
    try {
      await apiCall(await adminUser.getIdToken(), 'POST', form)
      setNotice(`${form.role} account created. Share its login credentials securely.`)
      setForm({ email: '', password: '', name: '', role: 'faculty', phone: '', department: '', level: 'hostel' })
    } catch (requestError) { setError(requestError.message) }
  }

  async function handleAssignment(event) {
    event.preventDefault(); setNotice('')
    try {
      await apiCall(await adminUser.getIdToken(), 'PATCH', assignment)
      setNotice('Faculty assignment saved.')
    } catch (requestError) { setError(requestError.message) }
  }

  if (!adminUser) return <Login error={error} email={email} password={password} setEmail={setEmail} setPassword={setPassword} onSubmit={handleLogin} />

  const faculty = users.filter((user) => user.role === 'faculty')
  const students = users.filter((user) => user.role === 'student')
  const activeIncidents = incidents.filter((incident) => ['ringing', 'answered'].includes(incident.status))
  const answeredIncidents = incidents.filter((incident) => incident.status === 'answered')
  const facultyById = Object.fromEntries(faculty.map((user) => [user.uid, user]))

  return <div className="dashboard-shell">
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-icon">SOS</div><div><h2>Emergency Desk</h2><small>Campus Control</small></div></div>
      <nav className="nav">
        <button className={`nav-item ${view === 'overview' ? 'active' : ''}`} onClick={() => setView('overview')}>Overview</button>
        <button className={`nav-item ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>Users</button>
        <button className={`nav-item ${view === 'assignments' ? 'active' : ''}`} onClick={() => setView('assignments')}>Faculty assignments</button>
      </nav>
      <div className="sidebar-card"><span>System</span><strong>{error ? 'Needs attention' : 'Live'}</strong><small>Firestore connected</small></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div><p className="eyebrow">Admin dashboard</p><h1>{view === 'overview' ? 'Emergency command center' : view === 'users' ? 'User management' : 'Level-wise assignments'}</h1></div><div className="topbar-actions"><span className="live-indicator">Live Firestore</span><button className="ghost-btn" onClick={() => signOut(auth)}>Sign out</button></div></header>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}
      {view === 'overview' && <Overview incidents={incidents} activeIncidents={activeIncidents} answeredIncidents={answeredIncidents} faculty={faculty} facultyById={facultyById} />}
      {view === 'users' && <UsersView users={users} form={form} setForm={setForm} onSubmit={handleCreateUser} />}
      {view === 'assignments' && <AssignmentsView students={students} faculty={faculty} assignment={assignment} setAssignment={setAssignment} onSubmit={handleAssignment} />}
    </main>
  </div>
}

function Login({ error, email, password, setEmail, setPassword, onSubmit }) {
  return <main className="login-shell"><form className="login-card" onSubmit={onSubmit}><div className="brand-icon">SOS</div><p className="eyebrow">Restricted access</p><h1>Admin sign in</h1><p>Use a Firebase account with the <code>admin: true</code> claim.</p>{error && <div className="error-banner">{error}</div>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-btn" type="submit">Sign in</button></form></main>
}

function Overview({ incidents, activeIncidents, answeredIncidents, faculty, facultyById }) {
  return <><section className="stats-grid"><StatCard label="Active incidents" value={activeIncidents.length} tone="danger" /><StatCard label="Answered" value={answeredIncidents.length} tone="success" /><StatCard label="Total incidents" value={incidents.length} tone="warning" /><StatCard label="Faculty" value={faculty.length} tone="success" /></section><section className="content-grid"><div className="panel large-panel"><div className="panel-header"><h3>Live incidents</h3><span className="record-count">{incidents.length} records</span></div><div className="table-wrap"><table><thead><tr><th>Incident</th><th>Student</th><th>Location</th><th>Status</th><th>Responder</th><th>Time</th></tr></thead><tbody>{incidents.length === 0 ? <tr><td colSpan="6" className="empty-state">No incidents in Firestore.</td></tr> : incidents.map((incident) => <tr key={incident.id}><td>{incident.id}</td><td>{incident.studentName || 'Unknown'}</td><td>{[incident.hostel, incident.wing, incident.roomNumber].filter(Boolean).join(', ') || 'Not provided'}</td><td><span className={`status-badge ${incident.status || 'unknown'}`}>{incident.status || 'unknown'}</span></td><td>{facultyById[incident.answeredBy]?.name || incident.answeredBy || 'Unassigned'}</td><td>{formatTime(incident.createdAt)}</td></tr>)}</tbody></table></div></div><div className="panel side-panel"><div className="panel-header"><h3>Faculty status</h3><span className="record-count">{faculty.length}</span></div>{faculty.length === 0 ? <p className="empty-state">No faculty accounts.</p> : faculty.map((user) => <div className="responder-item" key={user.uid}><div className="dot" /><div><strong>{user.name || user.email}</strong><small>{user.level || 'Faculty'}</small></div><span className="status-pill">{user.status || 'Available'}</span></div>)}</div></section></>
}

function UsersView({ users, form, setForm, onSubmit }) {
  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  return <section className="management-grid"><form className="panel form-panel" onSubmit={onSubmit}><div className="panel-header"><h3>Create user</h3></div><label>Name<input value={form.name} onChange={(event) => change('name', event.target.value)} required /></label><label>Email<input type="email" value={form.email} onChange={(event) => change('email', event.target.value)} required /></label><label>Temporary password<input type="password" minLength="6" value={form.password} onChange={(event) => change('password', event.target.value)} required /></label><label>Role<select value={form.role} onChange={(event) => change('role', event.target.value)}><option value="faculty">Faculty</option><option value="student">Student</option></select></label><label>Phone<input value={form.phone} onChange={(event) => change('phone', event.target.value)} /></label><label>Department / class<input value={form.department} onChange={(event) => change('department', event.target.value)} /></label><label>Default level<select value={form.level} onChange={(event) => change('level', event.target.value)}><option value="campus">Campus</option><option value="hostel">Hostel</option><option value="wing">Wing</option><option value="floor">Floor</option></select></label><button className="primary-btn" type="submit">Create Firebase user</button></form><div className="panel"><div className="panel-header"><h3>Registered users</h3><span className="record-count">{users.length}</span></div><div className="user-list">{users.map((user) => <div className="user-row" key={user.uid}><div><strong>{user.name || user.email}</strong><small>{user.email} · {user.role} · {user.level || 'campus'}</small></div><span className="status-pill">{user.role}</span></div>)}</div></div></section>
}

function AssignmentsView({ students, faculty, assignment, setAssignment, onSubmit }) {
  const change = (field, value) => setAssignment((current) => ({ ...current, [field]: value }))
  return <section className="management-grid"><form className="panel form-panel" onSubmit={onSubmit}><div className="panel-header"><h3>Assign faculty</h3></div><label>Student<select value={assignment.studentUid} onChange={(event) => change('studentUid', event.target.value)} required><option value="">Select student</option>{students.map((user) => <option key={user.uid} value={user.uid}>{user.name || user.email}</option>)}</select></label><label>Faculty<select value={assignment.facultyUid} onChange={(event) => change('facultyUid', event.target.value)} required><option value="">Select faculty</option>{faculty.map((user) => <option key={user.uid} value={user.uid}>{user.name || user.email}</option>)}</select></label><label>Assignment level<select value={assignment.level} onChange={(event) => change('level', event.target.value)}><option value="campus">Campus</option><option value="hostel">Hostel</option><option value="wing">Wing</option><option value="floor">Floor</option></select></label><label>Hostel<input value={assignment.hostel} onChange={(event) => change('hostel', event.target.value)} /></label><label>Wing<input value={assignment.wing} onChange={(event) => change('wing', event.target.value)} /></label><label>Floor<input value={assignment.floor} onChange={(event) => change('floor', event.target.value)} /></label><button className="primary-btn" type="submit">Save assignment</button></form><div className="panel assignment-help"><h3>Assignment hierarchy</h3><p>Campus covers every student. Hostel, wing, and floor assignments are stored on the student record and also in the facultyAssignments collection.</p><p>A student SOS includes the assigned faculty IDs. The faculty responder panel only receives incidents containing that faculty UID.</p></div></section>
}

function StatCard({ label, value, tone }) { return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong></article> }
export default App

import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import './App.css'
import { auth, db, firebaseConfigError } from './firebase'

const emptyFaculty = { email: '', password: '', name: '', phone: '', department: '', branchId: '', classId: '', level: 'L1' }
const emptyStudent = { email: '', password: '', name: '', phone: '', studentId: '', department: '', branchId: '', classId: '', hostel: '', wing: '', roomNumber: '' }
const emptyAcademic = { collectionName: 'branches', name: '', code: '' }

async function apiCall(tokenOrPromise, method, body) {
  const token = typeof tokenOrPromise === 'string'
    ? tokenOrPromise
    : await tokenOrPromise
  const options = { method, headers: { Authorization: `Bearer ${token}` } }
  if (method !== 'GET' && method !== 'HEAD') {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const response = await fetch('/api/user-management', options)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Request failed')
  return result
}

function App() {
  const [admin, setAdmin] = useState(null)
  const [error, setError] = useState(firebaseConfigError)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState('overview')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [users, setUsers] = useState([])
  const [incidents, setIncidents] = useState([])
  const [academic, setAcademic] = useState({ branches: [], departments: [], classes: [] })
  const [settings, setSettings] = useState({ delaySeconds: 15 })
  const [facultyForm, setFacultyForm] = useState(emptyFaculty)
  const [studentForm, setStudentForm] = useState(emptyStudent)
  const [academicForm, setAcademicForm] = useState(emptyAcademic)
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) return setAdmin(null)
        const token = await user.getIdTokenResult(true)
        if (token.claims.admin !== true) { await signOut(auth); setError('This account is not an admin account.'); return }
        setAdmin(user); setError(null)
      } catch (authError) { setAdmin(null); setError(authError.message || 'Unable to load admin session.') }
    })
  }, [])

  useEffect(() => {
    if (!db || !admin) return undefined
    const sources = [['incidents', setIncidents], ['branches', (items) => setAcademic((current) => ({ ...current, branches: items }))], ['departments', (items) => setAcademic((current) => ({ ...current, departments: items }))], ['classes', (items) => setAcademic((current) => ({ ...current, classes: items }))]]
    const stops = sources.map(([name, setter]) => onSnapshot(collection(db, name), (snapshot) => setter(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), (snapshotError) => setError(`Could not load ${name}: ${snapshotError.message}`)))
    apiCall(admin.getIdToken(true), 'GET', {}).then((result) => { setUsers(result.users); setSettings(result.settings || { delaySeconds: 15 }) }).catch((requestError) => setError(requestError.message))
    return () => stops.forEach((stop) => stop())
  }, [admin])

  async function login(event) { event.preventDefault(); try { await signInWithEmailAndPassword(auth, email.trim(), password) } catch (loginError) { setError(loginError.message || 'Unable to sign in.') } }
  async function refreshUsers() { const result = await apiCall(admin.getIdToken(true), 'GET', {}); setUsers(result.users) }
  async function createUser(event, role, form, reset) { event.preventDefault(); try { await apiCall(admin.getIdToken(true), 'POST', { ...form, role }); await refreshUsers(); reset(); setNotice(`${role} account created.`) } catch (requestError) { setError(requestError.message) } }
  async function createAcademic(event) { event.preventDefault(); try { await apiCall(admin.getIdToken(true), 'POST', { ...academicForm, entity: 'academic' }); setAcademicForm(emptyAcademic); setNotice('Academic record created.') } catch (requestError) { setError(requestError.message) } }
  async function mutate(action, collectionName, id, record = {}) {
    if (action === 'delete') setDialog({ type: 'delete', collectionName, id, title: 'Delete record?', message: 'This action permanently removes the selected record.' })
    if (action === 'edit') setDialog({ type: 'edit', collectionName, id, record, title: 'Edit record' })
  }
  async function submitDialog(event) {
    event.preventDefault()
    const { type, collectionName, id, record } = dialog
    const form = new FormData(event.currentTarget)
    try {
      const payload = type === 'delete' ? { collectionName, id } : { entity: collectionName === 'users' ? 'user' : 'academic', collectionName, id, ...record, ...Object.fromEntries(form.entries()) }
      await apiCall(admin.getIdToken(true), type === 'delete' ? 'DELETE' : 'PATCH', payload)
      if (collectionName === 'users') await refreshUsers()
      setDialog(null); setNotice(type === 'delete' ? 'Record deleted.' : 'Record updated.')
    } catch (requestError) { setError(requestError.message) }
  }
  async function resendVerification(uid) {
    try { await apiCall(admin.getIdToken(true), 'POST', { entity: 'resendVerification', uid }); setNotice('Verification email sent.') } catch (requestError) { setError(requestError.message) }
  }

  if (!admin) return <Login error={error} email={email} password={password} setEmail={setEmail} setPassword={setPassword} onSubmit={login} />
  const faculty = users.filter((user) => user.role === 'faculty')
  const students = users.filter((user) => user.role === 'student')
  const titles = { overview: 'Operations overview', faculty: 'Faculty management', students: 'Student management', academic: 'Academic structure', assignments: 'Faculty assignments', settings: 'Response settings' }
    return <div className="dashboard-shell"><aside className="sidebar"><div className="brand-block"><div className="brand-icon">SOS</div><div><h2>SOS Campus</h2><small>Administration</small></div></div><div className="nav-label">Workspace</div><nav className="nav">{Object.entries(titles).map(([key, label]) => <button className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => setView(key)} key={key}><span className="nav-dot" />{label}</button>)}</nav><div className="sidebar-card"><span>System status</span><strong>{error ? 'Needs attention' : 'Operational'}</strong><small>Live Firestore data</small></div></aside><main className="main-panel"><header className="topbar"><div><p className="eyebrow">Admin console</p><h1>{titles[view]}</h1><p className="subheading">Manage campus access, academic structure, and emergency response coverage.</p></div><div className="topbar-actions"><span className="live-indicator"><i /> Live</span><button className="ghost-btn" onClick={() => signOut(auth)}>Sign out</button></div></header>{error && <div className="error-banner">{error}</div>}{notice && <div className="success-banner">{notice}</div>}{view === 'overview' && <Overview incidents={incidents} faculty={faculty} students={students} />}{view === 'faculty' && <UserManagement kind="faculty" users={faculty} form={facultyForm} setForm={setFacultyForm} onSubmit={(event) => createUser(event, 'faculty', facultyForm, () => setFacultyForm(emptyFaculty))} academic={academic} onMutate={mutate} onResend={resendVerification} />}{view === 'students' && <UserManagement kind="student" users={students} form={studentForm} setForm={setStudentForm} onSubmit={(event) => createUser(event, 'student', studentForm, () => setStudentForm(emptyStudent))} academic={academic} onMutate={mutate} onResend={resendVerification} />}{view === 'academic' && <AcademicManagement form={academicForm} setForm={setAcademicForm} onSubmit={createAcademic} academic={academic} onMutate={mutate} />}{view === 'assignments' && <Assignments users={users} admin={admin} />}{view === 'settings' && <SettingsView settings={settings} onSave={async (delaySeconds) => { try { await apiCall(admin.getIdToken(true), 'PATCH', { entity: 'settings', delaySeconds }); setSettings({ delaySeconds }); setNotice('Escalation timing saved.') } catch (requestError) { setError(requestError.message) } }} />}</main>{dialog && <Dialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={submitDialog} />}</div>
}

function SettingsView({ settings, onSave }) { const [delaySeconds, setDelaySeconds] = useState(settings.delaySeconds || 15); return <section className="management-grid"><form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); onSave(Number(delaySeconds)) }}><PanelHeader title="Escalation timing" count="Applies to new SOS incidents" /><Field label="Seconds before next faculty"><input type="number" min="5" max="3600" value={delaySeconds} onChange={(event) => setDelaySeconds(event.target.value)} required /></Field><button className="primary-btn">Save timing</button></form><div className="panel"><PanelHeader title="Current policy" count="Live server setting" /><p className="muted">If the current faculty does not accept, the next assigned level receives the alert after the configured delay.</p></div></section> }
function Login({ error, email, password, setEmail, setPassword, onSubmit }) { return <main className="login-shell"><form className="login-card" onSubmit={onSubmit}><div className="brand-icon">SOS</div><p className="eyebrow">Restricted access</p><h1>Welcome back</h1>{error && <div className="error-banner">{error}</div>}<Field label="Email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field><Field label="Password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field><button className="primary-btn">Sign in to console</button></form></main> }
function Overview({ incidents, faculty, students }) { return <><section className="stats-grid"><Stat label="Active incidents" value={incidents.filter((item) => item.assignedFacultyIds?.length > 0 && ['ringing', 'answered'].includes(item.status)).length} /><Stat label="Faculty" value={faculty.length} /><Stat label="Students" value={students.length} /><Stat label="Total incidents" value={incidents.length} /></section><section className="panel"><PanelHeader title="Live incidents" count={`${incidents.length} records`} /><div className="table-wrap"><table><thead><tr><th>Student</th><th>GPS</th><th>Status</th></tr></thead><tbody>{incidents.map((incident) => { const assigned = incident.assignedFacultyIds?.length > 0; return <tr key={incident.id}><td>{incident.studentName || 'Unknown'}</td><td>{incident.latitude && incident.longitude ? `${Number(incident.latitude).toFixed(5)}, ${Number(incident.longitude).toFixed(5)}` : 'Waiting for GPS'}</td><td><span className={`status-badge ${assigned ? incident.status || 'unknown' : 'waiting'}`}>{assigned ? incident.status || 'unknown' : 'waiting for faculty'}</span></td></tr> })}</tbody></table></div></section></> }
function UserManagement({ kind, users, form, setForm, onSubmit, academic, onMutate, onResend }) { const faculty = kind === 'faculty'; const change = (field, value) => setForm((current) => ({ ...current, [field]: value })); return <section className="management-grid"><form className="panel form-panel" onSubmit={onSubmit}><PanelHeader title={`Create ${kind} account`} count="Required fields marked *" /><Field label="Full name *"><input value={form.name} onChange={(event) => change('name', event.target.value)} required /></Field><Field label="Email *"><input type="email" value={form.email} onChange={(event) => change('email', event.target.value)} required /></Field><Field label="Temporary password *"><input type="password" minLength="6" value={form.password} onChange={(event) => change('password', event.target.value)} required /></Field><Field label="Phone"><input value={form.phone} onChange={(event) => change('phone', event.target.value)} /></Field>{faculty ? <Field label="Faculty level"><select value={form.level} onChange={(event) => change('level', event.target.value)}>{['L1', 'L2', 'L3', 'L4', 'L5'].map((level) => <option key={level}>{level}</option>)}</select></Field> : <Field label="Student ID *"><input value={form.studentId} onChange={(event) => change('studentId', event.target.value)} required /></Field>}<Field label="Department"><AcademicSelect value={form.department} onChange={(value) => change('department', value)} items={academic.departments} /></Field><Field label="Branch"><AcademicSelect value={form.branchId} onChange={(value) => change('branchId', value)} items={academic.branches} /></Field><Field label="Class"><AcademicSelect value={form.classId} onChange={(value) => change('classId', value)} items={academic.classes} /></Field>{!faculty && <><Field label="Hostel"><input value={form.hostel} onChange={(event) => change('hostel', event.target.value)} /></Field><Field label="Wing"><input value={form.wing} onChange={(event) => change('wing', event.target.value)} /></Field><Field label="Room number"><input value={form.roomNumber} onChange={(event) => change('roomNumber', event.target.value)} /></Field></>}<button className="primary-btn">Create {kind} account</button></form><RecordList title={`Registered ${kind}`} records={users} kind={kind} onMutate={onMutate} onResend={onResend} /></section> }
function AcademicManagement({ form, setForm, onSubmit, academic, onMutate }) { const labels = { branches: 'Branch', departments: 'Department', classes: 'Class' }; const change = (field, value) => setForm((current) => ({ ...current, [field]: value })); return <section className="management-grid"><form className="panel form-panel" onSubmit={onSubmit}><PanelHeader title="Add academic record" count="Live directory" /><Field label="Record type"><select value={form.collectionName} onChange={(event) => change('collectionName', event.target.value)}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label={`${labels[form.collectionName]} name *`}><input value={form.name} onChange={(event) => change('name', event.target.value)} required /></Field><Field label="Code"><input value={form.code} onChange={(event) => change('code', event.target.value)} /></Field><button className="primary-btn">Add record</button></form><div className="panel"><PanelHeader title="Academic directory" count="Live records" />{Object.entries(labels).map(([name, label]) => <div className="directory-section" key={name}><h3>{label}s</h3>{academic[name].map((item) => <div className="directory-row" key={item.id}><strong>{item.name}</strong><div className="row-actions"><button className="icon-btn" onClick={() => onMutate('edit', name, item.id, item)}>Edit</button><button className="icon-btn danger-btn" onClick={() => onMutate('delete', name, item.id)}>Delete</button></div></div>)}</div>)}</div></section> }
function RecordList({ title, records, kind, onMutate, onResend }) { return <div className="panel"><PanelHeader title={title} count={`${records.length} records`} /><div className="user-list">{records.map((record) => <div className="user-row" key={record.uid}><div><strong>{record.name || record.email}</strong><small>{record.email || 'No email'}</small><span className={`verification ${record.emailVerified ? 'verified' : 'unverified'}`}>{record.emailVerified ? 'Email verified' : record.authAccountMissing ? 'Auth account missing' : 'Email not verified'}</span></div><div className="row-actions"><span className="status-pill">{kind === 'faculty' ? record.level || 'L1' : record.studentId || 'Student'}</span>{!record.emailVerified && !record.authAccountMissing && <button className="icon-btn" onClick={() => onResend(record.uid)}>Resend email link</button>}<button className="icon-btn" onClick={() => onMutate('edit', 'users', record.uid, record)}>Edit</button><button className="icon-btn danger-btn" onClick={() => onMutate('delete', 'users', record.uid)}>Delete</button></div></div>)}</div></div> }

function Dialog({ dialog, onClose, onSubmit }) { if (dialog.type === 'delete') return <div className="dialog-backdrop"><div className="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p><div className="dialog-actions"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary-btn danger-solid" onClick={onSubmit}>Delete</button></div></div></div>; const fields = [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['department', 'Department'], ['level', 'Faculty level'], ['studentId', 'Student ID'], ['branchId', 'Branch'], ['classId', 'Class'], ['hostel', 'Hostel'], ['wing', 'Wing'], ['roomNumber', 'Room number']]; return <div className="dialog-backdrop"><form className="dialog form-panel" onSubmit={onSubmit}><h2>{dialog.title}</h2>{fields.map(([name, label]) => <Field label={label} key={name}><input name={name} type={name === 'email' ? 'email' : 'text'} defaultValue={dialog.record[name] || ''} required={name === 'name' || name === 'email'} /></Field>)}<div className="dialog-actions"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary-btn">Save changes</button></div></form></div> }
function Assignments({ users, admin }) { const students = users.filter((user) => user.role === 'student'); const faculty = users.filter((user) => user.role === 'faculty'); const [form, setForm] = useState({ studentUid: '', facultyUid: '', level: 'campus' }); const [message, setMessage] = useState(''); async function submit(event) { event.preventDefault(); try { await apiCall(admin.getIdToken(true), 'PATCH', form); setMessage('Faculty assignment saved.') } catch (assignmentError) { setMessage(assignmentError.message) } } return <section className="management-grid"><form className="panel form-panel" onSubmit={submit}><PanelHeader title="Assign faculty" count="Responder coverage" /><Field label="Student"><select value={form.studentUid} onChange={(event) => setForm({ ...form, studentUid: event.target.value })} required><option value="">Select student</option>{students.map((user) => <option key={user.uid} value={user.uid}>{user.name || user.email}</option>)}</select></Field><Field label="Faculty"><select value={form.facultyUid} onChange={(event) => setForm({ ...form, facultyUid: event.target.value })} required><option value="">Select faculty</option>{faculty.map((user) => <option key={user.uid} value={user.uid}>{user.name || user.email}</option>)}</select></Field><button className="primary-btn">Save assignment</button>{message && <p className="muted">{message}</p>}</form><div className="panel"><PanelHeader title="Student placement" count={`${students.length} students`} />{students.map((student) => <div className="directory-row" key={student.uid}><strong>{student.name || student.email}</strong><small>{student.branchId || 'No branch'} · {student.classId || 'No class'} · {student.facultyIds?.length || 0} faculty</small></div>)}</div></section> }
function AcademicSelect({ value, onChange, items }) { return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select record</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> }
function Field({ label, children }) { return <label>{label}{children}</label> }
function PanelHeader({ title, count }) { return <div className="panel-header"><h2>{title}</h2><span className="record-count">{count}</span></div> }
function Stat({ label, value }) { return <article className="stat-card blue"><span>{label}</span><strong>{value}</strong></article> }
export default App

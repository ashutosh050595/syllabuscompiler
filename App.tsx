
import React, { useState, useEffect, useRef } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission } from './types';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import { SCHOOL_NAME, INITIAL_TEACHERS, getCurrentWeekMonday, getNextWeekMonday, SCHOOL_LOGO_URL, PORTAL_LINK } from './constants';
import { generateSyllabusPDF } from './services/pdfService';

const App: React.FC = () => {
  const [user, setUser] = useState<Teacher | { email: string; isAdmin: true } | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [syncUrl, setSyncUrl] = useState<string>('');
  const [logoLoaded, setLogoLoaded] = useState(true);
  
  const teachersRef = useRef<Teacher[]>([]);
  const submissionsRef = useRef<WeeklySubmission[]>([]);
  const syncUrlRef = useRef<string>('');

  useEffect(() => {
    try {
      const savedTeachers = localStorage.getItem('sh_teachers_v4');
      const savedSubmissions = localStorage.getItem('sh_submissions_v2');
      const savedSyncUrl = localStorage.getItem('sh_sync_url');
      const savedUser = sessionStorage.getItem('sh_user');
      
      const initialTeachers = savedTeachers ? JSON.parse(savedTeachers) : INITIAL_TEACHERS;
      const initialSubmissions = savedSubmissions ? JSON.parse(savedSubmissions) : [];
      
      setTeachers(initialTeachers);
      teachersRef.current = initialTeachers;
      
      setSubmissions(initialSubmissions);
      submissionsRef.current = initialSubmissions;
      
      if (savedSyncUrl) {
        setSyncUrl(savedSyncUrl);
        syncUrlRef.current = savedSyncUrl;
      }

      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          sessionStorage.removeItem('sh_user');
        }
      }
    } catch (error) {
      console.error("Failed to load local storage data:", error);
      setTeachers(INITIAL_TEACHERS);
      teachersRef.current = INITIAL_TEACHERS;
    }
  }, []);

  const syncRegistryToCloud = async (currentTeachers: Teacher[]) => {
    const url = syncUrlRef.current || syncUrl;
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_REGISTRY', teachers: currentTeachers })
      });
      console.log("Cloud Registry Updated Successfully");
    } catch (err) {
      console.error("Cloud Registry Sync Failed", err);
    }
  };

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(newTeachers));
    syncRegistryToCloud(newTeachers);
  };

  const handleLogin = (u: Teacher | { email: string; isAdmin: true }) => {
    setUser(u);
    sessionStorage.setItem('sh_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('sh_user');
  };

  const updateSyncUrl = (url: string) => {
    setSyncUrl(url);
    syncUrlRef.current = url;
    localStorage.setItem('sh_sync_url', url);
    if (teachersRef.current.length > 0) syncRegistryToCloud(teachersRef.current);
  };

  const updateSubmissions = async (newSubs: WeeklySubmission[]) => {
    setSubmissions(newSubs);
    submissionsRef.current = newSubs;
    localStorage.setItem('sh_submissions_v2', JSON.stringify(newSubs));

    const latestSub = newSubs[newSubs.length - 1];
    if (syncUrlRef.current && latestSub) {
      try {
        await fetch(syncUrlRef.current, {
          method: 'POST',
          mode: 'no-cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...latestSub, action: 'SUBMIT_PLAN' })
        });
      } catch (err) {
        console.error("Sync failed:", err);
      }
    }
  };

  const triggerWarningEmails = async (defaulters: { name: string, email: string }[], weekStarting?: string) => {
    const url = syncUrlRef.current || syncUrl;
    if (!url) {
      alert("Deployment URL not set.");
      return;
    }
    const week = weekStarting || getNextWeekMonday();
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SEND_WARNINGS', defaulters, weekStarting: week, portalLink: PORTAL_LINK })
      });
      // Removed alert to prevent blocking batch processes
      return true;
    } catch (err) {
      console.error("Email warning error:", err);
      return false;
    }
  };

  const triggerCompiledPdfEmail = async (pdfBase64: string, recipient: string, className: string, filename: string) => {
    const url = syncUrlRef.current || syncUrl;
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SEND_COMPILED_PDF', pdfBase64, recipient, className, filename, weekStarting: getNextWeekMonday() })
      });
      // Removed alert to prevent blocking batch processes
      return true;
    } catch (err) {
      console.error("PDF delivery error:", err);
      return false;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center overflow-hidden">
              {logoLoaded ? (
                <img src={SCHOOL_LOGO_URL} alt="SHS" className="w-full h-full object-contain" onError={() => setLogoLoaded(false)} />
              ) : (
                <i className="fas fa-school text-blue-600 text-2xl"></i>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black text-blue-800 tracking-tight leading-none uppercase">{SCHOOL_NAME}</h1>
              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">Jhumri Telaiya, Estd. 1997</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-gray-800">{'name' in user ? user.name : 'Administrator'}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.email}</p>
              </div>
              <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                <i className="fas fa-power-off"></i>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {!user ? (
            <Login onLogin={handleLogin} teachers={teachers} />
          ) : 'isAdmin' in user ? (
            <AdminDashboard 
              teachers={teachers} setTeachers={updateTeachers}
              submissions={submissions} setSubmissions={updateSubmissions}
              syncUrl={syncUrl} setSyncUrl={updateSyncUrl}
              onSendWarnings={triggerWarningEmails} onSendPdf={triggerCompiledPdfEmail}
            />
          ) : (
            <TeacherDashboard 
              teacher={user as Teacher} submissions={submissions} setSubmissions={updateSubmissions}
              allSubmissions={submissions} isCloudEnabled={!!syncUrl}
              syncUrl={syncUrl} setSyncUrl={updateSyncUrl}
              onSendWarnings={triggerWarningEmails} onSendPdf={triggerCompiledPdfEmail}
            />
          )}
        </div>
      </main>

      <footer className="bg-white py-12 px-4 border-t border-gray-100 mt-20">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <div className="w-12 h-12 mx-auto grayscale opacity-30 flex items-center justify-center">
             <i className="fas fa-school text-3xl"></i>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Designed and developed by ASHUTOSH KUMAR GAUTAM</p>
            <p className="text-[10px] text-gray-300 font-bold mt-1">{SCHOOL_NAME}, Jhumri Telaiya</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

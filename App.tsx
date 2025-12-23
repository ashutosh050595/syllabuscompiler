
import React, { useState, useEffect, useRef } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, ResubmitRequest } from './types';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import { SCHOOL_NAME, INITIAL_TEACHERS, getCurrentWeekMonday, getNextWeekMonday, SCHOOL_LOGO_URL, PORTAL_LINK, DEFAULT_SYNC_URL } from './constants';

const App: React.FC = () => {
  const [user, setUser] = useState<Teacher | { email: string; isAdmin: true } | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [resubmitRequests, setResubmitRequests] = useState<ResubmitRequest[]>([]);
  const [syncUrl, setSyncUrl] = useState<string>('');
  const [logoLoaded, setLogoLoaded] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const teachersRef = useRef<Teacher[]>([]);
  const syncUrlRef = useRef<string>('');

  // Helper to post data to cloud - NO-CORS MODE for reliability
  const cloudPost = async (url: string, payload: any) => {
    if (!url || !url.startsWith('http')) return false;
    console.log("Posting to cloud:", payload.action);
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      console.log("Cloud request sent (opaque response)");
      return true;
    } catch (err) {
      console.error("Cloud Error:", err);
      return false; 
    }
  };

  // Helper to fetch registry - GET requests
  const fetchRegistryFromCloud = async (url: string): Promise<boolean> => {
    if (!url || !url.startsWith('http')) return false;
    try {
      // CACHE BUSTING: Append timestamp to force fresh fetch from Google Sheets
      const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      
      const response = await fetch(fetchUrl, { redirect: 'follow' }); 
      const data = await response.json();
      
      if (data.result === 'success') {
        // 1. Update Teachers
        if (data.teachers && Array.isArray(data.teachers) && data.teachers.length > 0) {
          setTeachers(data.teachers);
          teachersRef.current = data.teachers;
          localStorage.setItem('sh_teachers_v4', JSON.stringify(data.teachers));
        } 
        else {
          console.log("Cloud registry is empty. Auto-seeding...");
          await cloudPost(url, { 
            action: 'SYNC_REGISTRY', 
            teachers: INITIAL_TEACHERS 
          });
          setTeachers(INITIAL_TEACHERS);
          teachersRef.current = INITIAL_TEACHERS;
        }

        // 2. Update Requests
        if (data.requests && Array.isArray(data.requests)) {
          setResubmitRequests(data.requests);
          localStorage.setItem('sh_resubmit_requests', JSON.stringify(data.requests));
        }

        // 3. Update Submissions (This fixes the sync issue across devices)
        if (data.submissions && Array.isArray(data.submissions)) {
          console.log("Synced submissions from cloud:", data.submissions.length);
          setSubmissions(data.submissions);
          localStorage.setItem('sh_submissions_v2', JSON.stringify(data.submissions));
        }

        return true;
      }
      return false;
    } catch (err) {
      console.debug("Cloud fetch unavailable:", err);
      return false;
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const savedTeachers = localStorage.getItem('sh_teachers_v4');
        const savedSubmissions = localStorage.getItem('sh_submissions_v2');
        const savedRequests = localStorage.getItem('sh_resubmit_requests');
        const savedUser = sessionStorage.getItem('sh_user');
        
        const params = new URLSearchParams(window.location.search);
        const urlParam = params.get('sync');
        
        let activeSyncUrl = urlParam || DEFAULT_SYNC_URL;
        
        if (urlParam) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        setSyncUrl(activeSyncUrl);
        syncUrlRef.current = activeSyncUrl;
        localStorage.setItem('sh_sync_url', activeSyncUrl);

        // Load local data first
        const initialTeachers = savedTeachers ? JSON.parse(savedTeachers) : INITIAL_TEACHERS;
        setTeachers(initialTeachers);
        teachersRef.current = initialTeachers;
        
        setSubmissions(savedSubmissions ? JSON.parse(savedSubmissions) : []);
        setResubmitRequests(savedRequests ? JSON.parse(savedRequests) : []);

        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch (e) {
            sessionStorage.removeItem('sh_user');
          }
        }

        // Try to fetch/sync with cloud
        if (activeSyncUrl && activeSyncUrl.startsWith('http')) {
          await fetchRegistryFromCloud(activeSyncUrl);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  const updateSubmissions = async (newSubs: WeeklySubmission[]) => {
    setSubmissions(newSubs);
    localStorage.setItem('sh_submissions_v2', JSON.stringify(newSubs));

    const latestSub = newSubs[newSubs.length - 1];
    if (syncUrlRef.current && latestSub && syncUrlRef.current.startsWith('http')) {
      await cloudPost(syncUrlRef.current, { ...latestSub, action: 'SUBMIT_PLAN' });
    }
  };

  const handleRequestResubmit = async (req: ResubmitRequest) => {
    const updated = [...resubmitRequests, req];
    setResubmitRequests(updated);
    localStorage.setItem('sh_resubmit_requests', JSON.stringify(updated));
    if (syncUrlRef.current) {
      await cloudPost(syncUrlRef.current, { ...req, action: 'REQUEST_RESUBMIT' });
    }
  };

  const handleApproveResubmit = async (requestId: string) => {
    const request = resubmitRequests.find(r => r.id === requestId);
    if (!request) return;

    // 1. Delete previous response locally
    const filteredSubmissions = submissions.filter(s => 
      !(s.teacherId === request.teacherId && s.weekStarting === request.weekStarting)
    );
    setSubmissions(filteredSubmissions);
    localStorage.setItem('sh_submissions_v2', JSON.stringify(filteredSubmissions));

    // 2. Update request status locally
    const updatedRequests = resubmitRequests.map(r => 
      r.id === requestId ? { ...r, status: 'approved' as const } : r
    );
    setResubmitRequests(updatedRequests);
    localStorage.setItem('sh_resubmit_requests', JSON.stringify(updatedRequests));

    // 3. Update Cloud & Send Confirmation Mail
    if (syncUrlRef.current) {
      await cloudPost(syncUrlRef.current, { 
        action: 'APPROVE_RESUBMIT', 
        requestId: request.id,
        teacherEmail: request.teacherEmail,
        teacherName: request.teacherName,
        weekStarting: request.weekStarting 
      });
    }
  };

  const handleForceReset = async (teacherId: string, week: string) => {
    const sub = submissions.find(s => s.teacherId === teacherId && s.weekStarting === week);
    if (!sub) return;

    const filtered = submissions.filter(s => s !== sub);
    setSubmissions(filtered);
    localStorage.setItem('sh_submissions_v2', JSON.stringify(filtered));

    if (syncUrlRef.current) {
      await cloudPost(syncUrlRef.current, {
        action: 'RESET_SUBMISSION',
        teacherEmail: sub.teacherEmail,
        teacherName: sub.teacherName,
        weekStarting: week
      });
    }
  };

  const handleForceResetAll = async (week: string) => {
    const filtered = submissions.filter(s => s.weekStarting !== week);
    setSubmissions(filtered);
    localStorage.setItem('sh_submissions_v2', JSON.stringify(filtered));

    if (syncUrlRef.current) {
      const targets = submissions.filter(s => s.weekStarting === week);
      for (const t of targets) {
        await cloudPost(syncUrlRef.current, {
          action: 'RESET_SUBMISSION',
          teacherEmail: t.teacherEmail,
          teacherName: t.teacherName,
          weekStarting: week
        });
      }
    }
  };

  const syncRegistryToCloud = async (currentTeachers: Teacher[]) => {
    return await cloudPost(syncUrlRef.current || syncUrl, { 
      action: 'SYNC_REGISTRY', 
      teachers: currentTeachers 
    });
  };

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(newTeachers));
    syncRegistryToCloud(newTeachers);
  };

  const handleManualResetRegistry = async () => {
    setTeachers(INITIAL_TEACHERS);
    teachersRef.current = INITIAL_TEACHERS;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(INITIAL_TEACHERS));
    if (syncUrlRef.current) {
      await syncRegistryToCloud(INITIAL_TEACHERS);
      alert("Database restored to defaults and uploading to cloud...");
    } else {
      alert("Local database restored.");
    }
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

  const triggerWarningEmails = async (defaulters: { name: string, email: string }[], weekStarting?: string) => {
    const week = weekStarting || getNextWeekMonday();
    return await cloudPost(syncUrlRef.current || syncUrl, { 
      action: 'SEND_WARNINGS', 
      defaulters, 
      weekStarting: week, 
      portalLink: PORTAL_LINK 
    });
  };

  const triggerCompiledPdfEmail = async (pdfBase64: string, recipient: string, className: string, filename: string) => {
    return await cloudPost(syncUrlRef.current || syncUrl, { 
      action: 'SEND_COMPILED_PDF', 
      pdfBase64, 
      recipient, 
      className, 
      filename, 
      weekStarting: getNextWeekMonday() 
    });
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-600">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
          <p className="text-white font-black uppercase tracking-widest text-[10px]">Verifying School Connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-50 rounded-2xl flex items-center justify-center overflow-hidden">
              {logoLoaded ? (
                <img src={SCHOOL_LOGO_URL} alt="SHS" className="w-full h-full object-contain" onError={() => setLogoLoaded(false)} />
              ) : (
                <i className="fas fa-school text-blue-600 text-xl md:text-2xl"></i>
              )}
            </div>
            <div>
              <h1 className="text-sm md:text-xl font-black text-blue-800 tracking-tight leading-none uppercase">{SCHOOL_NAME}</h1>
              <p className="text-[8px] md:text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">Jhumri Telaiya, Estd. 1997</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center space-x-3 md:space-x-4">
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
            <Login 
              onLogin={handleLogin} 
              teachers={teachers} 
              onSyncRegistry={fetchRegistryFromCloud} 
              syncUrl={syncUrl} 
            />
          ) : 'isAdmin' in user ? (
            <AdminDashboard 
              teachers={teachers} setTeachers={updateTeachers}
              submissions={submissions} setSubmissions={updateSubmissions}
              resubmitRequests={resubmitRequests} onApproveResubmit={handleApproveResubmit}
              syncUrl={syncUrl} setSyncUrl={updateSyncUrl}
              onSendWarnings={triggerWarningEmails} onSendPdf={triggerCompiledPdfEmail}
              onResetRegistry={handleManualResetRegistry}
              onForceReset={handleForceReset}
              onForceResetAll={handleForceResetAll}
              onRefreshData={() => fetchRegistryFromCloud(syncUrl)}
            />
          ) : (
            <TeacherDashboard 
              teacher={user as Teacher} 
              teachers={teachers}
              submissions={submissions} setSubmissions={updateSubmissions}
              allSubmissions={submissions} isCloudEnabled={!!syncUrl}
              syncUrl={syncUrl} setSyncUrl={updateSyncUrl}
              onSendWarnings={triggerWarningEmails} onSendPdf={triggerCompiledPdfEmail}
              onResubmitRequest={handleRequestResubmit}
              resubmitRequests={resubmitRequests}
            />
          )}
        </div>
      </main>

      <footer className="bg-white py-12 px-4 border-t border-gray-100 mt-20">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <div className="w-12 h-12 mx-auto grayscale opacity-30 flex items-center justify-center">
             <i className="fas fa-school text-3xl"></i>
          </div>
          <div className="space-y-2">
            <p className="text-[12px] md:text-sm font-black text-gray-900 uppercase tracking-[0.2em]">Designed and developed by ASHUTOSH KUMAR GAUTAM</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest opacity-80">{SCHOOL_NAME}, Jhumri Telaiya</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

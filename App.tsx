import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showNotification, setShowNotification] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  
  const teachersRef = useRef<Teacher[]>([]);
  const syncUrlRef = useRef<string>('');

  // Enhanced cloud POST using URLSearchParams for best cross-device compatibility
  const cloudPost = async (url: string, payload: any) => {
    if (!url || !url.startsWith('http')) return false;
    try {
      // Create proper form data
      const formData = new URLSearchParams();
      formData.append('payload', JSON.stringify(payload));
      
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        },
        body: formData,
      });
      return true;
    } catch (err) {
      console.error("Cloud Error:", err);
      return false; 
    }
  };

  const fetchRegistryFromCloud = async (url: string, force = false): Promise<boolean> => {
    if (!url || !url.startsWith('http')) return false;
    try {
      // Add cache-busting parameter
      const timestamp = force ? `&force=${Date.now()}` : `&t=${Date.now()}`;
      const fetchUrl = url.includes('?') ? `${url}${timestamp}` : `${url}?${timestamp}`;
      
      const response = await fetch(fetchUrl, { 
        redirect: 'follow',
        cache: 'no-store'
      }); 
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.result === 'success') {
        if (data.teachers && Array.isArray(data.teachers)) {
          setTeachers(data.teachers);
          teachersRef.current = data.teachers;
          localStorage.setItem('sh_teachers_v4', JSON.stringify(data.teachers));
        }

        if (data.requests && Array.isArray(data.requests)) {
          setResubmitRequests(data.requests);
          localStorage.setItem('sh_resubmit_requests', JSON.stringify(data.requests));
        }

        if (data.submissions && Array.isArray(data.submissions)) {
          setSubmissions(data.submissions);
          localStorage.setItem('sh_submissions_v2', JSON.stringify(data.submissions));
        }
        
        setLastSync(new Date());
        setDataVersion(prev => prev + 1);
        return true;
      }
      return false;
    } catch (err) {
      console.debug("Fetch sync failed:", err);
      return false;
    }
  };

  // POLLING EFFECT: For ALL logged in users, sync every 30 seconds
  useEffect(() => {
    let interval: any;
    if (user && syncUrl) {
      // Initial immediate refresh
      fetchRegistryFromCloud(syncUrl, true);
      
      // Set up regular polling
      interval = setInterval(() => {
        fetchRegistryFromCloud(syncUrl, true);
      }, 30000); // 30 seconds
    }
    return () => clearInterval(interval);
  }, [user, syncUrl]);

  // Auto-refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user && syncUrlRef.current) {
        fetchRegistryFromCloud(syncUrlRef.current, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const savedTeachers = localStorage.getItem('sh_teachers_v4');
        const savedSubmissions = localStorage.getItem('sh_submissions_v2');
        const savedRequests = localStorage.getItem('sh_resubmit_requests');
        const savedUser = sessionStorage.getItem('sh_user');
        
        const params = new URLSearchParams(window.location.search);
        let activeSyncUrl = params.get('sync') || localStorage.getItem('sh_sync_url') || DEFAULT_SYNC_URL;
        
        setSyncUrl(activeSyncUrl);
        syncUrlRef.current = activeSyncUrl;
        localStorage.setItem('sh_sync_url', activeSyncUrl);

        if (savedTeachers) {
          const t = JSON.parse(savedTeachers);
          setTeachers(t);
          teachersRef.current = t;
        } else {
          setTeachers(INITIAL_TEACHERS);
          teachersRef.current = INITIAL_TEACHERS;
        }
        
        // Load from localStorage first for immediate display
        setSubmissions(savedSubmissions ? JSON.parse(savedSubmissions) : []);
        setResubmitRequests(savedRequests ? JSON.parse(savedRequests) : []);

        if (savedUser) {
          try { 
            const userObj = JSON.parse(savedUser);
            setUser(userObj);
            // Force refresh immediately after setting user
            if (activeSyncUrl) {
              await fetchRegistryFromCloud(activeSyncUrl, true);
            }
          } catch (e) { 
            sessionStorage.removeItem('sh_user'); 
          }
        }

        // ALWAYS fetch from cloud on initialization
        if (activeSyncUrl) {
          await fetchRegistryFromCloud(activeSyncUrl, true);
        }
      } finally {
        setIsInitializing(false);
      }
    };
    initialize();
  }, []);

  const updateSubmissions = async (newSubs: WeeklySubmission[]) => {
    setSubmissions(newSubs);
    localStorage.setItem('sh_submissions_v2', JSON.stringify(newSubs));
    setDataVersion(prev => prev + 1);
    
    const latestSub = newSubs[newSubs.length - 1];
    if (syncUrlRef.current && latestSub) {
      await cloudPost(syncUrlRef.current, { 
        ...latestSub, 
        action: 'SUBMIT_PLAN',
        _dataVersion: dataVersion + 1
      });
      // Immediate refetch to confirm sync
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 2000);
    }
  };

  const handleRequestResubmit = async (req: ResubmitRequest) => {
    const updated = [...resubmitRequests, req];
    setResubmitRequests(updated);
    localStorage.setItem('sh_resubmit_requests', JSON.stringify(updated));
    setDataVersion(prev => prev + 1);
    
    if (syncUrlRef.current) {
      await cloudPost(syncUrlRef.current, { 
        ...req, 
        action: 'REQUEST_RESUBMIT',
        _dataVersion: dataVersion + 1 
      });
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 2000);
    }
  };

  const handleApproveResubmit = async (requestId: string) => {
    const request = resubmitRequests.find(r => r.id === requestId);
    if (!request) return;
    
    try {
      // 1. Remove the request from local state immediately
      const updatedRequests = resubmitRequests.filter(r => r.id !== requestId);
      setResubmitRequests(updatedRequests);
      localStorage.setItem('sh_resubmit_requests', JSON.stringify(updatedRequests));
      
      // 2. Remove the teacher's submission from the current week
      const updatedSubmissions = submissions.filter(s => 
        !(s.teacherEmail === request.teacherEmail && s.weekStarting === request.weekStarting)
      );
      setSubmissions(updatedSubmissions);
      localStorage.setItem('sh_submissions_v2', JSON.stringify(updatedSubmissions));
      
      setDataVersion(prev => prev + 1);
      
      // 3. Send approval to backend
      if (syncUrlRef.current) {
        await cloudPost(syncUrlRef.current, { 
          action: 'APPROVE_RESUBMIT', 
          requestId: request.id,
          teacherEmail: request.teacherEmail,
          teacherName: request.teacherName,
          weekStarting: request.weekStarting,
          _dataVersion: dataVersion + 1
        });
        
        // 4. Force refresh data from cloud
        setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 1000);
      }
    } catch (error) {
      console.error("Failed to approve resubmit:", error);
      // Revert if failed
      fetchRegistryFromCloud(syncUrlRef.current, true);
    }
  };

  const handleForceReset = async (teacherId: string, week: string) => {
    const sub = submissions.find(s => s.teacherId === teacherId && s.weekStarting === week);
    if (!sub) return;
    
    try {
      // 1. Remove from local state immediately
      const updatedSubmissions = submissions.filter(s => 
        !(s.teacherId === teacherId && s.weekStarting === week)
      );
      setSubmissions(updatedSubmissions);
      localStorage.setItem('sh_submissions_v2', JSON.stringify(updatedSubmissions));
      
      setDataVersion(prev => prev + 1);
      
      // 2. Send reset to backend
      if (syncUrlRef.current) {
        await cloudPost(syncUrlRef.current, { 
          action: 'RESET_SUBMISSION', 
          teacherEmail: sub.teacherEmail, 
          teacherName: sub.teacherName, 
          weekStarting: week,
          _dataVersion: dataVersion + 1
        });
        
        // 3. Force refresh data from cloud
        setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 1000);
      }
    } catch (error) {
      console.error("Failed to force reset:", error);
      // Revert if failed
      fetchRegistryFromCloud(syncUrlRef.current, true);
    }
  };

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(newTeachers));
    setDataVersion(prev => prev + 1);
    
    cloudPost(syncUrlRef.current || syncUrl, { 
      action: 'SYNC_REGISTRY', 
      teachers: newTeachers,
      _dataVersion: dataVersion + 1
    });
  };

  const handleManualResetRegistry = async () => {
    updateTeachers(INITIAL_TEACHERS);
    setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 1000);
    alert("Database restored to defaults.");
  };

  const handleRefreshData = useCallback(async (): Promise<boolean> => {
    if (syncUrlRef.current) {
      const success = await fetchRegistryFromCloud(syncUrlRef.current, true);
      if (success) {
        setLastSync(new Date());
      }
      return success;
    }
    return false;
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-white/20 rounded-full"></div>
            <div className="w-24 h-24 border-4 border-white border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <div className="space-y-2">
            <p className="text-white font-black text-lg tracking-widest">INITIALIZING PORTAL</p>
            <p className="text-white/70 text-sm font-medium">Establishing secure connection...</p>
          </div>
          <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 animate-pulse w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30">
      {/* Welcome Notification */}
      {showNotification && !user && (
        <div className="animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <i className="fas fa-graduation-cap"></i>
                <p className="text-sm font-medium">Welcome to Sacred Heart Academic Portal • Faculty Login Required</p>
              </div>
              <button 
                onClick={() => setShowNotification(false)}
                className="text-white/80 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 shadow-lg backdrop-blur-xl bg-white/90 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                {logoLoaded ? (
                  <img src={SCHOOL_LOGO_URL} alt="SHS" className="w-10 h-10 object-contain" onError={() => setLogoLoaded(false)} />
                ) : (
                  <i className="fas fa-graduation-cap text-white text-xl"></i>
                )}
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-gray-900 tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {SCHOOL_NAME}
              </h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Academic Management Portal</p>
            </div>
          </div>
          
          {user && (
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-black text-gray-900">{'name' in user ? user.name : 'Administrator'}</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{user.email}</p>
                </div>
              </div>
              <div className="relative group">
                <button 
                  onClick={() => { 
                    setUser(null); 
                    sessionStorage.removeItem('sh_user');
                    // Clear local storage on logout
                    localStorage.removeItem('sh_submissions_v2');
                    localStorage.removeItem('sh_resubmit_requests');
                  }} 
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 hover:from-blue-100 hover:to-indigo-100 transition-all shadow-sm hover:shadow-md group-hover:scale-105"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
                <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Logout
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {!user ? (
            <Login 
              onLogin={(u) => { 
                setUser(u); 
                sessionStorage.setItem('sh_user', JSON.stringify(u));
                // Force refresh on login
                if (syncUrlRef.current) {
                  fetchRegistryFromCloud(syncUrlRef.current, true);
                }
              }} 
              teachers={teachers} 
              onSyncRegistry={() => fetchRegistryFromCloud(syncUrl, true)} 
              syncUrl={syncUrl} 
            />
          ) : 'isAdmin' in user ? (
            <AdminDashboard 
              teachers={teachers} 
              setTeachers={updateTeachers}
              submissions={submissions} 
              setSubmissions={updateSubmissions}
              resubmitRequests={resubmitRequests} 
              onApproveResubmit={handleApproveResubmit}
              syncUrl={syncUrl} 
              setSyncUrl={(u) => { 
                setSyncUrl(u); 
                syncUrlRef.current = u; 
                localStorage.setItem('sh_sync_url', u); 
              }}
              onSendWarnings={async (d, w) => cloudPost(syncUrl, { action: 'SEND_WARNINGS', defaulters: d, weekStarting: w, portalLink: PORTAL_LINK })}
              onSendPdf={async (p, r, c, f) => cloudPost(syncUrl, { action: 'SEND_COMPILED_PDF', pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday() })}
              onResetRegistry={handleManualResetRegistry}
              onForceReset={handleForceReset}
              onRefreshData={handleRefreshData}
              lastSync={lastSync}
              dataVersion={dataVersion}
            />
          ) : (
            <TeacherDashboard 
              teacher={user as Teacher} 
              teachers={teachers}
              submissions={submissions} 
              setSubmissions={updateSubmissions}
              allSubmissions={submissions} 
              isCloudEnabled={!!syncUrl}
              syncUrl={syncUrl} 
              setSyncUrl={(u) => { 
                setSyncUrl(u); 
                syncUrlRef.current = u; 
                localStorage.setItem('sh_sync_url', u); 
              }}
              onSendWarnings={(d, w) => cloudPost(syncUrl, { action: 'SEND_WARNINGS', defaulters: d, weekStarting: w, portalLink: PORTAL_LINK })}
              onSendPdf={async (p, r, c, f) => cloudPost(syncUrl, { action: 'SEND_COMPILED_PDF', pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday() })}
              onResubmitRequest={handleRequestResubmit}
              resubmitRequests={resubmitRequests}
              dataVersion={dataVersion}
            />
          )}
        </div>
      </main>

      <footer className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-12 px-4 mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-black mb-4 tracking-widest uppercase">Sacred Heart Portal</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Next-generation academic management system for seamless syllabus planning, tracking, and distribution.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-black mb-4 tracking-widest uppercase">Features</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><i className="fas fa-check text-emerald-400"></i> Real-time Cloud Sync</li>
                <li className="flex items-center gap-2"><i className="fas fa-check text-emerald-400"></i> AI-Powered Content Refinement</li>
                <li className="flex items-center gap-2"><i className="fas fa-check text-emerald-400"></i> Automated PDF Generation</li>
                <li className="flex items-center gap-2"><i className="fas fa-check text-emerald-400"></i> WhatsApp Integration</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-black mb-4 tracking-widest uppercase">System Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Cloud Connection</span>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                    <span className="text-xs font-bold text-emerald-400">Active</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Teachers Registered</span>
                  <span className="text-sm font-bold">{teachers.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">This Week's Submissions</span>
                  <span className="text-sm font-bold">{submissions.filter(s => s.weekStarting === getCurrentWeekMonday()).length}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-8 pt-8 text-center">
            <p className="text-sm font-black text-gray-300 uppercase tracking-[0.2em]">
              Designed and developed with ❤️ by ASHUTOSH KUMAR GAUTAM
            </p>
            <p className="text-xs text-gray-400 mt-2">© {new Date().getFullYear()} Sacred Heart School. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

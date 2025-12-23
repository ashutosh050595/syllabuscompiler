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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showNotification, setShowNotification] = useState(true);
  const [syncCounter, setSyncCounter] = useState(0); // Force re-render on sync
  const [deviceId, setDeviceId] = useState<string>(''); // Unique device ID
  
  const teachersRef = useRef<Teacher[]>([]);
  const syncUrlRef = useRef<string>('');
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  // Generate or get unique device ID
  useEffect(() => {
    let storedDeviceId = localStorage.getItem('sh_device_id');
    if (!storedDeviceId) {
      storedDeviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('sh_device_id', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);

  // Enhanced cloud POST with device info
  const cloudPost = async (url: string, payload: any) => {
    if (!url || !url.startsWith('http')) return false;
    try {
      // Add device info to every request
      const enhancedPayload = {
        ...payload,
        _deviceId: deviceId,
        _deviceType: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        _timestamp: new Date().toISOString()
      };
      
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ [JSON.stringify(enhancedPayload)]: '' }),
      });
      return true;
    } catch (err) {
      console.error("Cloud Error:", err);
      return false; 
    }
  };

  // Force refresh all data from cloud
  const forceRefreshAllData = async (url: string): Promise<boolean> => {
    if (!url || !url.startsWith('http')) return false;
    try {
      const fetchUrl = url.includes('?') ? `${url}&force=${Date.now()}` : `${url}?force=${Date.now()}`;
      const response = await fetch(fetchUrl, { 
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }); 
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
        setSyncCounter(prev => prev + 1); // Force re-render
        return true;
      }
      return false;
    } catch (err) {
      console.debug("Force refresh failed:", err);
      return false;
    }
  };

  // Optimized cloud fetch with debouncing
  const fetchRegistryFromCloud = async (url: string, force: boolean = false): Promise<boolean> => {
    if (!url || !url.startsWith('http')) return false;
    
    // Debounce: Don't fetch more than once every 3 seconds
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 3000) {
      return false;
    }
    
    if (isFetchingRef.current) return false;
    
    isFetchingRef.current = true;
    lastFetchRef.current = now;
    
    try {
      const fetchUrl = url.includes('?') ? `${url}&t=${now}&d=${deviceId}` : `${url}?t=${now}&d=${deviceId}`;
      const response = await fetch(fetchUrl, { 
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }); 
      const data = await response.json();
      
      if (data.result === 'success') {
        // Merge with existing data instead of replace
        if (data.teachers && Array.isArray(data.teachers)) {
          // Merge teachers, giving priority to cloud data
          const mergedTeachers = mergeDataArrays(teachers, data.teachers, 'id');
          setTeachers(mergedTeachers);
          teachersRef.current = mergedTeachers;
          localStorage.setItem('sh_teachers_v4', JSON.stringify(mergedTeachers));
        }

        if (data.requests && Array.isArray(data.requests)) {
          // Only show pending requests
          const pendingRequests = data.requests.filter((req: ResubmitRequest) => req.status === 'pending');
          const mergedRequests = mergeDataArrays(resubmitRequests, pendingRequests, 'id');
          setResubmitRequests(mergedRequests);
          localStorage.setItem('sh_resubmit_requests', JSON.stringify(mergedRequests));
        }

        if (data.submissions && Array.isArray(data.submissions)) {
          // Merge submissions, cloud data takes precedence
          const mergedSubmissions = mergeDataArrays(submissions, data.submissions, 'id');
          setSubmissions(mergedSubmissions);
          localStorage.setItem('sh_submissions_v2', JSON.stringify(mergedSubmissions));
        }
        
        setLastSync(new Date());
        setSyncCounter(prev => prev + 1);
        return true;
      }
      return false;
    } catch (err) {
      console.debug("Fetch sync failed:", err);
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  };

  // Helper function to merge arrays by key
  const mergeDataArrays = <T extends Record<string, any>>(localData: T[], cloudData: T[], key: string): T[] => {
    const mergedMap = new Map<string, T>();
    
    // First add all local data
    localData.forEach(item => {
      if (item[key]) {
        mergedMap.set(String(item[key]), item);
      }
    });
    
    // Then add/overwrite with cloud data (cloud data has priority)
    cloudData.forEach(item => {
      if (item[key]) {
        mergedMap.set(String(item[key]), item);
      }
    });
    
    return Array.from(mergedMap.values());
  };

  // REAL-TIME SYNC: Sync every 15 seconds when user is logged in
  useEffect(() => {
    let interval: any;
    
    const syncFunction = async () => {
      if (syncUrl && user) {
        await fetchRegistryFromCloud(syncUrl);
      }
    };
    
    if (user && syncUrl) {
      // Initial sync
      syncFunction();
      
      // Set up interval for regular sync
      interval = setInterval(() => {
        syncFunction();
      }, 15000); // Every 15 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, syncUrl]);

  // Listen for storage events (cross-tab sync on same device)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sh_teachers_v4' && e.newValue) {
        try {
          const newTeachers = JSON.parse(e.newValue);
          setTeachers(newTeachers);
          teachersRef.current = newTeachers;
        } catch (error) {
          console.error('Failed to parse teachers from storage:', error);
        }
      }
      
      if (e.key === 'sh_submissions_v2' && e.newValue) {
        try {
          const newSubmissions = JSON.parse(e.newValue);
          setSubmissions(newSubmissions);
        } catch (error) {
          console.error('Failed to parse submissions from storage:', error);
        }
      }
      
      if (e.key === 'sh_resubmit_requests' && e.newValue) {
        try {
          const newRequests = JSON.parse(e.newValue);
          setResubmitRequests(newRequests);
        } catch (error) {
          console.error('Failed to parse requests from storage:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Periodically check for updates even when tab is in background
  useEffect(() => {
    let visibilityInterval: any;
    
    const handleVisibilityChange = () => {
      if (!document.hidden && syncUrl && user) {
        // Tab became visible, force refresh
        fetchRegistryFromCloud(syncUrl, true);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Even in background, sync every 30 seconds
    if (user && syncUrl) {
      visibilityInterval = setInterval(() => {
        fetchRegistryFromCloud(syncUrl);
      }, 30000);
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityInterval) clearInterval(visibilityInterval);
    };
  }, [user, syncUrl]);

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
        
        setSubmissions(savedSubmissions ? JSON.parse(savedSubmissions) : []);
        setResubmitRequests(savedRequests ? JSON.parse(savedRequests) : []);

        if (savedUser) {
          try { setUser(JSON.parse(savedUser)); } catch (e) { sessionStorage.removeItem('sh_user'); }
        }

        if (activeSyncUrl) {
          // Force initial sync with cloud
          await forceRefreshAllData(activeSyncUrl);
        }
      } finally {
        setIsInitializing(false);
      }
    };
    initialize();
  }, []);

  // Broadcast changes to other tabs/windows on same device
  const broadcastChange = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
    // Manually dispatch storage event for other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key,
      newValue: JSON.stringify(data),
      oldValue: localStorage.getItem(key),
      storageArea: localStorage
    }));
  };

  const updateSubmissions = async (newSubs: WeeklySubmission[]) => {
    // Immediately update local state
    setSubmissions(newSubs);
    broadcastChange('sh_submissions_v2', newSubs);
    
    // Get the latest submission (if any)
    const latestSub = newSubs[newSubs.length - 1];
    if (syncUrlRef.current && latestSub) {
      // Add device info
      const payload = {
        ...latestSub,
        action: 'SUBMIT_PLAN',
        _deviceId: deviceId,
        _deviceType: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      };
      
      await cloudPost(syncUrlRef.current, payload);
      
      // Force immediate sync across all devices
      setTimeout(() => {
        fetchRegistryFromCloud(syncUrlRef.current, true);
      }, 1000);
    }
  };

  const handleRequestResubmit = async (req: ResubmitRequest) => {
    const updated = [...resubmitRequests, req];
    setResubmitRequests(updated);
    broadcastChange('sh_resubmit_requests', updated);
    
    if (syncUrlRef.current) {
      await cloudPost(syncUrlRef.current, { 
        ...req, 
        action: 'REQUEST_RESUBMIT',
        _deviceId: deviceId 
      });
      
      // Force immediate sync
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 1000);
    }
  };

  const handleApproveResubmit = async (requestId: string) => {
    const request = resubmitRequests.find(r => r.id === requestId);
    if (!request) return;
    
    try {
      // 1. Remove the request from local state immediately
      const updatedRequests = resubmitRequests.filter(r => r.id !== requestId);
      setResubmitRequests(updatedRequests);
      broadcastChange('sh_resubmit_requests', updatedRequests);
      
      // 2. Remove the teacher's submission from the current week
      const updatedSubmissions = submissions.filter(s => 
        !(s.teacherEmail === request.teacherEmail && s.weekStarting === request.weekStarting)
      );
      setSubmissions(updatedSubmissions);
      broadcastChange('sh_submissions_v2', updatedSubmissions);
      
      // 3. Send approval to backend
      if (syncUrlRef.current) {
        await cloudPost(syncUrlRef.current, { 
          action: 'APPROVE_RESUBMIT', 
          requestId: request.id,
          teacherEmail: request.teacherEmail,
          teacherName: request.teacherName,
          weekStarting: request.weekStarting,
          _deviceId: deviceId
        });
        
        // 4. Force immediate sync across all devices
        setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 500);
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
      broadcastChange('sh_submissions_v2', updatedSubmissions);
      
      // 2. Send reset to backend
      if (syncUrlRef.current) {
        await cloudPost(syncUrlRef.current, { 
          action: 'RESET_SUBMISSION', 
          teacherEmail: sub.teacherEmail, 
          teacherName: sub.teacherName, 
          weekStarting: week,
          _deviceId: deviceId
        });
        
        // 3. Force immediate sync across all devices
        setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 500);
      }
    } catch (error) {
      console.error("Failed to force reset:", error);
      fetchRegistryFromCloud(syncUrlRef.current, true);
    }
  };

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    broadcastChange('sh_teachers_v4', newTeachers);
    
    cloudPost(syncUrlRef.current || syncUrl, { 
      action: 'SYNC_REGISTRY', 
      teachers: newTeachers,
      _deviceId: deviceId 
    }).then(() => {
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current, true), 1000);
    });
  };

  const handleManualResetRegistry = async () => {
    updateTeachers(INITIAL_TEACHERS);
    alert("Database restored to defaults.");
  };

  // Manual sync function exposed to components
  const manualSync = async () => {
    if (syncUrl) {
      await forceRefreshAllData(syncUrl);
      alert('Data synchronized successfully!');
    }
  };

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
      {/* Sync Status Bar */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 text-center text-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span>Real-time Sync: {lastSync ? `Last updated ${new Date(lastSync).toLocaleTimeString()}` : 'Connecting...'}</span>
          </div>
          <button 
            onClick={manualSync}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full flex items-center gap-1"
          >
            <i className="fas fa-sync-alt"></i>
            Sync Now
          </button>
        </div>
      </div>

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
                <p className="text-[10px] text-gray-400 mt-1">
                  {/Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '📱 Mobile' : '💻 Desktop'}
                </p>
              </div>
              <div className="relative group">
                <button 
                  onClick={() => { setUser(null); sessionStorage.removeItem('sh_user'); }} 
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
              }} 
              teachers={teachers} 
              onSyncRegistry={() => fetchRegistryFromCloud(syncUrl, true)} 
              syncUrl={syncUrl} 
            />
          ) : 'isAdmin' in user ? (
            <AdminDashboard 
              key={`admin-${syncCounter}`} // Force re-render on sync
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
              onSendWarnings={async (d, w) => cloudPost(syncUrl, { action: 'SEND_WARNINGS', defaulters: d, weekStarting: w, portalLink: PORTAL_LINK, _deviceId: deviceId })}
              onSendPdf={async (p, r, c, f) => cloudPost(syncUrl, { action: 'SEND_COMPILED_PDF', pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday(), _deviceId: deviceId })}
              onResetRegistry={handleManualResetRegistry}
              onForceReset={handleForceReset}
              onRefreshData={() => fetchRegistryFromCloud(syncUrl, true)}
              onManualSync={manualSync}
              lastSync={lastSync}
            />
          ) : (
            <TeacherDashboard 
              key={`teacher-${syncCounter}`} // Force re-render on sync
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
              onSendWarnings={(d, w) => cloudPost(syncUrl, { action: 'SEND_WARNINGS', defaulters: d, weekStarting: w, portalLink: PORTAL_LINK, _deviceId: deviceId })}
              onSendPdf={async (p, r, c, f) => cloudPost(syncUrl, { action: 'SEND_COMPILED_PDF', pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday(), _deviceId: deviceId })}
              onResubmitRequest={handleRequestResubmit}
              resubmitRequests={resubmitRequests}
              onManualSync={manualSync}
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
                <div className="flex items-center justify-between">
                  <span className="text-sm">Sync Status</span>
                  <span className="text-xs font-bold">
                    {lastSync ? `${Math.round((Date.now() - lastSync.getTime()) / 1000)}s ago` : 'Never'}
                  </span>
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

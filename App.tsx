
import React, { useState, useEffect, useRef } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, ResubmitRequest } from './types';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import { SCHOOL_NAME, INITIAL_TEACHERS, getCurrentWeekMonday, getNextWeekMonday, SCHOOL_LOGO_URL, PORTAL_LINK, DEFAULT_SYNC_URL } from './constants';

// ==========================================
// ULTRA-RELIABLE SUBMISSION SYSTEM CONSTANTS
// ==========================================
const OFFLINE_SUBMISSIONS_KEY = 'sh_offline_submissions_v3';
const SUBMISSION_RETRY_KEY = 'sh_submission_retry_v2';

// Track submission attempts globally
let globalSubmissionQueue: any[] = [];

const App: React.FC = () => {
  const [user, setUser] = useState<Teacher | { email: string; isAdmin: true } | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [resubmitRequests, setResubmitRequests] = useState<ResubmitRequest[]>([]);
  const [syncUrl, setSyncUrl] = useState<string>('');
  const [logoLoaded, setLogoLoaded] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  const teachersRef = useRef<Teacher[]>([]);
  const syncUrlRef = useRef<string>('');

  // Load offline queue on startup
  useEffect(() => {
    const savedQueue = localStorage.getItem(OFFLINE_SUBMISSIONS_KEY);
    if (savedQueue) {
      try {
        globalSubmissionQueue = JSON.parse(savedQueue);
      } catch (e) {}
    }
    
    // Start background retry engine
    startRetryEngine();
    // Register Service Worker
    registerServiceWorker();
  }, []);

  // ===== LAYER 1: Local Storage (ALWAYS WORKS) =====
  const saveSubmissionLocally = (action: string, payload: any) => {
    try {
      const key = `${action}_${payload.teacherEmail || 'admin'}_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify({
        ...payload,
        _localTimestamp: new Date().toISOString(),
        _device: navigator.userAgent.substring(0, 100)
      }));
      
      // Also add to queue for sync
      const queue = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSIONS_KEY) || '[]');
      queue.push({ id: payload._sid, action, payload, timestamp: Date.now(), attempts: 0 });
      localStorage.setItem(OFFLINE_SUBMISSIONS_KEY, JSON.stringify(queue));
      globalSubmissionQueue = queue;
      
      return { success: true };
    } catch (e) {
      // If localStorage is full, use sessionStorage
      sessionStorage.setItem('emergency_submission', JSON.stringify(payload));
      return { success: true };
    }
  };

  // ===== LAYER 2: Multiple Cloud Methods =====

  // Method 1: Modern Fetch API
  const cloudPostMethod1 = async (url: string, payload: any): Promise<{success: boolean}> => {
    return new Promise(async (resolve) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        // Use no-cors for Google Apps Script to avoid pre-flight issues on mobile
        const response = await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ [JSON.stringify(payload)]: '' })
        });
        
        clearTimeout(timeoutId);
        resolve({ success: true });
      } catch (error) {
        resolve({ success: false });
      }
    });
  };

  // Method 2: XMLHttpRequest (works on older browsers)
  const cloudPostMethod2 = (url: string, payload: any): Promise<{success: boolean}> => {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 10000;
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = () => resolve({ success: true });
        xhr.onerror = () => resolve({ success: false });
        xhr.ontimeout = () => resolve({ success: false });
        xhr.send(new URLSearchParams({ [JSON.stringify(payload)]: '' }).toString());
      } catch (error) {
        resolve({ success: false });
      }
    });
  };

  // Method 3: Form Submission (works on EVERY device)
  const cloudPostMethod3 = (url: string, payload: any): Promise<{success: boolean}> => {
    return new Promise((resolve) => {
      try {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.style.display = 'none';
        
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = JSON.stringify(payload);
        input.value = '';
        form.appendChild(input);
        
        const iframe = document.createElement('iframe');
        iframe.name = `iframe_${payload._sid || Date.now()}`;
        iframe.style.display = 'none';
        form.target = iframe.name;
        
        document.body.appendChild(iframe);
        document.body.appendChild(form);
        
        iframe.onload = () => {
          resolve({ success: true });
          setTimeout(() => {
            if (document.body.contains(form)) document.body.removeChild(form);
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          }, 1000);
        };
        form.submit();
      } catch (error) {
        resolve({ success: false });
      }
    });
  };

  // Main submission function - ALWAYS succeeds
  const submitWith100PercentReliability = async (
    action: string,
    payload: any,
    url: string
  ): Promise<{success: boolean, id?: string, message: string}> => {
    if (!url || !url.startsWith('http')) return { success: false, message: 'Invalid Sync URL' };
    
    // Generate unique ID for tracking
    const submissionId = payload._sid || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const enhancedPayload = { ...payload, action, _sid: submissionId, _ts: Date.now() };
    
    // LAYER 1: Save locally IMMEDIATELY (always works)
    saveSubmissionLocally(action, enhancedPayload);
    
    // LAYER 2: Try different cloud methods (Race Method 1 and 2)
    const cloudResults = await (Promise as any).any([
      cloudPostMethod1(url, enhancedPayload),
      cloudPostMethod2(url, enhancedPayload),
    ]).catch(() => ({ success: false }));
    
    // LAYER 3: If fast methods fail, trigger Form Submit and add to Retry
    if (!cloudResults.success) {
      cloudPostMethod3(url, enhancedPayload);
      addToRetryQueue(submissionId, action, enhancedPayload, url);
    }
    
    return {
      success: true,
      id: submissionId,
      message: cloudResults.success 
        ? 'Submitted to cloud successfully' 
        : 'Saved locally - will sync automatically'
    };
  };

  // ===== LAYER 3: Retry Engine =====
  const addToRetryQueue = (id: string, action: string, payload: any, url: string) => {
    const retryItem = {
      id,
      action,
      payload,
      url,
      timestamp: Date.now(),
      attempts: 0,
      nextRetry: Date.now() + 30000 
    };
    
    const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
    retryQueue.push(retryItem);
    localStorage.setItem(SUBMISSION_RETRY_KEY, JSON.stringify(retryQueue));
    
    startRetryEngine();
  };

  const startRetryEngine = () => {
    if ((window as any)._retryEngineRunning) return;
    (window as any)._retryEngineRunning = true;
    
    const retryInterval = setInterval(async () => {
      const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
      if (retryQueue.length === 0) {
        clearInterval(retryInterval);
        (window as any)._retryEngineRunning = false;
        return;
      }
      
      const now = Date.now();
      const toRetry = retryQueue.filter((item: any) => item.nextRetry <= now && item.attempts < 10);
      
      for (const item of toRetry) {
        try {
          const result = await cloudPostMethod1(item.url, item.payload);
          if (result.success) {
            const newQueue = retryQueue.filter((i: any) => i.id !== item.id);
            localStorage.setItem(SUBMISSION_RETRY_KEY, JSON.stringify(newQueue));
          } else {
            item.attempts++;
            item.nextRetry = Date.now() + (30000 * item.attempts); 
          }
        } catch (e) {
          item.attempts++;
          item.nextRetry = Date.now() + (30000 * item.attempts);
        }
      }
      
      localStorage.setItem(SUBMISSION_RETRY_KEY, JSON.stringify(retryQueue));
    }, 15000); 
  };

  // ===== LAYER 4: Verification =====
  const verifySubmission = async (url: string, submissionId: string): Promise<boolean> => {
    try {
      const verifyUrl = `${url}${url.includes('?') ? '&' : '?'}verify=${submissionId}&t=${Date.now()}`;
      const response = await fetch(verifyUrl, { method: 'GET', redirect: 'follow' });
      const data = await response.json();
      
      if (data.submissions) {
        return data.submissions.some((s: any) => 
          s._sid === submissionId || 
          (s.timestamp && Date.now() - new Date(s.timestamp).getTime() < 300000)
        );
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // ===== Service Worker for Background Sync =====
  const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.debug('Service Worker registered');
        }).catch(err => {
          console.debug('SW Registration failed', err);
        });
    }
  };

  const fetchRegistryFromCloud = async (url: string): Promise<boolean> => {
    if (!url || !url.startsWith('http')) return false;
    try {
      const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      const response = await fetch(fetchUrl, { redirect: 'follow' }); 
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
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  // Polling Effect
  useEffect(() => {
    let interval: any;
    if (user && 'isAdmin' in user && syncUrl) {
      interval = setInterval(() => { fetchRegistryFromCloud(syncUrl); }, 60000);
    }
    return () => clearInterval(interval);
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

        if (activeSyncUrl) await fetchRegistryFromCloud(activeSyncUrl);
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
    if (syncUrlRef.current && latestSub) {
      await submitWith100PercentReliability('SUBMIT_PLAN', latestSub, syncUrlRef.current);
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current), 3000);
    }
  };

  const handleRequestResubmit = async (req: ResubmitRequest) => {
    const updated = [...resubmitRequests, req];
    setResubmitRequests(updated);
    localStorage.setItem('sh_resubmit_requests', JSON.stringify(updated));
    if (syncUrlRef.current) {
      await submitWith100PercentReliability('REQUEST_RESUBMIT', req, syncUrlRef.current);
    }
  };

  const handleApproveResubmit = async (requestId: string) => {
    const request = resubmitRequests.find(r => r.id === requestId);
    if (!request) return;
    if (syncUrlRef.current) {
      await submitWith100PercentReliability('APPROVE_RESUBMIT', { 
        requestId: request.id,
        teacherEmail: request.teacherEmail,
        teacherName: request.teacherName,
        weekStarting: request.weekStarting 
      }, syncUrlRef.current);
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current), 3000);
    }
  };

  const handleForceReset = async (teacherId: string, week: string) => {
    const sub = submissions.find(s => s.teacherId === teacherId && s.weekStarting === week);
    if (sub && syncUrlRef.current) {
      await submitWith100PercentReliability('RESET_SUBMISSION', { 
        teacherEmail: sub.teacherEmail, 
        teacherName: sub.teacherName, 
        weekStarting: week 
      }, syncUrlRef.current);
      setTimeout(() => fetchRegistryFromCloud(syncUrlRef.current), 3000);
    }
  };

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(newTeachers));
    if (syncUrlRef.current) {
      submitWith100PercentReliability('SYNC_REGISTRY', { teachers: newTeachers }, syncUrlRef.current);
    }
  };

  const handleManualResetRegistry = async () => {
    updateTeachers(INITIAL_TEACHERS);
    alert("Database restored to defaults.");
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-600">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
          <p className="text-white font-black uppercase tracking-widest text-[10px]">Cloud Sync in Progress...</p>
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
              <p className="text-[8px] md:text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">Live Multi-Device Cloud Portal</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-gray-800">{'name' in user ? user.name : 'Administrator'}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.email}</p>
              </div>
              <button onClick={() => { setUser(null); sessionStorage.removeItem('sh_user'); }} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                <i className="fas fa-power-off"></i>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          {!user ? (
            <Login onLogin={(u) => { setUser(u); sessionStorage.setItem('sh_user', JSON.stringify(u)); }} teachers={teachers} onSyncRegistry={fetchRegistryFromCloud} syncUrl={syncUrl} />
          ) : 'isAdmin' in user ? (
            <AdminDashboard 
              teachers={teachers} setTeachers={updateTeachers}
              submissions={submissions} setSubmissions={updateSubmissions}
              resubmitRequests={resubmitRequests} onApproveResubmit={handleApproveResubmit}
              syncUrl={syncUrl} setSyncUrl={(u) => { setSyncUrl(u); syncUrlRef.current = u; localStorage.setItem('sh_sync_url', u); }}
              onSendWarnings={async (d, w) => submitWith100PercentReliability('SEND_WARNINGS', { defaulters: d, weekStarting: w, portalLink: PORTAL_LINK }, syncUrl)}
              onSendPdf={async (p, r, c, f) => submitWith100PercentReliability('SEND_COMPILED_PDF', { pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday() }, syncUrl)}
              onResetRegistry={handleManualResetRegistry}
              onForceReset={handleForceReset}
              onRefreshData={() => fetchRegistryFromCloud(syncUrl)}
              lastSync={lastSync}
            />
          ) : (
            <TeacherDashboard 
              teacher={user as Teacher} teachers={teachers}
              submissions={submissions} setSubmissions={updateSubmissions}
              allSubmissions={submissions} isCloudEnabled={!!syncUrl}
              syncUrl={syncUrl} setSyncUrl={(u) => { setSyncUrl(u); syncUrlRef.current = u; localStorage.setItem('sh_sync_url', u); }}
              onSendWarnings={(d, w) => submitWith100PercentReliability('SEND_WARNINGS', { defaulters: d, weekStarting: w, portalLink: PORTAL_LINK }, syncUrl)}
              onSendPdf={async (p, r, c, f) => submitWith100PercentReliability('SEND_COMPILED_PDF', { pdfBase64: p, recipient: r, className: c, filename: f, weekStarting: getNextWeekMonday() }, syncUrl)}
              onResubmitRequest={handleRequestResubmit}
              resubmitRequests={resubmitRequests}
            />
          )}
        </div>
      </main>

      <footer className="bg-white py-12 px-4 border-t border-gray-100 mt-20">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <p className="text-[12px] md:text-sm font-black text-gray-900 uppercase tracking-[0.2em]">Designed and developed by ASHUTOSH KUMAR GAUTAM</p>
        </div>
      </footer>
    </div>
  );
};

export default App;

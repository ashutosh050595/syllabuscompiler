
import React, { useState, useEffect, useRef } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission } from './types';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import { SCHOOL_NAME, INITIAL_TEACHERS, getCurrentWeekMonday, getNextWeekMonday, SCHOOL_LOGO_URL } from './constants';
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

    const interval = setInterval(runAutonomousScheduler, 60000);
    return () => clearInterval(interval);
  }, []);

  const runAutonomousScheduler = () => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const dateStr = now.toISOString().split('T')[0];
    const nextMonday = getNextWeekMonday();

    if ([4, 5, 6].includes(day) && hour === 14) {
      const runKey = `auto_remind_${dateStr}`;
      if (!localStorage.getItem(runKey) && syncUrlRef.current) {
        const submittedIds = new Set(submissionsRef.current.filter(s => s.weekStarting === nextMonday).map(s => s.teacherId));
        const defaulters = teachersRef.current
          .filter(t => !submittedIds.has(t.id))
          .map(t => ({ name: t.name, email: t.email }));

        if (defaulters.length > 0) {
          triggerWarningEmails(defaulters, nextMonday, true);
        }
        localStorage.setItem(runKey, 'true');
      }
    }

    if (day === 6 && hour === 21) {
      const runKey = `auto_compile_${dateStr}`;
      if (!localStorage.getItem(runKey) && syncUrlRef.current) {
        runAutomatedCompilation(nextMonday);
        localStorage.setItem(runKey, 'true');
      }
    }
  };

  const runAutomatedCompilation = async (weekStarting: string) => {
    const classes: { level: ClassLevel, sec: Section }[] = [
      { level: 'V', sec: 'A' }, { level: 'V', sec: 'B' }, { level: 'V', sec: 'C' },
      { level: 'VI', sec: 'A' }, { level: 'VI', sec: 'B' }, { level: 'VI', sec: 'C' }, { level: 'VI', sec: 'D' },
      { level: 'VII', sec: 'A' }, { level: 'VII', sec: 'B' }, { level: 'VII', sec: 'C' }, { level: 'VII', sec: 'D' }
    ];

    for (const cls of classes) {
      const classTeacher = teachersRef.current.find(t => t.isClassTeacher?.classLevel === cls.level && t.isClassTeacher?.section === cls.sec);
      if (!classTeacher) continue;

      const requirements = teachersRef.current.flatMap(t => 
        t.assignedClasses
          .filter(ac => ac.classLevel === cls.level && ac.section === cls.sec)
          .map(ac => ({ subject: ac.subject, teacherName: t.name, teacherId: t.id }))
      );

      const compiledPlans: Submission[] = requirements.map(req => {
        const teacherSub = submissionsRef.current.find(s => s.teacherId === req.teacherId && s.weekStarting === weekStarting);
        const plan = teacherSub?.plans.find(p => p.classLevel === cls.level && p.section === cls.sec && p.subject === req.subject);
        return {
          subject: req.subject,
          teacherName: req.teacherName,
          chapterName: plan?.chapterName || 'PENDING',
          topics: plan?.topics || 'PENDING',
          homework: plan?.homework || 'PENDING',
          classLevel: cls.level,
          section: cls.sec
        };
      });

      const doc = generateSyllabusPDF(compiledPlans, { 
        name: classTeacher.name, 
        email: classTeacher.email, 
        classLevel: cls.level, 
        section: cls.sec 
      }, weekStarting, "Saturday");
      
      const pdfBase64 = doc.output('datauristring');
      await triggerCompiledPdfEmail(pdfBase64, classTeacher.email, `${cls.level}-${cls.sec}`, `Auto_Syllabus_${cls.level}${cls.sec}_${weekStarting}.pdf`, true);
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

  const updateTeachers = (newTeachers: Teacher[]) => {
    setTeachers(newTeachers);
    teachersRef.current = newTeachers;
    localStorage.setItem('sh_teachers_v4', JSON.stringify(newTeachers));
  };

  const updateSyncUrl = (url: string) => {
    setSyncUrl(url);
    syncUrlRef.current = url;
    localStorage.setItem('sh_sync_url', url);
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...latestSub, action: 'SUBMIT_PLAN' })
        });
      } catch (err) {
        console.error("Sync failed:", err);
      }
    }
  };

  const triggerWarningEmails = async (defaulters: { name: string, email: string }[], weekStarting?: string, isAuto = false) => {
    const url = syncUrlRef.current;
    if (!url) {
      if (!isAuto) alert("Cloud Sync is not configured. Admin must set the Deployment URL first in Settings.");
      return;
    }
    const week = weekStarting || getNextWeekMonday();
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'SEND_WARNINGS', 
          defaulters, 
          weekStarting: week,
          isAuto
        })
      });
      if (!isAuto) alert(`Success: Warning emails dispatched to ${defaulters.length} teachers for the upcoming week (${week}).`);
    } catch (err) {
      if (!isAuto) alert("Critical Error: Failed to connect to the automation backend. Check internet or Deployment URL.");
    }
  };

  const triggerCompiledPdfEmail = async (pdfBase64: string, recipient: string, className: string, filename: string, isAuto = false) => {
    const url = syncUrlRef.current;
    if (!url) {
      if (!isAuto) alert("Cloud Sync not configured.");
      return;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'SEND_COMPILED_PDF', 
          pdfBase64, 
          recipient, 
          className, 
          filename,
          isAuto,
          weekStarting: getNextWeekMonday()
        })
      });
      if (!isAuto) alert(`Success: Request sent to cloud for ${recipient}. Please check email in 1-2 mins.`);
      return true;
    } catch (err) {
      if (!isAuto) alert("Mobile sync error: Failed to reach server. Please try on PC or check internet.");
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
                <img 
                  src={SCHOOL_LOGO_URL} 
                  alt="SHS" 
                  className="w-full h-full object-contain"
                  onError={() => setLogoLoaded(false)}
                />
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
              teachers={teachers} 
              setTeachers={updateTeachers}
              submissions={submissions}
              setSubmissions={updateSubmissions}
              syncUrl={syncUrl}
              setSyncUrl={updateSyncUrl}
              onSendWarnings={triggerWarningEmails}
              onSendPdf={triggerCompiledPdfEmail}
            />
          ) : (
            <TeacherDashboard 
              teacher={user as Teacher} 
              submissions={submissions}
              setSubmissions={updateSubmissions}
              allSubmissions={submissions}
              isCloudEnabled={!!syncUrl}
              onSendWarnings={triggerWarningEmails}
              onSendPdf={triggerCompiledPdfEmail}
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
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">
              Designed and developed by ASHUTOSH KUMAR GAUTAM
            </p>
            <p className="text-[10px] text-gray-300 font-bold mt-1">{SCHOOL_NAME}, Jhumri Telaiya</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

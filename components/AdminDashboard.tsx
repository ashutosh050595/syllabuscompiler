
import React, { useState, useMemo } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission } from '../types';
import { getNextWeekMonday, ADMIN_EMAIL, INITIAL_TEACHERS, PORTAL_LINK, getWhatsAppLink } from '../constants';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => void;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
}

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, setSubmissions, syncUrl, setSyncUrl, onSendWarnings, onSendPdf }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'settings' | 'archive'>('monitor');
  const nextWeek = getNextWeekMonday();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const missingTeachers = useMemo(() => {
    const submittedIds = new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherId));
    return teachers.filter(t => !submittedIds.has(t.id));
  }, [teachers, submissions, nextWeek]);

  const defaultersByClass = useMemo(() => {
    const res: Record<string, Teacher[]> = {};
    missingTeachers.forEach(t => {
      t.assignedClasses.forEach(ac => {
        const key = `${ac.classLevel}-${ac.section}`;
        if (!res[key]) res[key] = [];
        if (!res[key].find(found => found.id === t.id)) res[key].push(t);
      });
    });
    return res;
  }, [missingTeachers]);

  const handleGlobalReminders = async () => {
    if (missingTeachers.length === 0) {
      alert("Excellent! All teachers have submitted plans for next week.");
      return;
    }
    setIsProcessing('reminders');
    const list = missingTeachers.map(t => ({ name: t.name, email: t.email }));
    await onSendWarnings(list, nextWeek);
    setIsProcessing(null);
  };

  const handleGlobalEmailCompilation = async () => {
    setIsProcessing('emails');
    const classes: { level: ClassLevel, sec: Section }[] = [
      { level: 'V', sec: 'A' }, { level: 'V', sec: 'B' }, { level: 'V', sec: 'C' },
      { level: 'VI', sec: 'A' }, { level: 'VI', sec: 'B' }, { level: 'VI', sec: 'C' }, { level: 'VI', sec: 'D' },
      { level: 'VII', sec: 'A' }, { level: 'VII', sec: 'B' }, { level: 'VII', sec: 'C' }, { level: 'VII', sec: 'D' }
    ];

    let sentCount = 0;
    for (const cls of classes) {
      const classTeacher = teachers.find(t => t.isClassTeacher?.classLevel === cls.level && t.isClassTeacher?.section === cls.sec);
      if (!classTeacher) continue;
      const relevantSubmissions = submissions.filter(s => s.weekStarting === nextWeek).flatMap(s => 
        s.plans.filter(p => p.classLevel === cls.level && p.section === cls.sec).map(p => ({ ...p, teacherName: s.teacherName }))
      );
      if (relevantSubmissions.length > 0) {
        const doc = generateSyllabusPDF(relevantSubmissions, { name: classTeacher.name, email: classTeacher.email, classLevel: cls.level, section: cls.sec }, nextWeek, "Saturday");
        const pdfBase64 = doc.output('datauristring');
        await onSendPdf(pdfBase64, classTeacher.email, `${cls.level}-${cls.sec}`, `Syllabus_${cls.level}${cls.sec}_${nextWeek}.pdf`);
        sentCount++;
      }
    }
    setIsProcessing(null);
    alert(`Batch Complete: ${sentCount} plans emailed.`);
  };

  const sendWhatsAppNudge = (teacher: Teacher, classKey: string) => {
    const message = `Hi ${teacher.name}, your lesson plan for Class ${classKey} is pending for week ${nextWeek}.\n\nSubmit here: ${PORTAL_LINK}`;
    const url = getWhatsAppLink(teacher.whatsapp, message);
    if (!url) {
      alert("WhatsApp number not properly configured in Faculty Profile.");
      return;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-gray-200 border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Governance</h2>
          <div className="flex items-center gap-3 mt-2">
             <span className={`w-3 h-3 rounded-full ${syncUrl ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
             <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">{syncUrl ? 'Cloud Automations Active (24/7)' : 'Local Mode'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
           <button onClick={handleGlobalReminders} disabled={!!isProcessing || missingTeachers.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl disabled:opacity-50">Send Batch Reminders</button>
           <button onClick={handleGlobalEmailCompilation} disabled={!!isProcessing} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl disabled:opacity-50">Batch Mail Reports</button>
           <button onClick={() => setActiveTab('settings')} className="bg-gray-900 hover:bg-black text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl transition-all active:scale-95">
             <i className="fas fa-sliders mr-2"></i> Cloud Setup
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl shadow-gray-200 border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
           {['monitor', 'registry', 'settings', 'archive'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
               {t} {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-12">
          {activeTab === 'monitor' && (
            <div className="space-y-12">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-gray-800">Pending Submissions <span className="text-gray-300 ml-2 font-medium">| Week: {nextWeek}</span></h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                  <div key={cls} className="bg-white border-2 border-gray-50 p-8 rounded-[3rem] hover:border-blue-100 transition-all shadow-sm">
                    <h4 className="font-black text-gray-900 text-xl mb-4">Class {cls}</h4>
                    <div className="space-y-4 mb-10">
                      {list.map(t => (
                        <div key={t.id} className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">{t.name}</span>
                          <div className="flex items-center gap-1.5">
                             <button onClick={() => sendWhatsAppNudge(t, cls)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"><i className="fab fa-whatsapp"></i></button>
                             <button onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} className="text-[8px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg uppercase transition-all">Mail</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-10">
               <div className="bg-blue-50 border border-blue-100 p-12 rounded-[3.5rem]">
                  <h3 className="text-2xl font-black text-blue-900 tracking-tight mb-4">Autonomous 24/7 Setup</h3>
                  <p className="text-sm text-blue-700/80 mb-10">Paste your <b>Deployment URL</b> below. This will enable the cloud to automatically send reminders and reports even when you are offline.</p>
                  <div className="space-y-6">
                     <div>
                        <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 mb-2">Google Apps Script Webhook</label>
                        <input type="url" className="w-full px-8 py-5 rounded-2xl bg-white border-blue-200 border outline-none font-bold text-blue-900" placeholder="https://script.google.com/..." value={syncUrl} onChange={e => setSyncUrl(e.target.value)} />
                     </div>
                     <div className="flex gap-4">
                        <button onClick={() => { setTeachers([...teachers]); alert("Registry Synced to Cloud!"); }} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-black text-xs">Force Sync Registry</button>
                        <button onClick={() => setSyncUrl('')} className="bg-white text-blue-600 border border-blue-200 px-10 py-5 rounded-2xl font-black text-xs hover:bg-blue-50">Disconnect</button>
                     </div>
                     {syncUrl && (
                       <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                         <i className="fas fa-check-circle text-emerald-500"></i>
                         <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Autonomous Reminders Enabled</p>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          )}
          
          {activeTab === 'registry' && (
            <div className="space-y-10">
               <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Faculty Registry</h3>
                  <button onClick={() => { setEditing({ assignedClasses: [] }); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl">Add Faculty</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {teachers.map(t => (
                   <div key={t.id} className="p-8 rounded-[2.5rem] border border-gray-50 bg-gray-50/30 hover:bg-white hover:border-blue-100 transition-all group relative text-center">
                     <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center text-blue-300 font-black border border-gray-100 text-2xl mb-4 mx-auto group-hover:text-blue-600 group-hover:border-blue-100">
                      {t.name.charAt(0)}
                     </div>
                     <p className="font-black text-gray-900 text-sm leading-tight">{t.name}</p>
                     <p className="text-[9px] text-gray-400 font-black uppercase mt-1 tracking-widest">{t.email}</p>
                     <button onClick={() => { setEditing(t); setShowModal(true); }} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white shadow-sm text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all"><i className="fas fa-edit text-xs"></i></button>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="bg-gray-900 p-10 text-white flex justify-between items-center">
               <h3 className="text-2xl font-black uppercase tracking-widest">Faculty Profile</h3>
               <button onClick={() => setShowModal(false)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
             </div>
             <div className="p-12 space-y-8">
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input type="text" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 outline-none font-bold focus:border-blue-500" placeholder="e.g. John Doe" value={editing?.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email</label>
                  <input type="email" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 outline-none font-bold focus:border-blue-500" value={editing?.email || ''} onChange={e => setEditing({...editing, email: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp</label>
                  <input type="tel" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 outline-none font-bold focus:border-blue-500" value={editing?.whatsapp || ''} onChange={e => setEditing({...editing, whatsapp: e.target.value})} />
                </div>
                <button onClick={() => {
                   if (!editing?.name || !editing?.email) return;
                   const updated = editing.id ? teachers.map(t => t.id === editing.id ? editing as Teacher : t) : [...teachers, { ...editing, id: crypto.randomUUID(), assignedClasses: [] } as Teacher];
                   setTeachers(updated);
                   setShowModal(false);
                }} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-2xl font-black shadow-2xl transition-all active:scale-95">Save Faculty Record</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

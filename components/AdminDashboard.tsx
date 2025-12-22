
import React, { useState, useMemo } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, AssignedClass } from '../types';
import { getNextWeekMonday, PORTAL_LINK, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS } from '../constants';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => Promise<boolean>;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
}

interface BatchStatus {
  isActive: boolean;
  type: 'reminders' | 'emails' | null;
  total: number;
  current: number;
  currentName: string;
  isFinished: boolean;
  log: string[];
}

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, setSubmissions, syncUrl, setSyncUrl, onSendWarnings, onSendPdf }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'settings' | 'archive'>('monitor');
  const nextWeek = getNextWeekMonday();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Batch Progress State
  const [batchStatus, setBatchStatus] = useState<BatchStatus>({
    isActive: false,
    type: null,
    total: 0,
    current: 0,
    currentName: '',
    isFinished: false,
    log: []
  });

  // Form State for "Teaching Assignments" builder in Modal
  const [tempAssignment, setTempAssignment] = useState<AssignedClass>({ classLevel: 'I', section: 'A', subject: '' });

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

    setBatchStatus({
      isActive: true,
      type: 'reminders',
      total: missingTeachers.length,
      current: 0,
      currentName: '',
      isFinished: false,
      log: []
    });

    for (let i = 0; i < missingTeachers.length; i++) {
      const t = missingTeachers[i];
      setBatchStatus(prev => ({ 
        ...prev, 
        current: i + 1, 
        currentName: t.name,
        log: [...prev.log, `Sending reminder to ${t.name}...`]
      }));
      
      // Batch process without blocking popups
      await onSendWarnings([{ name: t.name, email: t.email }], nextWeek);
      
      setBatchStatus(prev => {
        const newLog = [...prev.log];
        newLog[newLog.length - 1] = `✅ Sent to ${t.name}`;
        return { ...prev, log: newLog };
      });
    }

    setBatchStatus(prev => ({ ...prev, isFinished: true, currentName: 'All Reminders Sent!' }));
  };

  const handleGlobalEmailCompilation = async () => {
    const activeClasses = teachers.reduce((acc, t) => {
      if (t.isClassTeacher) {
        acc.push({ level: t.isClassTeacher.classLevel, sec: t.isClassTeacher.section, teacher: t });
      }
      return acc;
    }, [] as { level: ClassLevel, sec: Section, teacher: Teacher }[]);

    if (activeClasses.length === 0) return;

    setBatchStatus({
      isActive: true,
      type: 'emails',
      total: activeClasses.length,
      current: 0,
      currentName: '',
      isFinished: false,
      log: []
    });

    for (let i = 0; i < activeClasses.length; i++) {
      const cls = activeClasses[i];
      setBatchStatus(prev => ({ 
        ...prev, 
        current: i + 1, 
        currentName: `Class ${cls.level}-${cls.sec}`,
        log: [...prev.log, `Compiling PDF for Class ${cls.level}-${cls.sec}...`]
      }));

      const relevantSubmissions = submissions.filter(s => s.weekStarting === nextWeek).flatMap(s => 
        s.plans.filter(p => p.classLevel === cls.level && p.section === cls.sec).map(p => ({ ...p, teacherName: s.teacherName }))
      );

      if (relevantSubmissions.length > 0) {
        const doc = generateSyllabusPDF(relevantSubmissions, { name: cls.teacher.name, email: cls.teacher.email, classLevel: cls.level, section: cls.sec }, nextWeek, "Saturday");
        const pdfBase64 = doc.output('datauristring');
        await onSendPdf(pdfBase64, cls.teacher.email, `${cls.level}-${cls.sec}`, `Syllabus_${cls.level}${cls.sec}_${nextWeek}.pdf`);
        
        setBatchStatus(prev => {
          const newLog = [...prev.log];
          newLog[newLog.length - 1] = `✅ Emailed Class ${cls.level}-${cls.sec} to ${cls.teacher.name}`;
          return { ...prev, log: newLog };
        });
      } else {
        setBatchStatus(prev => {
          const newLog = [...prev.log];
          newLog[newLog.length - 1] = `⚠️ Skipped Class ${cls.level}-${cls.sec} (No submissions)`;
          return { ...prev, log: newLog };
        });
      }
    }

    setBatchStatus(prev => ({ ...prev, isFinished: true, currentName: 'Batch Mail Complete!' }));
  };

  const sendWhatsAppNudge = (teacher: Teacher, classKey: string) => {
    const message = `Hi ${teacher.name}, your lesson plan for Class ${classKey} is pending for week ${nextWeek}.\n\nSubmit here: ${PORTAL_LINK}`;
    const url = getWhatsAppLink(teacher.whatsapp, message);
    if (!url) {
      alert("WhatsApp number not properly configured.");
      return;
    }
    window.open(url, '_blank');
  };

  const handleCopyMagicLink = () => {
    if (!syncUrl) return;
    const base = window.location.origin + window.location.pathname;
    const magic = `${base}?sync=${encodeURIComponent(syncUrl)}`;
    navigator.clipboard.writeText(magic);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const addAssignment = () => {
    if (!tempAssignment.subject) return;
    const current = editing?.assignedClasses || [];
    setEditing({ ...editing, assignedClasses: [...current, { ...tempAssignment }] });
    setTempAssignment({ ...tempAssignment, subject: '' });
  };

  const removeAssignment = (index: number) => {
    const current = editing?.assignedClasses || [];
    const updated = current.filter((_, i) => i !== index);
    setEditing({ ...editing, assignedClasses: updated });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Batch Processing Progress Overlay */}
      {batchStatus.isActive && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/80 backdrop-blur-xl transition-all">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
            <div className={`p-10 text-center space-y-6 ${batchStatus.isFinished ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <div className="flex justify-center">
                <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl ${batchStatus.isFinished ? 'bg-emerald-600 text-white animate-bounce' : 'bg-blue-600 text-white'}`}>
                  {batchStatus.isFinished ? (
                    <i className="fas fa-check-double"></i>
                  ) : (
                    <i className={`fas ${batchStatus.type === 'reminders' ? 'fa-paper-plane animate-pulse' : 'fa-file-pdf animate-spin-slow'}`}></i>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight">
                  {batchStatus.isFinished ? 'Mission Complete!' : (batchStatus.type === 'reminders' ? 'Sending Reminders' : 'Compiling Reports')}
                </h3>
                <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-2">
                  {batchStatus.isFinished ? 'Total Tasks Handled Successfully' : `Processing ${batchStatus.current} of ${batchStatus.total}`}
                </p>
              </div>

              {!batchStatus.isFinished && (
                <div className="space-y-4">
                  <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                      style={{ width: `${(batchStatus.current / batchStatus.total) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-sm font-black text-blue-600 animate-pulse">{batchStatus.currentName}</p>
                </div>
              )}
            </div>

            <div className="p-8 max-h-[300px] overflow-y-auto bg-white custom-scrollbar">
              <div className="space-y-3">
                {batchStatus.log.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-xs font-bold text-gray-600 animate-in slide-in-from-bottom-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    {entry}
                  </div>
                ))}
              </div>
            </div>

            {batchStatus.isFinished && (
              <div className="p-8 bg-gray-50">
                <button 
                  onClick={() => setBatchStatus(prev => ({ ...prev, isActive: false }))} 
                  className="w-full bg-gray-900 hover:bg-black text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl transition-all active:scale-95"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-gray-200 border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Governance</h2>
          <div className="flex items-center gap-3 mt-2">
             <span className={`w-3 h-3 rounded-full ${syncUrl ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
             <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">{syncUrl ? 'Cloud Automations Active (24/7)' : 'Local Mode'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
           <button onClick={handleGlobalReminders} disabled={batchStatus.isActive || missingTeachers.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl disabled:opacity-50 transition-all">Send Batch Reminders</button>
           <button onClick={handleGlobalEmailCompilation} disabled={batchStatus.isActive} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl disabled:opacity-50 transition-all">Batch Mail Reports</button>
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

        <div className="p-8 md:p-12">
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

          {activeTab === 'registry' && (
            <div className="space-y-10">
               <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Faculty Registry</h3>
                  <button onClick={() => { setEditing({ assignedClasses: [] }); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl transition-all">Add New Faculty</button>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-separate border-spacing-y-4">
                   <thead>
                     <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                       <th className="pb-4 pl-8">Name</th>
                       <th className="pb-4">Teaching Assignment</th>
                       <th className="pb-4">Class Teacher</th>
                       <th className="pb-4">WhatsApp</th>
                       <th className="pb-4">Email ID</th>
                       <th className="pb-4 pr-8 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {teachers.map(t => (
                       <tr key={t.id} className="bg-gray-50/50 hover:bg-white border border-transparent hover:border-blue-100 transition-all rounded-3xl group">
                         <td className="py-6 pl-8 rounded-l-[2rem]">
                           <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xs">
                               {t.name.charAt(0)}
                             </div>
                             <span className="font-black text-gray-800 text-sm">{t.name}</span>
                           </div>
                         </td>
                         <td className="py-6">
                           <div className="flex flex-wrap gap-1.5 max-w-xs">
                             {t.assignedClasses.length > 0 ? (
                               Array.from(new Set(t.assignedClasses.map(ac => `${ac.classLevel}-${ac.section}`))).map(tag => (
                                 <span key={tag} className="text-[9px] font-black bg-white border border-gray-100 px-2 py-1 rounded-lg text-gray-600">{tag}</span>
                               ))
                             ) : <span className="text-gray-300 text-[10px] font-bold">None</span>}
                           </div>
                         </td>
                         <td className="py-6">
                           {t.isClassTeacher ? (
                             <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Class {t.isClassTeacher.classLevel}-{t.isClassTeacher.section}</span>
                           ) : (
                             <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-3 py-1 rounded-full uppercase">No</span>
                           )}
                         </td>
                         <td className="py-6 text-xs font-bold text-gray-600">{t.whatsapp || '---'}</td>
                         <td className="py-6 text-xs font-bold text-gray-400">{t.email}</td>
                         <td className="py-6 pr-8 text-right rounded-r-[2rem]">
                            <button onClick={() => { setEditing(t); setShowModal(true); }} className="w-10 h-10 rounded-xl bg-white shadow-sm text-gray-400 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all ml-auto">
                              <i className="fas fa-edit text-xs"></i>
                            </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-10">
               <div className="bg-blue-50 border border-blue-100 p-12 rounded-[3.5rem]">
                  <h3 className="text-2xl font-black text-blue-900 tracking-tight mb-4">Onboarding & Cloud</h3>
                  <p className="text-sm text-blue-700/80 mb-10">Ensure the <b>Deployment URL</b> is correct. Use the button below to share a "Magic Link" with teachers so they don't have to manually configure their devices.</p>
                  
                  <div className="space-y-6">
                     <div>
                        <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 mb-2">Google Apps Script Webhook</label>
                        <input type="url" className="w-full px-8 py-5 rounded-2xl bg-white border-blue-200 border outline-none font-bold text-blue-900" placeholder="https://script.google.com/..." value={syncUrl} onChange={e => setSyncUrl(e.target.value)} />
                     </div>
                     <div className="flex flex-col gap-4">
                        <button 
                          onClick={handleCopyMagicLink}
                          disabled={!syncUrl}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
                        >
                          {copyFeedback ? (
                            <><i className="fas fa-check"></i> Magic Link Copied!</>
                          ) : (
                            <><i className="fas fa-magic"></i> Copy Magic Link for Faculty</>
                          )}
                        </button>
                        <div className="flex gap-4">
                          <button onClick={() => { setTeachers([...teachers]); alert("Registry Synced!"); }} className="flex-1 bg-white text-blue-600 border border-blue-200 px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50">Manual Registry Sync</button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md overflow-y-auto">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200">
             <div className="bg-gray-900 p-10 text-white flex justify-between items-center rounded-t-[3.5rem]">
               <h3 className="text-2xl font-black uppercase tracking-widest">Faculty Configuration</h3>
               <button onClick={() => setShowModal(false)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
             </div>
             
             <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="bg-gray-50 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-gray-800 text-sm">Class Teacher Status</h4>
                    </div>
                    <button 
                      onClick={() => setEditing({ ...editing, isClassTeacher: editing?.isClassTeacher ? undefined : { classLevel: 'I', section: 'A' } })}
                      className={`px-6 py-2 rounded-full text-[10px] font-black uppercase transition-all ${editing?.isClassTeacher ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                    >
                      {editing?.isClassTeacher ? 'Yes' : 'No'}
                    </button>
                  </div>
                  {editing?.isClassTeacher && (
                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                       <div>
                         <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Class</label>
                         <select className="w-full px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-sm" value={editing.isClassTeacher.classLevel} onChange={e => setEditing({...editing, isClassTeacher: { ...editing.isClassTeacher!, classLevel: e.target.value as ClassLevel }})}>
                           {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
                       </div>
                       <div>
                         <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Section</label>
                         <select className="w-full px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-sm" value={editing.isClassTeacher.section} onChange={e => setEditing({...editing, isClassTeacher: { ...editing.isClassTeacher!, section: e.target.value as Section }})}>
                           {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                       </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input type="text" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold focus:border-blue-500" value={editing?.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp</label>
                    <input type="tel" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold focus:border-blue-500" value={editing?.whatsapp || ''} onChange={e => setEditing({...editing, whatsapp: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email ID</label>
                    <input type="email" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold focus:border-blue-500" value={editing?.email || ''} onChange={e => setEditing({...editing, email: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assignments</label>
                  <div className="bg-blue-50 p-6 rounded-3xl space-y-4">
                     <div className="grid grid-cols-3 gap-3">
                        <select className="px-4 py-3 rounded-xl bg-white border border-blue-100 font-bold text-xs" value={tempAssignment.classLevel} onChange={e => setTempAssignment({...tempAssignment, classLevel: e.target.value as ClassLevel})}>
                          {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select className="px-4 py-3 rounded-xl bg-white border border-blue-100 font-bold text-xs" value={tempAssignment.section} onChange={e => setTempAssignment({...tempAssignment, section: e.target.value as Section})}>
                          {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="text" placeholder="Subject" className="px-4 py-3 rounded-xl bg-white border border-blue-100 font-bold text-xs" value={tempAssignment.subject} onChange={e => setTempAssignment({...tempAssignment, subject: e.target.value})} />
                     </div>
                     <button onClick={addAssignment} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-[10px] uppercase">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing?.assignedClasses?.map((ac, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-xl">
                        <span className="text-[10px] font-black text-gray-700">{ac.classLevel}-{ac.section} &bull; {ac.subject}</span>
                        <button onClick={() => removeAssignment(idx)} className="text-gray-300 hover:text-red-500"><i className="fas fa-times-circle"></i></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => {
                   if (!editing?.name || !editing?.email) return;
                   const updated = editing.id ? teachers.map(t => t.id === editing.id ? editing as Teacher : t) : [...teachers, { ...editing, id: crypto.randomUUID(), assignedClasses: editing.assignedClasses || [] } as Teacher];
                   setTeachers(updated);
                   setShowModal(false);
                }} className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black text-lg shadow-xl">Save Record</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

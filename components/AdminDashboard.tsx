
import React, { useState, useMemo } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission } from '../types';
import { getNextWeekMonday, ADMIN_EMAIL, INITIAL_TEACHERS } from '../constants';
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
        s.plans.filter(p => p.classLevel === cls.level && p.section === cls.sec).map(p => ({
          ...p,
          teacherName: s.teacherName
        }))
      );

      if (relevantSubmissions.length > 0) {
        const doc = generateSyllabusPDF(relevantSubmissions, { 
          name: classTeacher.name, 
          email: classTeacher.email, 
          classLevel: cls.level, 
          section: cls.sec 
        }, nextWeek, "Saturday");
        
        const pdfBase64 = doc.output('datauristring');
        await onSendPdf(pdfBase64, classTeacher.email, `${cls.level}-${cls.sec}`, `Syllabus_${cls.level}${cls.sec}_${nextWeek}.pdf`);
        sentCount++;
      }
    }
    setIsProcessing(null);
    alert(`Batch Operation Complete: ${sentCount} compiled plans emailed to Class Teachers.`);
  };

  const handleManualCompiledPDF = async (classLevel: ClassLevel, section: Section, emailMode: boolean = false) => {
    const relevantSubmissions = submissions.filter(s => s.weekStarting === nextWeek).flatMap(s => 
      s.plans.filter(p => p.classLevel === classLevel && p.section === section).map(p => ({
        ...p,
        teacherName: s.teacherName
      }))
    );
    
    if (relevantSubmissions.length === 0 && !emailMode) {
      alert("No submissions to compile for this class.");
      return;
    }

    const doc = generateSyllabusPDF(relevantSubmissions, { name: 'Admin Office', email: ADMIN_EMAIL, classLevel, section }, nextWeek, "Saturday");
    
    if (emailMode) {
      const pdfBase64 = doc.output('datauristring');
      const processId = `email-${classLevel}-${section}`;
      setIsProcessing(processId);
      await onSendPdf(pdfBase64, ADMIN_EMAIL, `${classLevel}-${section}`, `AdminCompiled_${classLevel}${section}.pdf`);
      setIsProcessing(null);
    } else {
      doc.save(`Compiled_${classLevel}${section}_${nextWeek}.pdf`);
    }
  };

  const sendWhatsAppNudge = (teacher: Teacher, classKey: string) => {
    if (!teacher.whatsapp) {
      alert("WhatsApp number not registered.");
      return;
    }
    const message = `Hi ${teacher.name}, this is a reminder that your lesson plan for Class ${classKey} is pending for the week starting ${nextWeek}. Please submit it as soon as possible on the portal.`;
    const url = `https://wa.me/${teacher.whatsapp.startsWith('+') ? teacher.whatsapp.substring(1) : teacher.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-gray-200 border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Governance</h2>
          <div className="flex items-center gap-3 mt-2">
             <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></span>
             <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">{syncUrl ? 'Cloud Automations Active' : 'Local Sandbox Mode'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
           <button 
            onClick={handleGlobalReminders} 
            disabled={!!isProcessing || missingTeachers.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl shadow-blue-100 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
           >
             {isProcessing === 'reminders' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bell"></i>}
             <span>Send All Email Reminders</span>
           </button>
           <button 
            onClick={handleGlobalEmailCompilation}
            disabled={!!isProcessing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
           >
             {isProcessing === 'emails' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
             <span>Batch Mail Compiled Plans</span>
           </button>
           <button onClick={() => setActiveTab('settings')} className="bg-gray-900 hover:bg-black text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl flex items-center gap-3 transition-all active:scale-95">
             <i className="fas fa-sliders"></i>
             <span>Cloud Integrations</span>
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl shadow-gray-200 border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
           {['monitor', 'registry', 'settings', 'archive'].map(t => (
             <button 
              key={t} 
              onClick={() => setActiveTab(t as any)} 
              className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
             >
               {t}
               {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-12">
          {activeTab === 'monitor' && (
            <div className="space-y-12">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-gray-800">Pending Submissions for Upcoming Week <span className="text-gray-300 ml-2 font-medium">| Starting: {nextWeek}</span></h3>
                <div className="px-5 py-2 bg-blue-50 text-blue-600 rounded-full font-black text-[10px] uppercase tracking-widest">{missingTeachers.length} Pending</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                  <div key={cls} className="bg-white border-2 border-gray-50 p-8 rounded-[3rem] hover:border-blue-100 transition-all shadow-sm hover:shadow-xl group">
                    <div className="flex justify-between items-center mb-8">
                      <div>
                        <h4 className="font-black text-gray-900 text-xl">Class {cls}</h4>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Status Overview</p>
                      </div>
                      <span className="bg-gray-100 text-gray-500 px-4 py-1.5 rounded-full text-[10px] font-black">{list.length} Defaulters</span>
                    </div>
                    <div className="space-y-4 mb-10 min-h-[100px]">
                      {list.map(t => (
                        <div key={t.id} className="flex items-center justify-between group/row">
                          <span className="text-xs font-bold text-gray-600">{t.name}</span>
                          <div className="flex items-center gap-1.5">
                             <button 
                              onClick={() => sendWhatsAppNudge(t, cls)}
                              className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                             >
                              <i className="fab fa-whatsapp"></i>
                             </button>
                             <button 
                              onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} 
                              className="text-[8px] font-black text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg uppercase tracking-widest transition-all"
                             >
                              Mail
                             </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-6 border-t border-gray-50">
                      <button 
                        onClick={() => { const [cl, sec] = cls.split('-') as [any, any]; handleManualCompiledPDF(cl, sec, true); }} 
                        disabled={!!isProcessing}
                        className="py-5 bg-indigo-50 text-indigo-600 rounded-2xl text-[9px] font-black hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                      >
                        {isProcessing === `email-${cls}` ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-envelope"></i>}
                        <span>Mail PDF</span>
                      </button>
                      <button onClick={() => { const [cl, sec] = cls.split('-') as [any, any]; handleManualCompiledPDF(cl, sec, false); }} className="py-5 bg-gray-50 text-gray-600 rounded-2xl text-[9px] font-black hover:bg-gray-900 hover:text-white transition-all flex items-center justify-center gap-2">
                        <i className="fas fa-download"></i> Save Local
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-10 animate-in fade-in duration-500">
               <div className="bg-blue-50 border border-blue-100 p-12 rounded-[3.5rem]">
                  <div className="flex items-center gap-5 mb-8">
                    <div className="w-16 h-16 bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center text-2xl shadow-xl shadow-blue-200">
                      <i className="fas fa-cloud"></i>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-blue-900 tracking-tight">Cloud Integration</h3>
                      <p className="text-blue-500 font-bold text-[10px] uppercase tracking-widest mt-1">Configuration Required</p>
                    </div>
                  </div>
                  <p className="text-sm text-blue-700/80 font-medium mb-10 leading-relaxed">
                    Enter your school's <strong>Google Apps Script Webhook</strong>. This enables batch emailing and automated PDF generation.
                  </p>
                  <div className="space-y-6">
                     <div className="space-y-3">
                        <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Deployment URL</label>
                        <input 
                          type="url" 
                          className="w-full px-8 py-5 rounded-2xl bg-white border-blue-200 border outline-none font-bold text-blue-900 focus:ring-4 focus:ring-blue-500/10 placeholder:text-blue-200" 
                          placeholder="https://script.google.com/..." 
                          value={syncUrl} 
                          onChange={e => setSyncUrl(e.target.value)} 
                        />
                     </div>
                     <div className="flex gap-4">
                        <button onClick={() => alert("Deployment Hook Updated!")} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-black text-xs shadow-xl shadow-blue-100 transition-all active:scale-95">Update Hook</button>
                        <button onClick={() => setSyncUrl('')} className="bg-white text-blue-600 border border-blue-200 px-10 py-5 rounded-2xl font-black text-xs hover:bg-blue-50 transition-all">Disconnect</button>
                     </div>
                  </div>
               </div>
            </div>
          )}
          
          {activeTab === 'registry' && (
            <div className="space-y-10">
               <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Faculty Registry</h3>
                  <button onClick={() => { setEditing({ assignedClasses: [] }); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl shadow-blue-100 transition-all active:scale-95">
                    <i className="fas fa-plus mr-2"></i> Add Faculty Member
                  </button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {teachers.map(t => (
                   <div key={t.id} className="p-8 rounded-[2.5rem] border border-gray-50 bg-gray-50/30 hover:bg-white hover:border-blue-100 transition-all group relative text-center">
                     <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center text-blue-300 font-black border border-gray-100 text-2xl mb-4 mx-auto group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-all">
                      {t.name.charAt(0)}
                     </div>
                     <p className="font-black text-gray-900 text-sm leading-tight">{t.name}</p>
                     <p className="text-[9px] text-gray-400 font-black uppercase mt-1 tracking-widest">{t.email}</p>
                     <button onClick={() => { setEditing(t); setShowModal(true); }} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white shadow-sm text-gray-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white flex items-center justify-center">
                       <i className="fas fa-edit text-xs"></i>
                     </button>
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
               <div>
                  <h3 className="text-2xl font-black uppercase tracking-widest leading-none">Faculty Profile</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-2 uppercase tracking-widest">Profile Editor</p>
               </div>
               <button onClick={() => setShowModal(false)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
             </div>
             <div className="p-12 space-y-8">
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input type="text" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold text-gray-800 focus:border-blue-500" placeholder="e.g. John Doe" value={editing?.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official Email</label>
                  <input type="email" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold text-gray-800 focus:border-blue-500" placeholder="e.g. name@sacredheartkoderma.org" value={editing?.email || ''} onChange={e => setEditing({...editing, email: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                  <input type="tel" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold text-gray-800 focus:border-blue-500" placeholder="e.g. 91xxxxxxxxxx" value={editing?.whatsapp || ''} onChange={e => setEditing({...editing, whatsapp: e.target.value})} />
                </div>
                <button onClick={() => {
                   if (!editing?.name || !editing?.email) return;
                   const updated = editing.id ? teachers.map(t => t.id === editing.id ? editing as Teacher : t) : [...teachers, { ...editing, id: crypto.randomUUID(), assignedClasses: [] } as Teacher];
                   setTeachers(updated);
                   setShowModal(false);
                }} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-2xl font-black shadow-2xl shadow-blue-100 text-lg transition-all active:scale-95">Save Faculty Record</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

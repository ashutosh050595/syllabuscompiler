
import React, { useState, useMemo } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, SCHOOL_NAME } from '../constants';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  resubmitRequests: ResubmitRequest[];
  onApproveResubmit: (id: string) => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => Promise<boolean>;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
  onResetRegistry?: () => Promise<void>;
  onForceReset?: (teacherId: string, week: string) => Promise<void>;
  onForceResetAll?: (week: string) => Promise<void>;
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

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, setSubmissions, resubmitRequests, onApproveResubmit, syncUrl, onSendWarnings, onSendPdf, onResetRegistry, onForceReset, onForceResetAll }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'archive'>('monitor');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const nextWeek = getNextWeekMonday();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [outlineCopyFeedback, setOutlineCopyFeedback] = useState(false);
  
  const [batchStatus, setBatchStatus] = useState<BatchStatus>({
    isActive: false,
    type: null,
    total: 0,
    current: 0,
    currentName: '',
    isFinished: false,
    log: []
  });

  const [tempAssignment, setTempAssignment] = useState<AssignedClass>({ classLevel: 'I', section: 'A', subject: '' });

  const appOutlineText = `🚀 ${SCHOOL_NAME} - SYLLABUS MANAGER V2\n\n` +
    `A professional academic automation system designed for precision and efficiency.\n\n` +
    `✨ CORE FEATURES:\n` +
    `• Role-Based Dashboards: Secure access for Faculty & Administrators.\n` +
    `• AI Polishing: Gemini-powered refinement for professional lesson plans.\n` +
    `• Auto-PDF Compilation: One-click Landscape PDF generation for Class Teachers.\n` +
    `• Cloud Governance: Real-time sync with Google Sheets (No data loss).\n` +
    `• Communication Suite: Automated WhatsApp & Email notifications.\n` +
    `• Batch Processing: Send school-wide reminders or reports in seconds.\n\n` +
    `Developed to uphold the academic excellence of Sacred Heart School.`;

  const handleCopyAppOutline = () => {
    navigator.clipboard.writeText(appOutlineText).then(() => {
      setOutlineCopyFeedback(true);
      setTimeout(() => setOutlineCopyFeedback(false), 2000);
    });
  };

  const missingTeachers = useMemo(() => {
    const submittedIds = new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherId));
    return teachers.filter(t => !submittedIds.has(t.id));
  }, [teachers, submissions, nextWeek]);

  const submittedTeachers = useMemo(() => {
    return submissions.filter(s => s.weekStarting === nextWeek);
  }, [submissions, nextWeek]);

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

  const handleCopyOutline = () => {
    const outline = teachers.map(t => {
      const ctInfo = t.isClassTeacher ? `(Class Teacher: ${t.isClassTeacher.classLevel}-${t.isClassTeacher.section})` : '';
      const assignments = t.assignedClasses.map(ac => `${ac.classLevel}-${ac.section}: ${ac.subject}`).join(', ');
      return `Name: ${t.name}\nEmail: ${t.email}\nWhatsApp: ${t.whatsapp || 'N/A'}\nStatus: ${ctInfo || 'Subject Teacher'}\nAssignments: ${assignments}\n`;
    }).join('\n---------------------------\n\n');

    const fullText = `SACRED HEART FACULTY REGISTRY OUTLINE\n====================================\n\n${outline}`;
    
    navigator.clipboard.writeText(fullText).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const handleGlobalReminders = async () => {
    if (missingTeachers.length === 0) return;

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

  const handleSaveTeacher = () => {
    if (!editing || !editing.name || !editing.email) return;
    
    let updatedTeachers: Teacher[];
    if (editing.id) {
      updatedTeachers = teachers.map(t => t.id === editing.id ? (editing as Teacher) : t);
    } else {
      const newTeacher: Teacher = {
        ...(editing as Teacher),
        id: editing.name.toLowerCase().replace(/\s+/g, '-'),
        assignedClasses: editing.assignedClasses || []
      };
      updatedTeachers = [...teachers, newTeacher];
    }
    
    setTeachers(updatedTeachers);
    setShowModal(false);
    setEditing(null);
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
      
      {/* Batch Processing Overlay */}
      {batchStatus.isActive && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/80 backdrop-blur-xl">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className={`p-10 text-center space-y-6 ${batchStatus.isFinished ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <div className="flex justify-center">
                <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl ${batchStatus.isFinished ? 'bg-emerald-600 text-white animate-bounce' : 'bg-blue-600 text-white'}`}>
                  {batchStatus.isFinished ? <i className="fas fa-check-double"></i> : <i className={`fas ${batchStatus.type === 'reminders' ? 'fa-paper-plane animate-pulse' : 'fa-file-pdf animate-spin-slow'}`}></i>}
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-900">{batchStatus.isFinished ? 'Mission Complete!' : 'Processing Tasks'}</h3>
                <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-2">{batchStatus.currentName || 'Starting Batch...'}</p>
              </div>
              {!batchStatus.isFinished && (
                <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-500 shadow-blue-500/50 shadow-lg" style={{ width: `${(batchStatus.current / batchStatus.total) * 100}%` }}></div>
                </div>
              )}
            </div>
            <div className="p-8 max-h-[250px] overflow-y-auto bg-white custom-scrollbar">
              <div className="space-y-3">
                {batchStatus.log.map((entry: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-xs font-bold text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>{entry}
                  </div>
                ))}
              </div>
            </div>
            {batchStatus.isFinished && (
              <div className="p-8 bg-gray-50">
                <button onClick={() => setBatchStatus(prev => ({ ...prev, isActive: false }))} className="w-full bg-gray-900 text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs">Return to Dashboard</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Header */}
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <div className="flex items-center gap-4">
             <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Governance</h2>
             <button onClick={() => setShowInfoModal(true)} className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                <i className="fas fa-info-circle"></i>
             </button>
          </div>
          <div className="flex items-center gap-3 mt-2">
             <span className={`w-3 h-3 rounded-full ${syncUrl ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
             <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">{syncUrl ? 'Cloud Automations Active' : 'Local Mode'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
           <button onClick={handleGlobalReminders} disabled={missingTeachers.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl disabled:opacity-50 transition-all">Send Batch Reminders</button>
           <button onClick={handleGlobalEmailCompilation} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl transition-all">Batch Mail Reports</button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
           {['monitor', 'registry', 'requests', 'archive'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
               {t} {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-8 md:p-12">
          {activeTab === 'monitor' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                <div>
                  <h3 className="text-2xl font-black text-gray-800 mb-8">Pending Submissions <span className="text-gray-300 ml-2 font-medium">| Week: {nextWeek}</span></h3>
                  <div className="space-y-6">
                    {Object.keys(defaultersByClass).length > 0 ? (
                      Object.entries(defaultersByClass).map(([cls, list]) => (
                        <div key={cls} className="bg-white border-2 border-gray-50 p-6 rounded-[2.5rem] hover:border-blue-100 transition-all">
                          <h4 className="font-black text-gray-900 text-lg mb-4">Class {cls}</h4>
                          <div className="space-y-3">
                            {(list as Teacher[]).map(t => (
                              <div key={t.id} className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">{t.name}</span>
                                <div className="flex gap-1">
                                  <button onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Reminder for Class ${cls}`)||'', '_blank')} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><i className="fab fa-whatsapp"></i></button>
                                  <button onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} className="text-[8px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg uppercase">Mail</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : <div className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest bg-gray-50 rounded-[2.5rem]">No pending submissions</div>}
                  </div>
                </div>

                <div>
                   <div className="flex justify-between items-center mb-8">
                     <h3 className="text-2xl font-black text-gray-800">Submitted Plans</h3>
                     {submittedTeachers.length > 0 && onForceResetAll && (
                       <button 
                         onClick={() => { if(window.confirm("Are you sure you want to RESET ALL submissions for this week?")) onForceResetAll(nextWeek); }}
                         className="px-4 py-2 bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                       >
                         Reset All
                       </button>
                     )}
                   </div>
                   <div className="space-y-4">
                      {submittedTeachers.length > 0 ? (
                        submittedTeachers.map(sub => (
                          <div key={sub.id} className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-[2rem] flex items-center justify-between">
                             <div>
                                <h4 className="font-black text-gray-900 text-sm">{sub.teacherName}</h4>
                                <p className="text-[10px] text-emerald-600 font-bold mt-1">Submitted: {new Date(sub.timestamp).toLocaleDateString()}</p>
                             </div>
                             {onForceReset && (
                               <button 
                                 onClick={() => { if(window.confirm(`Reset plan for ${sub.teacherName}?`)) onForceReset(sub.teacherId, nextWeek); }}
                                 className="w-10 h-10 rounded-xl bg-white text-red-500 shadow-sm hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                                 title="Force Reset Submission"
                               >
                                 <i className="fas fa-trash-alt"></i>
                               </button>
                             )}
                          </div>
                        ))
                      ) : (
                        <div className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest bg-gray-50 rounded-[2.5rem]">No submissions yet</div>
                      )}
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="space-y-10">
               <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Faculty Registry</h3>
                  <div className="flex gap-3">
                    {onResetRegistry && (
                      <button 
                        onClick={onResetRegistry}
                        className="px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-2"
                      >
                        <i className="fas fa-database"></i> Reset & Upload Defaults
                      </button>
                    )}
                    <button 
                      onClick={handleCopyOutline}
                      className={`px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${copyFeedback ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {copyFeedback ? <><i className="fas fa-check"></i> Outline Copied</> : <><i className="fas fa-copy"></i> Copy Outline</>}
                    </button>
                    <button onClick={() => { setEditing({ assignedClasses: [] }); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 rounded-2xl font-black text-xs shadow-xl transition-all">Add New Faculty</button>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-separate border-spacing-y-4">
                   <thead>
                     <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                       <th className="pb-4 pl-8">Name</th>
                       <th className="pb-4">Classes</th>
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
                           <span className="font-black text-gray-800 text-sm">{t.name}</span>
                         </td>
                         <td className="py-6">
                           <div className="flex flex-wrap gap-1">
                             {[...new Set(t.assignedClasses.map(ac => `${ac.classLevel}-${ac.section}`))].map(tag => (
                               <span key={tag} className="text-[9px] font-black bg-white border border-gray-100 px-2 py-1 rounded-lg text-gray-600">{tag}</span>
                             ))}
                           </div>
                         </td>
                         <td className="py-6">
                           {t.isClassTeacher ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{t.isClassTeacher.classLevel}-{t.isClassTeacher.section}</span> : 'No'}
                         </td>
                         <td className="py-6 text-xs font-bold text-gray-600">{t.whatsapp || '---'}</td>
                         <td className="py-6 text-xs font-bold text-gray-400">{t.email}</td>
                         <td className="py-6 pr-8 text-right rounded-r-[2rem]">
                            <button onClick={() => { setEditing(t); setShowModal(true); }} className="w-10 h-10 rounded-xl bg-white shadow-sm text-gray-400 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all ml-auto"><i className="fas fa-edit text-xs"></i></button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-10">
               <h3 className="text-2xl font-black text-gray-800 tracking-tight">Resubmission Requests</h3>
               {resubmitRequests.filter(r => r.status === 'pending').length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                   {resubmitRequests.filter(r => r.status === 'pending').map(req => (
                     <div key={req.id} className="bg-white border-2 border-amber-50 p-8 rounded-[3rem] hover:border-amber-100 transition-all">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <h4 className="font-black text-gray-900 text-lg">{req.teacherName}</h4>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Requested on: {new Date(req.timestamp).toLocaleString()}</p>
                           </div>
                           <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center"><i className="fas fa-undo"></i></div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl mb-6">
                           <p className="text-xs font-bold text-gray-600">Week Beginning</p>
                           <p className="text-sm font-black text-gray-900">{req.weekStarting}</p>
                        </div>
                        <button 
                          onClick={() => onApproveResubmit(req.id)}
                          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-100"
                        >
                          Approve Resubmission
                        </button>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-20 bg-gray-50 rounded-[3rem] border border-dashed border-gray-200">
                    <i className="fas fa-check-double text-gray-200 text-6xl mb-4"></i>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No pending requests</p>
                 </div>
               )}
            </div>
          )}

          {activeTab === 'archive' && (
            <div className="text-center py-20">
              <i className="fas fa-box-archive text-gray-200 text-6xl mb-4"></i>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Archive content will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Info / Outline Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md">
           <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="bg-blue-600 p-10 text-white flex justify-between items-center">
               <div>
                  <h3 className="text-2xl font-black uppercase tracking-widest">System Outline</h3>
                  <p className="text-blue-100 text-[10px] font-bold mt-1 uppercase tracking-widest">Platform capabilities & Sharing</p>
               </div>
               <button onClick={() => setShowInfoModal(false)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
             </div>
             <div className="p-10 space-y-8">
                <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100">
                   <pre className="text-[11px] font-medium text-gray-600 whitespace-pre-wrap leading-relaxed">{appOutlineText}</pre>
                </div>
                <button 
                  onClick={handleCopyAppOutline}
                  className={`w-full py-6 rounded-3xl font-black uppercase text-xs tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${outlineCopyFeedback ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                >
                   {outlineCopyFeedback ? <><i className="fas fa-check"></i> Outline Copied to Clipboard</> : <><i className="fas fa-copy"></i> Copy Professional Outline</>}
                </button>
             </div>
           </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md overflow-y-auto">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200">
             <div className="bg-gray-900 p-10 text-white flex justify-between items-center rounded-t-[3.5rem]">
               <h3 className="text-2xl font-black uppercase tracking-widest">Faculty Configuration</h3>
               <button onClick={() => setShowModal(false)} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
             </div>
             
             <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="bg-gray-50 p-6 rounded-3xl space-y-4">
                    <h4 className="font-black text-gray-800 text-sm">Class Teacher Responsibility</h4>
                    <div className="flex gap-4">
                       <select className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-sm" value={editing?.isClassTeacher?.classLevel || ''} onChange={e => setEditing({...editing, isClassTeacher: e.target.value ? { classLevel: e.target.value as ClassLevel, section: editing?.isClassTeacher?.section || 'A' } : undefined })}>
                         <option value="">None</option>
                         {ALL_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                       </select>
                       {editing?.isClassTeacher && (
                         <select className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-sm" value={editing.isClassTeacher.section} onChange={e => setEditing({...editing, isClassTeacher: { ...editing.isClassTeacher!, section: e.target.value as Section }})}>
                           {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                       )}
                    </div>
                </div>

                <div className="space-y-4">
                  <input type="text" placeholder="Name" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold" value={editing?.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
                  <input type="email" placeholder="Email ID" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold" value={editing?.email || ''} onChange={e => setEditing({...editing, email: e.target.value})} />
                  <input type="tel" placeholder="WhatsApp Number" className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold" value={editing?.whatsapp || ''} onChange={e => setEditing({...editing, whatsapp: e.target.value})} />
                </div>

                <div className="space-y-6">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Teaching Assignments</label>
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
                     <button onClick={addAssignment} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-[10px] uppercase">Add Assignment</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing?.assignedClasses?.map((ac, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-xl group/tag">
                        <span className="text-[10px] font-black text-gray-700">{ac.classLevel}-{ac.section} &bull; {ac.subject}</span>
                        <button onClick={() => removeAssignment(idx)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times"></i></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={handleSaveTeacher} className="w-full bg-gray-900 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest">Save Faculty Details</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

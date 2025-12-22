
import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassPlan, Submission, Section, ClassLevel } from '../types';
import { getNextWeekMonday, CLASS_STYLES, INITIAL_TEACHERS, PORTAL_LINK } from '../constants';
import { refineSyllabusContent } from '../services/geminiService';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teacher: Teacher;
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  allSubmissions: WeeklySubmission[];
  isCloudEnabled: boolean;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => void;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
}

interface GroupedAssignment {
  id: string; 
  classLevel: ClassLevel;
  subject: string;
  sections: Section[];
}

const TeacherDashboard: React.FC<Props> = ({ teacher, submissions, setSubmissions, allSubmissions, isCloudEnabled, syncUrl, setSyncUrl, onSendWarnings, onSendPdf }) => {
  const nextWeek = getNextWeekMonday();
  const [view, setView] = useState<'status' | 'form' | 'history' | 'setup'>('status');
  const [isMailing, setIsMailing] = useState(false);
  
  const saturday = new Date(nextWeek);
  saturday.setDate(saturday.getDate() + 5);
  const saturdayStr = saturday.toISOString().split('T')[0];

  const currentSubmission = submissions.find(s => s.teacherId === teacher.id && s.weekStarting === nextWeek);

  const groupedAssignments = useMemo(() => {
    const groups: Record<string, GroupedAssignment> = {};
    teacher.assignedClasses.forEach(ac => {
      const key = `${ac.classLevel}-${ac.subject}`;
      if (!groups[key]) {
        groups[key] = { id: key, classLevel: ac.classLevel, subject: ac.subject, sections: [] };
      }
      groups[key].sections.push(ac.section);
    });
    return Object.values(groups);
  }, [teacher.assignedClasses]);

  const classStatus = useMemo(() => {
    if (!teacher.isClassTeacher) return null;
    const { classLevel, section } = teacher.isClassTeacher;
    const requirements = INITIAL_TEACHERS.flatMap(t => 
      t.assignedClasses
        .filter(ac => ac.classLevel === classLevel && ac.section === section)
        .map(ac => ({
          subject: ac.subject,
          teacherName: t.name,
          teacherId: t.id,
          email: t.email,
          whatsapp: t.whatsapp
        }))
    );
    return requirements.map(req => {
      const sub = allSubmissions.find(s => 
        s.teacherId === req.teacherId && 
        s.weekStarting === nextWeek &&
        s.plans.some(p => p.classLevel === classLevel && p.section === section && p.subject === req.subject)
      );
      return { ...req, submitted: !!sub };
    });
  }, [teacher.isClassTeacher, allSubmissions, nextWeek]);

  const [formData, setFormData] = useState<Record<string, { chapter: string, topics: string, homework: string }>>({});
  const [dates, setDates] = useState({ from: nextWeek, to: saturdayStr });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  useEffect(() => {
    const initialForm: any = {};
    groupedAssignments.forEach(g => { initialForm[g.id] = { chapter: '', topics: '', homework: '' }; });
    setFormData(initialForm);
  }, [groupedAssignments]);

  const handleRefine = async (groupId: string, field: 'topics' | 'homework') => {
    const val = formData[groupId][field];
    if (!val) return;
    setAiLoading(`${groupId}-${field}`);
    const refined = await refineSyllabusContent(val, field);
    setFormData(prev => ({ ...prev, [groupId]: { ...prev[groupId], [field]: refined } }));
    setAiLoading(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const flattenedPlans: ClassPlan[] = [];
    groupedAssignments.forEach(g => {
      const content = formData[g.id];
      g.sections.forEach(sec => {
        flattenedPlans.push({
          classLevel: g.classLevel, section: sec, subject: g.subject,
          chapterName: content.chapter, topics: content.topics, homework: content.homework
        });
      });
    });
    const newSubmission: WeeklySubmission = {
      id: crypto.randomUUID(), teacherId: teacher.id, teacherName: teacher.name, teacherEmail: teacher.email,
      weekStarting: dates.from, plans: flattenedPlans, timestamp: new Date().toISOString()
    };
    setTimeout(() => {
      const filtered = submissions.filter(s => !(s.teacherId === teacher.id && s.weekStarting === nextWeek));
      setSubmissions([...filtered, newSubmission]);
      setIsSubmitting(false);
      setView('status');
    }, 1200);
  };

  const handleWarnDefaulters = () => {
    if (!classStatus) return;
    const defaulters = classStatus.filter(s => !s.submitted).map(s => ({ name: s.teacherName, email: s.email }));
    if (defaulters.length === 0) {
      alert("Excellent! All teachers have submitted plans for your class for the upcoming week.");
      return;
    }
    onSendWarnings(defaulters, nextWeek);
  };

  const handleMailCompiled = async () => {
    if (!teacher.isClassTeacher || !classStatus) return;
    
    if (!syncUrl) {
      setView('setup');
      return;
    }

    setIsMailing(true);
    const { classLevel, section } = teacher.isClassTeacher;
    const compiledPlans: Submission[] = classStatus.map(req => {
      const teacherSub = allSubmissions.find(s => s.teacherId === req.teacherId && s.weekStarting === nextWeek);
      const plan = teacherSub?.plans.find(p => p.classLevel === classLevel && p.section === section && p.subject === req.subject);
      return {
        subject: req.subject, teacherName: req.teacherName,
        chapterName: plan?.chapterName || 'PENDING',
        topics: plan?.topics || 'PENDING',
        homework: plan?.homework || 'PENDING',
        classLevel, section
      };
    });
    
    try {
      const doc = generateSyllabusPDF(compiledPlans, { name: teacher.name, email: teacher.email, classLevel, section }, dates.from, dates.to);
      const pdfBase64 = doc.output('datauristring');
      await onSendPdf(pdfBase64, teacher.email, `${classLevel}-${section}`, `Compiled_${classLevel}${section}_${nextWeek}.pdf`);
    } finally {
      setIsMailing(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (!teacher.isClassTeacher || !classStatus) return;
    const { classLevel, section } = teacher.isClassTeacher;
    const pendingCount = classStatus.filter(s => !s.submitted).length;
    const statusMsg = pendingCount === 0 
      ? `✅ All lesson plans for Class ${classLevel}-${section} for the week of ${nextWeek} have been submitted and compiled.`
      : `⚠️ Attention: ${pendingCount} lesson plans are still pending for Class ${classLevel}-${section} for the upcoming week starting ${nextWeek}.`;
    
    const message = `${statusMsg}\n\nTeachers, please ensure your submissions are finalized in the SHS Syllabus Manager portal here:\n${PORTAL_LINK}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const sendPersonalNudge = (teacherName: string, whatsapp: string | undefined, subject: string) => {
    if (!whatsapp) {
      alert("WhatsApp number not registered for this teacher.");
      return;
    }
    const { classLevel, section } = teacher.isClassTeacher!;
    const message = `Dear ${teacherName}, this is a gentle reminder that your lesson plan for Class ${classLevel}-${section} (${subject}) is pending for the upcoming week starting ${nextWeek}.\n\nPlease submit it on the SHS Portal here: ${PORTAL_LINK}\n\nThank you.`;
    const url = `https://wa.me/${whatsapp.startsWith('+') ? whatsapp.substring(1) : whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center space-x-5">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl shadow-xl shadow-blue-100">
            <i className="fas fa-id-card"></i>
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">{teacher.name}</h2>
            <div className="flex items-center space-x-3 mt-1">
              <span className="text-sm font-bold text-gray-400">{teacher.email}</span>
              {isCloudEnabled && (
                <span className="flex items-center gap-1.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-blue-100">
                  <i className="fas fa-cloud-check"></i> Cloud Active
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
           <button onClick={() => setView('status')} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${view === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>Monitor Status</button>
           <button onClick={() => setView('form')} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${view === 'form' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>Fill Next Plan</button>
           {teacher.isClassTeacher && (
             <button onClick={() => setView('setup')} className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all ${view === 'setup' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`} title="Cloud Settings">
               <i className="fas fa-cog"></i>
             </button>
           )}
        </div>
      </div>

      {view === 'setup' && teacher.isClassTeacher && (
        <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-4 mb-6">
             <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><i className="fas fa-cloud-bolt"></i></div>
             <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Cloud Configuration (Class Teacher)</h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">If the "Mail PDF" button is disabled on this device, paste the <b>Deployment URL</b> provided by the Admin below. This setting is stored locally on this phone/browser.</p>
          <div className="space-y-4">
             <input 
               type="url" 
               className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-gray-100 font-bold outline-none focus:border-blue-500 transition-all" 
               placeholder="https://script.google.com/macros/s/..."
               value={syncUrl}
               onChange={(e) => setSyncUrl(e.target.value)}
             />
             <div className="flex gap-3">
               <button onClick={() => setView('status')} className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100">Save Configuration</button>
               <button onClick={() => setView('status')} className="px-6 py-4 bg-gray-100 text-gray-500 rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
             </div>
          </div>
        </div>
      )}

      {view === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-8">
              {teacher.isClassTeacher && classStatus && (
                <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 relative z-10 gap-4">
                    <div>
                        <h3 className="text-2xl font-black text-gray-800">Class {teacher.isClassTeacher.classLevel}-{teacher.isClassTeacher.section} Monitoring</h3>
                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">Targeting Upcoming Week: {nextWeek}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={handleMailCompiled} 
                        disabled={isMailing}
                        className="bg-gray-900 text-white px-5 py-3 rounded-xl text-[10px] font-black hover:bg-black flex items-center gap-2 transition-transform active:scale-95 shadow-lg disabled:opacity-50"
                      >
                        {isMailing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-envelope"></i>}
                        <span>Mail Compiled PDF</span>
                      </button>
                      <button onClick={handleWhatsAppShare} className="bg-emerald-600 text-white px-5 py-3 rounded-xl text-[10px] font-black hover:bg-emerald-700 flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-100">
                        <i className="fab fa-whatsapp"></i> <span>Share Status</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    {classStatus.map((item, idx) => (
                      <div key={idx} className={`p-5 rounded-2xl border flex items-center justify-between ${item.submitted ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50/50 border-blue-100'}`}>
                          <div>
                            <p className={`text-xs font-black ${item.submitted ? 'text-emerald-800' : 'text-blue-800'}`}>{item.subject}</p>
                            <p className={`text-[10px] font-bold ${item.submitted ? 'text-emerald-600/70' : 'text-blue-600/70'}`}>{item.teacherName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.submitted && (
                              <button 
                                onClick={() => sendPersonalNudge(item.teacherName, item.whatsapp, item.subject)}
                                className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                title="Send personal WhatsApp nudge"
                              >
                                <i className="fab fa-whatsapp"></i>
                              </button>
                            )}
                            {item.submitted ? <i className="fas fa-check-circle text-emerald-500"></i> : <i className="fas fa-exclamation-triangle text-blue-400 animate-pulse"></i>}
                          </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8">
                    <button 
                      onClick={handleWarnDefaulters} 
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl text-[11px] font-black hover:bg-blue-700 flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-lg shadow-blue-100 uppercase tracking-widest"
                    >
                        <i className="fas fa-bullhorn text-sm"></i> Send Reminder Emails to Defaulters
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100">
                <h3 className="text-2xl font-black text-gray-800 mb-8 tracking-tight">My Personal Assignments for Next Week</h3>
                <div className="space-y-4">
                  {groupedAssignments.map(g => {
                    const isDone = currentSubmission?.plans.some(p => p.subject === g.subject && p.classLevel === g.classLevel);
                    return (
                      <div key={g.id} className="p-6 rounded-[2.5rem] bg-gray-50 border border-gray-100 flex items-center justify-between group hover:border-blue-100 transition-all">
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${CLASS_STYLES[g.classLevel].bg}`}>
                            <i className="fas fa-graduation-cap"></i>
                          </div>
                          <div>
                            <p className="font-black text-gray-800">{g.subject}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grade {g.classLevel} &bull; Sections {g.sections.join(', ')}</p>
                          </div>
                        </div>
                        {isDone ? (
                          <div className="text-emerald-600 font-black text-[10px] uppercase flex items-center gap-2">
                             <i className="fas fa-check-circle"></i> Submission Recorded
                          </div>
                        ) : (
                          <button onClick={() => setView('form')} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100 transform active:scale-95">Fill Plan</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
           </div>

           <div className="space-y-8">
              <div className="bg-gray-900 rounded-[3rem] p-10 shadow-2xl text-white">
                 <h4 className="text-xl font-black mb-6">Staff Navigation</h4>
                 <div className="space-y-4">
                   <button onClick={() => setView('form')} className="w-full bg-blue-600 hover:bg-blue-700 py-5 rounded-2xl font-black text-sm shadow-xl flex items-center justify-center space-x-3 transition-all">
                      <i className="fas fa-file-circle-plus"></i>
                      <span>New Weekly Plan</span>
                   </button>
                   <button onClick={() => setView('history')} className="w-full bg-white/5 hover:bg-white/10 py-5 rounded-2xl font-black text-sm border border-white/10 flex items-center justify-center space-x-3 transition-all">
                      <i className="fas fa-clock-rotate-left"></i>
                      <span>View History</span>
                   </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {view === 'form' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-gray-800 p-12 text-white flex justify-between items-center">
             <div>
               <h3 className="text-4xl font-black tracking-tight">Academic Planning</h3>
               <p className="text-gray-400 font-bold text-sm mt-2 uppercase tracking-widest">Planning for Upcoming Week Starting: {nextWeek}</p>
             </div>
             <button type="button" onClick={() => setView('status')} className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"><i className="fas fa-times text-xl"></i></button>
          </div>

          <div className="p-12 space-y-16">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date (From - Monday) *</label>
                  <input type="date" required className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold" value={dates.from} onChange={e => setDates({...dates, from: e.target.value})} />
               </div>
               <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date (To - Saturday) *</label>
                  <input type="date" required className="w-full px-8 py-5 rounded-2xl bg-gray-50 border-gray-100 border outline-none font-bold" value={dates.to} onChange={e => setDates({...dates, to: e.target.value})} />
               </div>
            </div>

            <div className="space-y-12">
               {groupedAssignments.map((g) => (
                 <div key={g.id} className="relative group">
                    <div className={`absolute left-0 top-0 bottom-0 w-2 rounded-full transition-all group-hover:w-4 ${CLASS_STYLES[g.classLevel].bg}`}></div>
                    <div className="pl-12 space-y-8">
                       <h4 className="text-3xl font-black text-gray-800 tracking-tight">{g.subject} <span className="text-sm font-bold text-gray-400">({g.classLevel}-{g.sections.join(',')})</span></h4>
                       <div className="space-y-6">
                          <div>
                             <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Name of the Chapter to be taught in upcoming week *</label>
                             <input required type="text" className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border-gray-100 border outline-none font-bold" placeholder="Enter chapter title..." value={formData[g.id]?.chapter || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], chapter: e.target.value } })} />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Topics/Subtopics of the Chapter to be taught *</label>
                                   <button type="button" onClick={() => handleRefine(g.id, 'topics')} className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full uppercase"><i className="fas fa-magic"></i> AI Polish</button>
                                </div>
                                <textarea required rows={5} className="w-full px-8 py-6 rounded-[2.5rem] bg-gray-50 border-gray-100 border outline-none text-sm font-medium" placeholder="Break down the topics..." value={formData[g.id]?.topics || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], topics: e.target.value } })} />
                             </div>
                             <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Proposed Home Work *</label>
                                   <button type="button" onClick={() => handleRefine(g.id, 'homework')} className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full uppercase"><i className="fas fa-magic"></i> AI Polish</button>
                                </div>
                                <textarea required rows={5} className="w-full px-8 py-6 rounded-[2.5rem] bg-gray-50 border-gray-100 border outline-none text-sm font-medium" placeholder="Assign homework..." value={formData[g.id]?.homework || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], homework: e.target.value } })} />
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>

            <button disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-8 rounded-[3rem] shadow-2xl transition-all text-2xl flex items-center justify-center space-x-6">
              {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-cloud-arrow-up"></i> <span>Finalize & Sync Plan</span></>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TeacherDashboard;

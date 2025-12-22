
import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassPlan, Submission, Section, ClassLevel } from '../types';
import { getNextWeekMonday, CLASS_STYLES, PORTAL_LINK, getWhatsAppLink } from '../constants';
import { refineSyllabusContent } from '../services/geminiService';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teacher: Teacher;
  teachers: Teacher[]; // Pass the full faculty registry
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

const TeacherDashboard: React.FC<Props> = ({ teacher, teachers, submissions, setSubmissions, allSubmissions, isCloudEnabled, syncUrl, setSyncUrl, onSendWarnings, onSendPdf }) => {
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
    
    // FIX: Map over all registered teachers, not just initial hardcoded list
    const requirements = teachers.flatMap(t => 
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
  }, [teacher.isClassTeacher, teachers, allSubmissions, nextWeek]);

  const [formData, setFormData] = useState<Record<string, { chapter: string, topics: string, homework: string }>>({});
  const [dates, setDates] = useState({ from: nextWeek, to: saturdayStr });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const initialForm: any = {};
    groupedAssignments.forEach(g => { initialForm[g.id] = { chapter: '', topics: '', homework: '' }; });
    setFormData(initialForm);
  }, [groupedAssignments]);

  const handleRefine = async (groupId: string, field: 'topics' | 'homework') => {
    const val = formData[groupId][field];
    if (!val) return;
    const refined = await refineSyllabusContent(val, field);
    setFormData(prev => ({ ...prev, [groupId]: { ...prev[groupId], [field]: refined } }));
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
    if (defaulters.length === 0) return;
    onSendWarnings(defaulters, nextWeek);
  };

  const handleMailCompiled = async () => {
    if (!teacher.isClassTeacher || !classStatus) return;
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
    const message = `Class ${classLevel}-${section} Syllabus Status (${nextWeek}): ${pendingCount === 0 ? '✅ Complete' : '⚠️ ' + pendingCount + ' Pending'}.\n\nPlease submit here: ${PORTAL_LINK}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center space-x-5 w-full md:w-auto">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl md:text-3xl shadow-xl shadow-blue-100">
            <i className="fas fa-user-tie"></i>
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">{teacher.name}</h2>
            <div className="flex items-center space-x-3 mt-1">
              <span className="text-[10px] md:text-xs font-bold text-gray-400">{teacher.email}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-center w-full md:w-auto">
           <button onClick={() => setView('status')} className={`flex-1 md:flex-none px-4 md:px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${view === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>Status</button>
           <button onClick={() => setView('form')} className={`flex-1 md:flex-none px-4 md:px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${view === 'form' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>New Plan</button>
        </div>
      </div>

      {view === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-8">
              {teacher.isClassTeacher && classStatus && (
                <div className="bg-white rounded-[3rem] p-6 md:p-10 shadow-sm border border-gray-100 overflow-hidden">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Class {teacher.isClassTeacher.classLevel}-{teacher.isClassTeacher.section} Monitor</h3>
                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">Week Beginning: {nextWeek}</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={handleMailCompiled} disabled={isMailing} className="flex-1 md:flex-none bg-gray-900 text-white px-4 py-3 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                        {isMailing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-envelope"></i>}
                        <span>Mail PDF</span>
                      </button>
                      <button onClick={handleWhatsAppShare} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-3 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100">
                        <i className="fab fa-whatsapp"></i> <span>Share</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {classStatus.map((item, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl border flex items-center justify-between ${item.submitted ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50/50 border-blue-100'}`}>
                          <div>
                            <p className={`text-[11px] font-black ${item.submitted ? 'text-emerald-800' : 'text-blue-800'}`}>{item.subject}</p>
                            <p className={`text-[9px] font-bold ${item.submitted ? 'text-emerald-600/70' : 'text-blue-600/70'}`}>{item.teacherName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.submitted && (
                              <button onClick={() => window.open(getWhatsAppLink(item.whatsapp, `Reminder: ${item.subject} plan for Class ${teacher.isClassTeacher!.classLevel}-${teacher.isClassTeacher!.section} is pending.`) || '', '_blank')} className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all">
                                <i className="fab fa-whatsapp"></i>
                              </button>
                            )}
                            {item.submitted ? <i className="fas fa-check-circle text-emerald-500"></i> : <i className="fas fa-exclamation-triangle text-blue-400 animate-pulse"></i>}
                          </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8">
                    <button onClick={handleWarnDefaulters} className="w-full bg-blue-600 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100">
                      Send Reminder Emails to Defaulters
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[3rem] p-8 md:p-10 shadow-sm border border-gray-100">
                <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-8 tracking-tight">My Teaching Assignments</h3>
                <div className="space-y-4">
                  {groupedAssignments.map(g => {
                    const isDone = currentSubmission?.plans.some(p => p.subject === g.subject && p.classLevel === g.classLevel);
                    return (
                      <div key={g.id} className="p-5 md:p-6 rounded-[2rem] bg-gray-50 border border-gray-100 flex items-center justify-between hover:border-blue-100 transition-all">
                        <div className="flex items-center space-x-4">
                          <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${CLASS_STYLES[g.classLevel].bg}`}>
                            <i className="fas fa-graduation-cap text-sm"></i>
                          </div>
                          <div>
                            <p className="font-black text-gray-800 text-sm md:text-base">{g.subject}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Grade {g.classLevel} &bull; {g.sections.join(', ')}</p>
                          </div>
                        </div>
                        {isDone ? (
                          <span className="text-emerald-600 font-black text-[9px] uppercase"><i className="fas fa-check-circle mr-1"></i> Saved</span>
                        ) : (
                          <button onClick={() => setView('form')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase">Fill</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
           </div>
        </div>
      )}

      {view === 'form' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-4">
          <div className="bg-gray-800 p-8 md:p-12 text-white flex justify-between items-center">
             <h3 className="text-2xl md:text-3xl font-black tracking-tight">Planning</h3>
             <button type="button" onClick={() => setView('status')} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><i className="fas fa-times"></i></button>
          </div>

          <div className="p-6 md:p-12 space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
               <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Monday Date</label>
                  <input type="date" required className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold" value={dates.from} onChange={e => setDates({...dates, from: e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Saturday Date</label>
                  <input type="date" required className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold" value={dates.to} onChange={e => setDates({...dates, to: e.target.value})} />
               </div>
            </div>

            <div className="space-y-10">
               {groupedAssignments.map((g) => (
                 <div key={g.id} className="pl-4 md:pl-10 border-l-4 border-blue-500 space-y-6">
                    <h4 className="text-xl md:text-2xl font-black text-gray-800">{g.subject} <span className="text-xs text-gray-400">({g.classLevel}-{g.sections.join(',')})</span></h4>
                    <div className="space-y-5">
                       <input required type="text" className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold text-sm" placeholder="Chapter Name" value={formData[g.id]?.chapter || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], chapter: e.target.value } })} />
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <div className="flex justify-between px-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Topics</label>
                                <button type="button" onClick={() => handleRefine(g.id, 'topics')} className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">AI Fix</button>
                             </div>
                             <textarea required rows={4} className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-gray-100 border outline-none text-xs font-medium" value={formData[g.id]?.topics || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], topics: e.target.value } })} />
                          </div>
                          <div className="space-y-2">
                             <div className="flex justify-between px-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Homework</label>
                                <button type="button" onClick={() => handleRefine(g.id, 'homework')} className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">AI Fix</button>
                             </div>
                             <textarea required rows={4} className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-gray-100 border outline-none text-xs font-medium" value={formData[g.id]?.homework || ''} onChange={e => setFormData({ ...formData, [g.id]: { ...formData[g.id], homework: e.target.value } })} />
                          </div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>

            <button disabled={isSubmitting} className="w-full bg-blue-600 text-white font-black py-6 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-4">
              {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <span>Finalize & Sync Plan</span>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TeacherDashboard;


import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, SCHOOL_NAME, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY, CLASS_STYLES } from '../constants';

interface Props {
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  resubmitRequests: ResubmitRequest[];
  onApproveResubmit: (id: string) => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => Promise<any>;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
  onResetRegistry?: () => Promise<void>;
  onForceReset?: (teacherId: string, week: string) => Promise<void>;
  onForceSyncAll?: () => Promise<void>;
  onRefreshData?: () => Promise<boolean>;
  lastSync: Date | null;
}

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, resubmitRequests, onApproveResubmit, syncUrl, setSyncUrl, onSendWarnings, onRefreshData, lastSync, onResetRegistry, onForceReset, onForceSyncAll }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'settings'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);

  const nextWeek = getNextWeekMonday();

  const submittedEmails = useMemo(() => {
    return new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherEmail.toLowerCase()));
  }, [submissions, nextWeek]);

  const missingTeachers = useMemo(() => {
    return teachers.filter(t => !submittedEmails.has(t.email.toLowerCase()));
  }, [teachers, submittedEmails]);

  const defaultersByClass = useMemo(() => {
    const res: Record<string, Teacher[]> = {};
    missingTeachers.forEach(t => {
      if (t.assignedClasses && t.assignedClasses.length > 0) {
        t.assignedClasses.forEach(ac => {
          const key = `${ac.classLevel}-${ac.section}`;
          if (!res[key]) res[key] = [];
          if (!res[key].find(found => found.email.toLowerCase() === t.email.toLowerCase())) res[key].push(t);
        });
      } else {
        const key = "Faculty (No Class)";
        if (!res[key]) res[key] = [];
        res[key].push(t);
      }
    });
    return res;
  }, [missingTeachers]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshData?.();
    setIsRefreshing(false);
  };

  const handleSaveTeacher = (teacherData: Teacher) => {
    const exists = teachers.find(t => t.email.toLowerCase() === teacherData.email.toLowerCase());
    const newTeachers = exists 
      ? teachers.map(t => t.email.toLowerCase() === teacherData.email.toLowerCase() ? teacherData : t)
      : [...teachers, teacherData];
    setTeachers(newTeachers);
    setEditingTeacher(null);
    setIsAddingTeacher(false);
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="bg-white rounded-[3rem] p-10 md:p-12 shadow-2xl border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-10">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Admin Dashboard</h2>
          <div className="flex items-center gap-4 mt-4">
             <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Cloud Live</p>
             </div>
             <p className="text-gray-300 font-black text-[10px]">|</p>
             <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">
               Last Global Sync: {lastSync ? lastSync.toLocaleTimeString() : 'Establishing...'}
             </p>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
           <button onClick={handleManualRefresh} disabled={isRefreshing} className="flex-1 bg-blue-600 text-white px-10 py-5 rounded-3xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-100 transform active:scale-95 transition-all flex items-center justify-center gap-3">
             {isRefreshing ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-cloud-download-alt"></i>}
             <span>{isRefreshing ? 'Syncing...' : 'Fetch All Devices'}</span>
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/20">
           {['monitor', 'registry', 'requests', 'settings'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-7 text-[10px] font-black transition-all uppercase tracking-[0.3em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
               {t} {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-10 md:p-14">
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
              <div className="space-y-12">
                <div className="flex justify-between items-end">
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Pending Faculty <span className="text-blue-600 ml-1">({missingTeachers.length})</span></h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Week: {nextWeek}</p>
                </div>
                <div className="space-y-8">
                  {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                    <div key={cls} className="bg-gray-50 p-8 rounded-[3rem] border border-gray-100">
                      <h4 className="font-black text-gray-900 text-lg mb-6 flex items-center gap-3">
                         <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                         Class {cls}
                      </h4>
                      <div className="space-y-4">
                        {list.map(t => (
                          <div key={t.id} className="flex items-center justify-between bg-white p-5 rounded-2xl shadow-sm border border-gray-50 group hover:border-blue-200 transition-all">
                            <div className="flex flex-col">
                               <span className="text-xs font-black text-gray-800">{t.name}</span>
                               <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{t.email}</span>
                            </div>
                            <div className="flex gap-2">
                               <button onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Emergency Reminder: Your syllabus submission for the week of ${nextWeek} is missing on the cloud. Please sync immediately.`) || '', '_blank')} className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                                 <i className="fab fa-whatsapp"></i>
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {missingTeachers.length === 0 && (
                    <div className="text-center py-20 bg-emerald-50 rounded-[4rem] border border-emerald-100">
                       <i className="fas fa-check-circle text-emerald-500 text-6xl mb-6"></i>
                       <p className="font-black text-emerald-800 uppercase tracking-[0.4em] text-xs">All Syncs Complete</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-12">
                <h3 className="text-2xl font-black text-gray-800 tracking-tight">Recent Global Activity</h3>
                <div className="space-y-4">
                  {submissions.filter(s => s.weekStarting === nextWeek).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(sub => (
                    <div key={sub.id} className="bg-emerald-50 p-6 rounded-[2.5rem] flex items-center justify-between border border-emerald-100 group hover:bg-white transition-all">
                      <div className="flex items-center gap-5">
                         <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-500">
                           <i className="fas fa-cloud-upload-alt"></i>
                         </div>
                         <div>
                           <p className="font-black text-gray-900 text-sm leading-tight">{sub.teacherName}</p>
                           <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mt-1">Confirmed {new Date(sub.timestamp).toLocaleTimeString()}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-gray-400 uppercase">{sub.plans.length} Subjects</p>
                      </div>
                    </div>
                  ))}
                  {submissions.filter(s => s.weekStarting === nextWeek).length === 0 && (
                    <div className="text-center py-32 bg-gray-50 rounded-[4rem] border-2 border-dashed border-gray-100">
                       <i className="fas fa-wifi-slash text-gray-200 text-7xl mb-6"></i>
                       <p className="text-gray-300 font-black uppercase tracking-[0.3em] text-[10px]">No Device Data Received Yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="space-y-10">
              <div className="flex flex-col md:flex-row gap-8 justify-between items-center">
                <div className="relative flex-1 w-full">
                  <i className="fas fa-search absolute left-7 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input 
                    type="text" placeholder="Global Faculty Search..." 
                    className="w-full pl-16 pr-8 py-6 rounded-[2.5rem] bg-gray-50 border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button onClick={() => setIsAddingTeacher(true)} className="w-full md:w-auto bg-blue-600 text-white px-12 py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-blue-100 transform active:scale-95 transition-all">
                  Register New Faculty
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredTeachers.map(t => (
                  <div key={t.email} className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm relative group hover:shadow-2xl transition-all overflow-hidden">
                    <button onClick={() => setEditingTeacher(t)} className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-all text-blue-600 bg-blue-50 w-10 h-10 rounded-xl flex items-center justify-center">
                      <i className="fas fa-edit"></i>
                    </button>
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-16 h-16 rounded-[1.5rem] bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300 font-black text-2xl">
                        {t.name.charAt(0)}
                      </div>
                      {t.isClassTeacher && (
                        <span className="bg-emerald-100 text-emerald-600 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-emerald-200">
                          CT: {t.isClassTeacher.classLevel}-{t.isClassTeacher.section}
                        </span>
                      )}
                    </div>
                    <h4 className="font-black text-gray-900 text-lg leading-tight">{t.name}</h4>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6 mt-1">{t.email}</p>
                    
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50 mt-4">
                       {t.assignedClasses.map((ac, idx) => (
                         <div key={idx} className="inline-flex items-center gap-2 text-[8px] font-black uppercase text-blue-600 bg-blue-50/50 px-2.5 py-1.5 rounded-lg border border-blue-50">
                           {ac.classLevel}-{ac.section} &bull; {ac.subject}
                         </div>
                       ))}
                       {t.assignedClasses.length === 0 && <p className="text-[9px] text-gray-300 font-bold italic">No subjects assigned</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-12">
               <div className="bg-gray-50 p-12 rounded-[4rem] border border-gray-100">
                  <h3 className="text-2xl font-black text-gray-900 mb-8 tracking-tight">Cloud Infrastructure</h3>
                  <div className="space-y-5">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Google Deployment Endpoint</label>
                     <div className="relative">
                        <i className="fas fa-link absolute left-6 top-1/2 -translate-y-1/2 text-gray-300"></i>
                        <input type="text" className="w-full pl-14 pr-6 py-6 rounded-3xl bg-white border border-gray-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={syncUrl} onChange={e => setSyncUrl(e.target.value)} />
                     </div>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <button onClick={() => onResetRegistry?.()} className="p-10 rounded-[3.5rem] bg-red-50 text-red-600 border border-red-100 text-left font-black uppercase text-[10px] tracking-[0.3em] hover:bg-red-600 hover:text-white transition-all group shadow-xl shadow-red-50">
                    <i className="fas fa-skull-crossbones mb-6 block text-3xl group-hover:scale-110 transition-transform"></i>
                    Reset Local Memory
                  </button>
                  <button onClick={onForceSyncAll} className="p-10 rounded-[3.5rem] bg-gray-900 text-white border border-gray-800 text-left font-black uppercase text-[10px] tracking-[0.3em] hover:bg-black transition-all group shadow-2xl">
                    <i className="fas fa-broadcast-tower mb-6 block text-3xl group-hover:animate-pulse"></i>
                    Broadcast Local Data
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>

      {(isAddingTeacher || editingTeacher) && (
        <TeacherFormModal 
          teacher={editingTeacher} 
          onClose={() => { setEditingTeacher(null); setIsAddingTeacher(false); }} 
          onSave={handleSaveTeacher}
          onDelete={(id) => { setTeachers(teachers.filter(t => t.id !== id)); setEditingTeacher(null); }}
        />
      )}
    </div>
  );
};

const TeacherFormModal: React.FC<{
  teacher: Teacher | null;
  onClose: () => void;
  onSave: (data: Teacher) => void;
  onDelete: (id: string) => void;
}> = ({ teacher, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Partial<Teacher>>({
    name: teacher?.name || '',
    email: teacher?.email || '',
    whatsapp: teacher?.whatsapp || '',
    assignedClasses: teacher?.assignedClasses || [],
    isClassTeacher: teacher?.isClassTeacher || undefined,
  });

  const [newAssignment, setNewAssignment] = useState<AssignedClass>({
    classLevel: 'I',
    section: 'A',
    subject: '',
  });

  const [isCTSelection, setIsCTSelection] = useState<boolean>(!!teacher?.isClassTeacher);

  const handleAddAssignment = () => {
    if (!newAssignment.subject) return;
    setFormData(prev => ({
      ...prev,
      assignedClasses: [...(prev.assignedClasses || []), { ...newAssignment }]
    }));
    setNewAssignment({ ...newAssignment, subject: '' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-12 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
          <h3 className="text-3xl font-black text-gray-900 tracking-tight">{teacher ? 'Edit Faculty' : 'Register Faculty'}</h3>
          <button onClick={onClose} className="w-14 h-14 rounded-2xl bg-white border border-gray-100 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center shadow-sm"><i className="fas fa-times"></i></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
          {/* Reordered Sequence Section 1: CT Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Class Teacher?</label>
              <select 
                className="w-full px-7 py-5 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none"
                value={isCTSelection ? 'yes' : 'no'} 
                onChange={e => {
                  const isYes = e.target.value === 'yes';
                  setIsCTSelection(isYes);
                  if (!isYes) setFormData({...formData, isClassTeacher: undefined});
                  else if (!formData.isClassTeacher) setFormData({...formData, isClassTeacher: { classLevel: 'I', section: 'A' }});
                }}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {isCTSelection && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest ml-1">CT Class</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 font-black text-[10px] uppercase outline-none" value={formData.isClassTeacher?.classLevel || 'I'} onChange={e => setFormData({...formData, isClassTeacher: { ...formData.isClassTeacher!, classLevel: e.target.value as ClassLevel }})}>
                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest ml-1">CT Section</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 font-black text-[10px] uppercase outline-none" value={formData.isClassTeacher?.section || 'A'} onChange={e => setFormData({...formData, isClassTeacher: { ...formData.isClassTeacher!, section: e.target.value as Section }})}>
                    {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Reordered Sequence Section 2: Personal Details */}
          <div className="space-y-8 pt-6 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Legal Name</label>
                <input required type="text" className="w-full px-7 py-5 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official ID (Email)</label>
                <input required type="email" className="w-full px-7 py-5 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                <input required type="tel" className="w-full px-7 py-5 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} />
              </div>
            </div>
          </div>

          {/* Reordered Sequence Section 3: Academic Assignments */}
          <div className="space-y-8 pt-8 border-t border-gray-100">
             <div className="flex justify-between items-end">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">Academic Assignments</h4>
                <p className="text-[9px] font-bold text-gray-400">{formData.assignedClasses?.length || 0} Slots Filled</p>
             </div>
             <div className="flex flex-col md:flex-row gap-5 items-end bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100">
                <div className="flex-1 w-full space-y-2">
                   <input 
                    type="text" placeholder="Subject Domain" 
                    className="w-full px-5 py-4 rounded-xl bg-white border border-gray-100 font-bold text-xs outline-none"
                    value={newAssignment.subject} onChange={e => setNewAssignment({...newAssignment, subject: e.target.value})}
                  />
                </div>
                <div className="flex gap-3">
                  <select className="px-5 py-4 rounded-xl bg-white border border-gray-100 font-black text-[10px] uppercase outline-none" value={newAssignment.classLevel} onChange={e => setNewAssignment({...newAssignment, classLevel: e.target.value as ClassLevel})}>
                    {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="px-5 py-4 rounded-xl bg-white border border-gray-100 font-black text-[10px] uppercase outline-none" value={newAssignment.section} onChange={e => setNewAssignment({...newAssignment, section: e.target.value as Section})}>
                    {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button type="button" onClick={handleAddAssignment} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-50 hover:bg-blue-700 transition-all">Add</button>
             </div>
             <div className="flex flex-wrap gap-3">
               {formData.assignedClasses?.map((ac, idx) => (
                 <span key={idx} className="px-4 py-2.5 bg-blue-50 text-blue-600 rounded-[1.2rem] text-[10px] font-black uppercase border border-blue-100 flex items-center gap-3 animate-in zoom-in-90">
                   {ac.classLevel}-{ac.section} &bull; {ac.subject}
                   <button type="button" onClick={() => setFormData({...formData, assignedClasses: formData.assignedClasses?.filter((_, i) => i !== idx)})} className="w-5 h-5 rounded-full bg-blue-100 text-blue-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all"><i className="fas fa-times text-[10px]"></i></button>
                 </span>
               ))}
               {formData.assignedClasses?.length === 0 && <p className="text-gray-300 font-black italic text-xs py-4">No classes assigned yet.</p>}
             </div>
          </div>
        </div>

        <div className="p-12 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
          {teacher && (
            <button type="button" onClick={() => { if(window.confirm('Delete this faculty record?')) onDelete(teacher.id); }} className="text-red-500 font-black uppercase text-[10px] tracking-[0.2em] hover:text-red-700 transition-all">Remove Faculty</button>
          )}
          <div className="flex-1"></div>
          <button 
            type="button" 
            onClick={() => onSave({ id: teacher?.id || `t_${Date.now()}`, ...formData } as Teacher)} 
            className="bg-gray-900 text-white px-12 py-6 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-black transition-all"
          >
            Commit Record
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

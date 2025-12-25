
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

  const submittedIds = useMemo(() => {
    return new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherId));
  }, [submissions, nextWeek]);

  const missingTeachers = useMemo(() => {
    return teachers.filter(t => !submittedIds.has(t.id));
  }, [teachers, submittedIds]);

  const defaultersByClass = useMemo(() => {
    const res: Record<string, Teacher[]> = {};
    missingTeachers.forEach(t => {
      if (t.assignedClasses && t.assignedClasses.length > 0) {
        t.assignedClasses.forEach(ac => {
          const key = `${ac.classLevel}-${ac.section}`;
          if (!res[key]) res[key] = [];
          if (!res[key].find(found => found.id === t.id)) res[key].push(t);
        });
      } else {
        const key = "Unassigned";
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
    const exists = teachers.find(t => t.id === teacherData.id);
    const newTeachers = exists 
      ? teachers.map(t => t.id === teacherData.id ? teacherData : t)
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
    <div className="space-y-8 pb-20">
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Dashboard</h2>
          <div className="flex items-center gap-3 mt-2">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">
               Cloud Last Synced: {lastSync ? lastSync.toLocaleTimeString() : '...'}
             </p>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={handleManualRefresh} disabled={isRefreshing} className="bg-blue-600 text-white px-6 py-4 rounded-3xl font-black uppercase text-xs shadow-lg shadow-blue-100">
             {isRefreshing ? 'Syncing...' : 'Sync Cloud Data'}
           </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/30">
           {['monitor', 'registry', 'requests', 'settings'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.2em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
               {t} {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-8 md:p-12">
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <div className="space-y-10">
                <h3 className="text-2xl font-black text-gray-800">Pending Faculty ({missingTeachers.length})</h3>
                <div className="space-y-6">
                  {Object.entries(defaultersByClass).map(([cls, list]) => (
                    <div key={cls} className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100">
                      <h4 className="font-black text-gray-900 text-lg mb-4">Class {cls}</h4>
                      <div className="space-y-3">
                        {list.map(t => (
                          <div key={t.id} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm">
                            <span className="text-xs font-black text-gray-700">{t.name}</span>
                            <div className="flex gap-2">
                               <button onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Reminder: Week starting ${nextWeek} syllabus is pending.`) || '', '_blank')} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white"><i className="fab fa-whatsapp"></i></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-10">
                <h3 className="text-2xl font-black text-gray-800">Recent Sync History</h3>
                <div className="space-y-4">
                  {submissions.filter(s => s.weekStarting === nextWeek).map(sub => (
                    <div key={sub.id} className="bg-emerald-50 p-5 rounded-[2rem] flex items-center justify-between border border-emerald-100">
                      <div>
                        <p className="font-black text-gray-900 text-sm">{sub.teacherName}</p>
                        <p className="text-[10px] text-emerald-600 font-bold uppercase">{new Date(sub.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <i className="fas fa-check-circle text-emerald-500"></i>
                    </div>
                  ))}
                  {submissions.filter(s => s.weekStarting === nextWeek).length === 0 && (
                    <p className="text-gray-300 text-center py-20 uppercase font-black tracking-widest text-[10px]">No recent cloud submissions</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="relative flex-1 w-full">
                  <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input 
                    type="text" placeholder="Search faculty by name or email..." 
                    className="w-full pl-14 pr-6 py-5 rounded-[2rem] bg-gray-50 border border-gray-100 outline-none font-bold text-sm"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button onClick={() => setIsAddingTeacher(true)} className="w-full md:w-auto bg-blue-600 text-white px-8 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest">
                  Add Faculty Member
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTeachers.map(t => (
                  <div key={t.id} className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm relative group">
                    <button onClick={() => setEditingTeacher(t)} className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600">
                      <i className="fas fa-edit"></i>
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 font-black mb-4">
                      {t.name.charAt(0)}
                    </div>
                    <h4 className="font-black text-gray-900 leading-tight">{t.name}</h4>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">{t.email}</p>
                    <div className="space-y-2">
                       {t.assignedClasses.slice(0, 3).map((ac, idx) => (
                         <span key={idx} className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase mr-2">
                           {ac.classLevel}-{ac.section} &bull; {ac.subject}
                         </span>
                       ))}
                       {t.assignedClasses.length > 3 && <span className="text-[8px] text-gray-300 font-bold">+{t.assignedClasses.length - 3} more</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-10">
               <div className="bg-gray-50 p-10 rounded-[3rem] border border-gray-100">
                  <h3 className="text-xl font-black text-gray-900 mb-6">Cloud Connectivity</h3>
                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Google Apps Script URL</label>
                     <input type="text" className="w-full px-6 py-5 rounded-2xl bg-white border border-gray-100 font-bold text-sm outline-none" value={syncUrl} onChange={e => setSyncUrl(e.target.value)} />
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button onClick={() => onResetRegistry?.()} className="p-8 rounded-[2.5rem] bg-red-50 text-red-600 border border-red-100 text-left font-black uppercase text-xs tracking-widest">
                    <i className="fas fa-database mb-4 block text-2xl"></i>
                    Reset Registry to Defaults
                  </button>
                  <button onClick={onForceSyncAll} className="p-8 rounded-[2.5rem] bg-blue-50 text-blue-600 border border-blue-100 text-left font-black uppercase text-xs tracking-widest">
                    <i className="fas fa-cloud-upload-alt mb-4 block text-2xl"></i>
                    Force Push All Data to Cloud
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

  const handleAddAssignment = () => {
    if (!newAssignment.subject) return;
    setFormData(prev => ({
      ...prev,
      assignedClasses: [...(prev.assignedClasses || []), { ...newAssignment }]
    }));
    setNewAssignment({ ...newAssignment, subject: '' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
          <h3 className="text-2xl font-black text-gray-900">{teacher ? 'Edit Faculty' : 'Register Faculty'}</h3>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center"><i className="fas fa-times"></i></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase">Full Name</label>
              <input required type="text" className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase">Official Email</label>
              <input required type="email" className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-gray-100 outline-none font-bold text-sm" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
          </div>

          <div className="space-y-6 pt-6 border-t border-gray-50">
             <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest">Assign Classes</h4>
             <div className="flex flex-col md:flex-row gap-4 items-end bg-gray-50 p-6 rounded-3xl">
                <input 
                  type="text" placeholder="Subject (e.g. Maths)" 
                  className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-xs"
                  value={newAssignment.subject} onChange={e => setNewAssignment({...newAssignment, subject: e.target.value})}
                />
                <select className="px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-xs" value={newAssignment.classLevel} onChange={e => setNewAssignment({...newAssignment, classLevel: e.target.value as ClassLevel})}>
                  {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="px-4 py-3 rounded-xl bg-white border border-gray-100 font-bold text-xs" value={newAssignment.section} onChange={e => setNewAssignment({...newAssignment, section: e.target.value as Section})}>
                  {ALL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" onClick={handleAddAssignment} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest">Add</button>
             </div>
             <div className="flex flex-wrap gap-2">
               {formData.assignedClasses?.map((ac, idx) => (
                 <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase border border-blue-100 flex items-center gap-2">
                   {ac.classLevel}-{ac.section} &bull; {ac.subject}
                   <button type="button" onClick={() => setFormData({...formData, assignedClasses: formData.assignedClasses?.filter((_, i) => i !== idx)})} className="text-blue-300 hover:text-red-500"><i className="fas fa-times"></i></button>
                 </span>
               ))}
             </div>
          </div>
        </div>

        <div className="p-10 border-t border-gray-50 bg-gray-50/30 flex justify-between">
          {teacher && (
            <button type="button" onClick={() => onDelete(teacher.id)} className="text-red-500 font-black uppercase text-[10px] tracking-widest">Remove Faculty</button>
          )}
          <button 
            type="button" 
            onClick={() => onSave({ id: teacher?.id || `t_${Date.now()}`, ...formData } as Teacher)} 
            className="bg-gray-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em]"
          >
            Save Registry Record
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

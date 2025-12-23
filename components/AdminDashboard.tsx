import React, { useState, useMemo, useEffect } from 'react';
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
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => Promise<any>;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
  onResetRegistry?: () => Promise<void>;
  onForceReset?: (teacherId: string, week: string) => Promise<void>;
  onForceResetAll?: (week: string) => Promise<void>;
  onRefreshData?: () => Promise<boolean>;
  lastSync: Date | null;
}

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, setSubmissions, resubmitRequests, onApproveResubmit, syncUrl, setSyncUrl, onSendWarnings, onSendPdf, onResetRegistry, onForceReset, onForceResetAll, onRefreshData, lastSync }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'settings' | 'archive'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const nextWeek = getNextWeekMonday();

  const missingTeachers = useMemo(() => {
    const submittedIds = new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherId));
    return teachers.filter(t => !submittedIds.has(t.id));
  }, [teachers, submissions, nextWeek]);

  const pendingRequests = useMemo(() => {
    return resubmitRequests.filter(r => r.status === 'pending');
  }, [resubmitRequests]);

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

  const handleManualRefresh = async () => {
    if (!onRefreshData) return;
    setIsRefreshing(true);
    await onRefreshData();
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Admin Header */}
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Admin Dashboard</h2>
          <div className="flex items-center gap-3 mt-2">
             <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
             <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">
               {lastSync ? `Last Cloud Sync: ${lastSync.toLocaleTimeString()}` : 'Connecting to Cloud...'}
             </p>
             <button onClick={handleManualRefresh} disabled={isRefreshing} className="ml-4 text-[10px] font-black uppercase text-blue-600 hover:underline">
               {isRefreshing ? 'Refreshing...' : 'Sync Now'}
             </button>
          </div>
        </div>
        <div className="flex gap-4">
           <div className="bg-blue-50 px-6 py-4 rounded-3xl text-center">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Submissions</p>
              <p className="text-2xl font-black text-blue-600">{submittedTeachers.length} / {teachers.length}</p>
           </div>
           {pendingRequests.length > 0 && (
             <button onClick={() => setActiveTab('requests')} className="bg-amber-500 text-white px-6 py-4 rounded-3xl font-black uppercase text-xs animate-bounce shadow-lg shadow-amber-200">
               {pendingRequests.length} Resubmit Requests
             </button>
           )}
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
           {['monitor', 'registry', 'requests', 'settings'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
               {t} {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-8 md:p-12">
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <div>
                <h3 className="text-2xl font-black text-gray-800 mb-8">Pending Faculy ({missingTeachers.length})</h3>
                <div className="space-y-6">
                  {/* Fixed type error: cast Object.entries output to ensure 'list' is correctly typed as Teacher[] to resolve 'unknown' map error */}
                  {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                    <div key={cls} className="bg-gray-50 p-6 rounded-[2.5rem]">
                      <h4 className="font-black text-gray-900 text-lg mb-4">Class {cls}</h4>
                      <div className="space-y-3">
                        {list.map(t => (
                          <div key={t.id} className="flex items-center justify-between text-xs font-bold text-gray-600">
                            <span>{t.name}</span>
                            <div className="flex gap-2">
                               <button onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Reminder for ${cls}: Syllabus is pending.`) || '', '_blank')} className="text-emerald-600"><i className="fab fa-whatsapp"></i></button>
                               <button onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} className="text-blue-600 uppercase text-[9px]">Email</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                 <h3 className="text-2xl font-black text-gray-800 mb-8">Cloud Registry Logs</h3>
                 <div className="space-y-4">
                    {submittedTeachers.length > 0 ? (
                      submittedTeachers.map(sub => (
                        <div key={sub.id} className="bg-emerald-50 p-6 rounded-[2rem] flex items-center justify-between">
                           <div>
                              <p className="font-black text-gray-900 text-sm">{sub.teacherName}</p>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase">{new Date(sub.timestamp).toLocaleString()}</p>
                           </div>
                           <button onClick={() => onForceReset?.(sub.teacherId, nextWeek)} className="text-red-500"><i className="fas fa-trash"></i></button>
                        </div>
                      ))
                    ) : <p className="text-gray-400 text-center py-20 uppercase font-black tracking-widest text-xs">Waiting for Cloud Data...</p>}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-gray-800">Resubmit Permissions</h3>
              {pendingRequests.length > 0 ? (
                pendingRequests.map(req => (
                  <div key={req.id} className="bg-amber-50 p-8 rounded-[2.5rem] flex items-center justify-between border border-amber-100">
                     <div>
                        <p className="text-lg font-black text-gray-900">{req.teacherName}</p>
                        <p className="text-xs font-bold text-amber-600 uppercase">Week Starting: {req.weekStarting}</p>
                     </div>
                     <button onClick={() => onApproveResubmit(req.id)} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs">Approve & Clear Previous</button>
                  </div>
                ))
              ) : <p className="text-center py-20 text-gray-400 font-bold uppercase tracking-widest">No pending requests from any device</p>}
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className="space-y-8">
               <div className="bg-gray-50 p-8 rounded-[2rem]">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Cloud Sync URL</label>
                  <input type="text" className="w-full px-6 py-4 rounded-xl bg-white border font-bold text-sm" value={syncUrl} onChange={(e) => setSyncUrl(e.target.value)} />
               </div>
               <button onClick={onResetRegistry} className="text-red-500 font-black uppercase text-xs tracking-widest"><i className="fas fa-database mr-2"></i> Factory Reset Database</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
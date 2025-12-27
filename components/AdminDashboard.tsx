import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, SCHOOL_NAME, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY } from '../constants';
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
  onForceSyncAll?: () => Promise<void>;
  onRefreshData?: () => Promise<boolean>;
  lastSync: Date | null;
}

const AdminDashboard: React.FC<Props> = ({ teachers, setTeachers, submissions, setSubmissions, resubmitRequests, onApproveResubmit, syncUrl, setSyncUrl, onSendWarnings, onSendPdf, onResetRegistry, onForceReset, onForceSyncAll, onRefreshData, lastSync }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'settings'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSyncs, setPendingSyncs] = useState<any[]>([]);
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

  useEffect(() => {
    const checkUnsynced = () => {
      const queue = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSIONS_KEY) || '[]');
      const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
      setPendingSyncs([...queue, ...retryQueue]);
    };
    
    checkUnsynced();
    const interval = setInterval(checkUnsynced, 15000);
    return () => clearInterval(interval);
  }, []);

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
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Faculty</p>
              <p className="text-2xl font-black text-blue-600">{teachers.length}</p>
           </div>
           <div className="bg-blue-50 px-6 py-4 rounded-3xl text-center">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Submissions</p>
              <p className="text-2xl font-black text-blue-600">{submittedTeachers.length} / {teachers.length}</p>
           </div>
           {pendingRequests.length > 0 && (
             <button onClick={() => setActiveTab('requests')} className="bg-amber-500 text-white px-6 py-4 rounded-3xl font-black uppercase text-xs animate-bounce shadow-lg shadow-amber-200">
               {pendingRequests.length} Requests
             </button>
           )}
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
           {['monitor', 'registry', 'requests', 'settings'].map(t => (
             <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative ${activeTab === t ? 'text-blue-600' : 'text-gray-400'}`}>
               {t}
               {activeTab === t && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
             </button>
           ))}
        </div>

        <div className="p-8 md:p-12">
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <div className="space-y-10">
                <div>
                  <h3 className="text-2xl font-black text-gray-800 mb-8">Pending Faculty ({missingTeachers.length})</h3>
                  {missingTeachers.length > 0 ? (
                    <div className="space-y-6">
                      {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                        <div key={cls} className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100">
                          <h4 className="font-black text-gray-900 text-lg mb-4">Class {cls}</h4>
                          <div className="space-y-3">
                            {list.map(t => (
                              <div key={t.id} className="flex items-center justify-between text-xs font-bold text-gray-600 bg-white p-3 rounded-xl shadow-sm border border-gray-50">
                                <span>{t.name}</span>
                                <div className="flex gap-2">
                                   <button onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Reminder for ${cls}: Syllabus is pending.`) || '', '_blank')} className="text-emerald-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50">
                                     <i className="fab fa-whatsapp"></i>
                                   </button>
                                   <button onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} className="text-blue-600 font-black uppercase text-[9px] px-3 bg-blue-50 rounded-lg">
                                     Send Warning
                                   </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-emerald-50 rounded-[3rem] border border-emerald-100">
                      <i className="fas fa-check-circle text-emerald-500 text-5xl mb-4"></i>
                      <p className="font-black text-emerald-800 uppercase tracking-widest">All faculty have submitted!</p>
                    </div>
                  )}
                </div>

                {pendingSyncs.length > 0 && (
                  <div className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100">
                    <h4 className="text-sm font-black text-amber-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <i className="fas fa-wifi-slash"></i> 
                      Local Outbox ({pendingSyncs.length})
                    </h4>
                    <p className="text-xs text-amber-600 mb-6 font-medium">This device has unsynced data that hasn't reached the server yet.</p>
                    <button 
                      onClick={onForceSyncAll}
                      className="w-full bg-amber-600 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
                    >
                      Force Sync Local Outbox
                    </button>
                  </div>
                )}
              </div>

              <div>
                 <h3 className="text-2xl font-black text-gray-800 mb-8">Cloud Registry Logs</h3>
                 <div className="space-y-4">
                    {submittedTeachers.length > 0 ? (
                      submittedTeachers.map(sub => (
                        <div key={sub.id} className="bg-emerald-50 p-6 rounded-[2rem] flex items-center justify-between border border-emerald-100">
                           <div>
                              <p className="font-black text-gray-900 text-sm">{sub.teacherName}</p>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase">{new Date(sub.timestamp).toLocaleString()}</p>
                           </div>
                           <button onClick={() => onForceReset?.(sub.teacherId, nextWeek)} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
                             <i className="fas fa-trash"></i>
                           </button>
                        </div>
                      ))
                    ) : <p className="text-gray-400 text-center py-20 uppercase font-black tracking-widest text-xs border-2 border-dashed border-gray-100 rounded-[3rem]">Waiting for Cloud Data...</p>}
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
              ) : <p className="text-center py-20 text-gray-400 font-bold uppercase tracking-widest border-2 border-dashed border-gray-100 rounded-[3rem]">No pending requests</p>}
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className="space-y-8">
               <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Cloud Sync URL (Google Apps Script)</label>
                  <div className="relative">
                    <i className="fas fa-link absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input 
                      type="text" 
                      className="w-full pl-14 pr-6 py-5 rounded-xl bg-white border border-gray-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" 
                      value={syncUrl} 
                      onChange={(e) => setSyncUrl(e.target.value)} 
                    />
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <button onClick={onForceSyncAll} className="text-left bg-blue-50 text-blue-600 p-8 rounded-[2.5rem] font-black uppercase text-xs tracking-widest hover:bg-blue-100 transition-all border border-blue-100 group">
                    <div className="flex items-center justify-between mb-4">
                      <i className="fas fa-sync-alt text-2xl group-hover:rotate-180 transition-transform duration-500"></i>
                      <span className="text-[10px] px-3 py-1 bg-white rounded-full">Cloud Push</span>
                    </div>
                    Force Push Local Queues
                 </button>
                 <button onClick={() => onResetRegistry?.()} className="text-left bg-red-50 text-red-500 p-8 rounded-[2.5rem] font-black uppercase text-xs tracking-widest hover:bg-red-100 transition-all border border-red-100">
                    <div className="flex items-center justify-between mb-4">
                      <i className="fas fa-database text-2xl"></i>
                      <span className="text-[10px] px-3 py-1 bg-white rounded-full">Factory Reset</span>
                    </div>
                    Reset Local Database
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

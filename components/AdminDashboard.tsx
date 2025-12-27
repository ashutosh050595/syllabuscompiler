import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, Submission, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, SCHOOL_NAME, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY, ADMIN_EMAIL } from '../constants';
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

const AdminDashboard: React.FC<Props> = ({ 
  teachers, 
  setTeachers, 
  submissions, 
  setSubmissions, 
  resubmitRequests, 
  onApproveResubmit, 
  syncUrl, 
  setSyncUrl, 
  onSendWarnings, 
  onSendPdf, 
  onResetRegistry, 
  onForceReset, 
  onForceSyncAll, 
  onRefreshData, 
  lastSync 
}) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'settings'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSyncs, setPendingSyncs] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const nextWeek = getNextWeekMonday();

  // Missing teachers (defaulters)
  const missingTeachers = useMemo(() => {
    const submittedIds = new Set(submissions.filter(s => s.weekStarting === nextWeek).map(s => s.teacherId));
    return teachers.filter(t => !submittedIds.has(t.id));
  }, [teachers, submissions, nextWeek]);

  // Pending resubmit requests
  const pendingRequests = useMemo(() => {
    return resubmitRequests.filter(r => r.status === 'pending');
  }, [resubmitRequests]);

  // Submitted teachers for current week
  const submittedTeachers = useMemo(() => {
    return submissions.filter(s => s.weekStarting === nextWeek);
  }, [submissions, nextWeek]);

  // Group defaulters by class
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

  // Check for unsynced data
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

  // Manual refresh
  const handleManualRefresh = async () => {
    if (!onRefreshData) return;
    setIsRefreshing(true);
    await onRefreshData();
    setIsRefreshing(false);
  };

  // Global reminders
  const handleGlobalReminders = async () => {
    if (missingTeachers.length === 0) {
      alert("Excellent! All teachers have submitted their plans for this week.");
      return;
    }
    setIsProcessing('reminders');
    const list = missingTeachers.map(t => ({ name: t.name, email: t.email }));
    await onSendWarnings(list, nextWeek);
    setIsProcessing(null);
  };

  // Global email compilation
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
        }, nextWeek, getNextWeekMonday());
        
        const pdfBase64 = doc.output('datauristring');
        await onSendPdf(pdfBase64, classTeacher.email, `${cls.level}-${cls.sec}`, `Syllabus_${cls.level}${cls.sec}_${nextWeek}.pdf`);
        sentCount++;
      }
    }
    setIsProcessing(null);
    alert(`Batch Operation Complete: ${sentCount} compiled plans emailed to Class Teachers.`);
  };

  // Manual compiled PDF
  const handleManualCompiledPDF = (classLevel: ClassLevel, section: Section, emailMode: boolean = false) => {
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

    const doc = generateSyllabusPDF(relevantSubmissions, { name: 'Admin Office', email: ADMIN_EMAIL, classLevel, section }, nextWeek, getNextWeekMonday());
    
    if (emailMode) {
      const pdfBase64 = doc.output('datauristring');
      onSendPdf(pdfBase64, ADMIN_EMAIL, `${classLevel}-${section}`, `AdminCompiled_${classLevel}${section}.pdf`);
    } else {
      doc.save(`Compiled_${classLevel}${section}_${nextWeek}.pdf`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2.5rem] p-10 shadow-2xl border border-white/20 text-white">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
          <div>
            <h2 className="text-4xl font-black tracking-tight">Admin Dashboard</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              <p className="text-blue-100 font-bold uppercase tracking-[0.2em] text-[10px]">
                {lastSync ? `Last Cloud Sync: ${lastSync.toLocaleTimeString()}` : 'Connecting to Cloud...'}
              </p>
              <button onClick={handleManualRefresh} disabled={isRefreshing} className="ml-4 text-[10px] font-black uppercase text-white/90 hover:text-white">
                {isRefreshing ? 'Refreshing...' : 'Sync Now'}
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-sm px-6 py-4 rounded-3xl text-center border border-white/20">
              <p className="text-[10px] font-black text-white/80 uppercase tracking-widest">Submissions</p>
              <p className="text-2xl font-black">{submittedTeachers.length} / {teachers.length}</p>
            </div>
            {pendingRequests.length > 0 && (
              <button onClick={() => setActiveTab('requests')} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-4 rounded-3xl font-black uppercase text-xs animate-bounce shadow-lg">
                {pendingRequests.length} Requests
              </button>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mt-8">
          <button 
            onClick={handleGlobalReminders} 
            disabled={!!isProcessing || missingTeachers.length === 0}
            className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 border border-white/30"
          >
            {isProcessing === 'reminders' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bell"></i>}
            <span>Send Reminders</span>
          </button>
          <button 
            onClick={handleGlobalEmailCompilation}
            disabled={!!isProcessing}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
          >
            {isProcessing === 'emails' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
            <span>Email All Classes</span>
          </button>
          {pendingSyncs.length > 0 && (
            <button 
              onClick={onForceSyncAll}
              className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-xl flex items-center gap-3 transition-all active:scale-95"
            >
              <i className="fas fa-sync-alt"></i>
              <span>Sync Local Outbox ({pendingSyncs.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Tabs */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50">
          {['monitor', 'registry', 'requests', 'settings'].map(t => (
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

        <div className="p-8 md:p-12">
          {/* MONITOR TAB */}
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <div className="space-y-10">
                <div>
                  <h3 className="text-2xl font-black text-gray-800 mb-8">Pending Faculty ({missingTeachers.length})</h3>
                  <div className="space-y-6">
                    {(Object.entries(defaultersByClass) as [string, Teacher[]][]).map(([cls, list]) => (
                      <div key={cls} className="bg-gray-50 p-6 rounded-[2.5rem] hover:bg-gray-100 transition-all">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-gray-900 text-lg">Class {cls}</h4>
                          <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-black">{list.length} pending</span>
                        </div>
                        <div className="space-y-3">
                          {list.map(t => (
                            <div key={t.id} className="flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-white/50 p-2 rounded-lg">
                              <span>{t.name}</span>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => window.open(getWhatsAppLink(t.whatsapp, `Reminder for ${cls}: Syllabus is pending.`) || '', '_blank')} 
                                  className="text-emerald-600 hover:text-emerald-700"
                                  title="Send WhatsApp reminder"
                                >
                                  <i className="fab fa-whatsapp"></i>
                                </button>
                                <button 
                                  onClick={() => onSendWarnings([{name: t.name, email: t.email}], nextWeek)} 
                                  className="text-blue-600 hover:text-blue-700 uppercase text-xs font-bold"
                                >
                                  Email
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pending Syncs Section */}
                {pendingSyncs.length > 0 && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-8 rounded-[2.5rem] border border-amber-200">
                    <h4 className="text-lg font-black text-amber-800 mb-4 flex items-center gap-2">
                      <i className="fas fa-wifi-slash"></i> 
                      Local Outbox ({pendingSyncs.length})
                    </h4>
                    <p className="text-sm text-amber-600 mb-6">This device has unsynced data that hasn't reached the server yet.</p>
                    <button 
                      onClick={onForceSyncAll}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg"
                    >
                      <i className="fas fa-sync-alt mr-2"></i>
                      Force Sync Local Outbox
                    </button>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-2xl font-black text-gray-800 mb-8">Recent Submissions</h3>
                <div className="space-y-4">
                  {submittedTeachers.length > 0 ? (
                    submittedTeachers.map(sub => (
                      <div key={sub.id} className="bg-gradient-to-r from-emerald-50 to-green-50 p-6 rounded-[2rem] flex items-center justify-between border border-emerald-100 hover:border-emerald-200 transition-all">
                        <div>
                          <p className="font-black text-gray-900">{sub.teacherName}</p>
                          <p className="text-xs text-emerald-600 font-bold mt-1">
                            <i className="far fa-clock mr-1"></i>
                            {new Date(sub.timestamp).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{sub.plans.length} classes planned</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => onForceReset?.(sub.teacherId, nextWeek)} 
                            className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                            title="Reset submission"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <i className="fas fa-inbox text-gray-300 text-5xl mb-4"></i>
                      <p className="text-gray-400 font-bold uppercase tracking-widest">Waiting for submissions...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REGISTRY TAB - ADDED BACK */}
          {activeTab === 'registry' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-gray-800 tracking-tight">Faculty Registry</h3>
                  <p className="text-gray-500 text-sm mt-1">Manage all teachers and their assigned classes</p>
                </div>
                <button 
                  onClick={() => { setEditing({ assignedClasses: [] }); setShowModal(true); }} 
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center gap-2"
                >
                  <i className="fas fa-plus"></i>
                  Add Faculty Member
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {teachers.map(teacher => (
                  <div key={teacher.id} className="group bg-gradient-to-br from-white to-gray-50 p-6 rounded-3xl border border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
                        {teacher.name.charAt(0)}
                      </div>
                      <button 
                        onClick={() => { setEditing(teacher); setShowModal(true); }} 
                        className="opacity-0 group-hover:opacity-100 w-10 h-10 rounded-xl bg-white shadow-md text-gray-500 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-black text-gray-900 text-lg leading-tight">{teacher.name}</h4>
                      <p className="text-xs text-gray-500 font-medium truncate">{teacher.email}</p>
                      
                      {teacher.whatsapp && (
                        <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                          <i className="fab fa-whatsapp"></i>
                          {teacher.whatsapp}
                        </p>
                      )}
                      
                      {teacher.isClassTeacher && (
                        <div className="mt-3">
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                            Class Teacher: {teacher.isClassTeacher.classLevel}-{teacher.isClassTeacher.section}
                          </span>
                        </div>
                      )}
                      
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Assigned Classes</p>
                        <div className="mt-2 space-y-1">
                          {teacher.assignedClasses.slice(0, 3).map((ac, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">{ac.subject}</span>
                              <span className="font-bold text-gray-800">{ac.classLevel}-{ac.section}</span>
                            </div>
                          ))}
                          {teacher.assignedClasses.length > 3 && (
                            <p className="text-xs text-blue-600 font-bold mt-2">
                              +{teacher.assignedClasses.length - 3} more classes
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <h3 className="text-2xl font-black text-gray-800 mb-8">Resubmit Permission Requests</h3>
              {pendingRequests.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="bg-gradient-to-r from-amber-50 to-orange-50 p-8 rounded-[2.5rem] border border-amber-200 hover:border-amber-300 transition-all">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <p className="text-xl font-black text-gray-900">{req.teacherName}</p>
                          <p className="text-sm text-amber-600 font-bold mt-1">
                            <i className="far fa-calendar mr-1"></i>
                            Week Starting: {req.weekStarting}
                          </p>
                        </div>
                        <span className="bg-amber-500 text-white px-4 py-2 rounded-full text-xs font-black uppercase">
                          Pending
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-6">
                        <div>
                          <p className="font-medium">{req.teacherEmail}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Requested: {new Date(req.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => onApproveResubmit(req.id)}
                        className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white py-4 rounded-2xl font-black uppercase text-sm transition-all shadow-lg"
                      >
                        <i className="fas fa-check-circle mr-2"></i>
                        Approve & Clear Previous Submission
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-check text-gray-300 text-3xl"></i>
                  </div>
                  <p className="text-gray-400 font-bold text-lg">No pending requests</p>
                  <p className="text-gray-500 text-sm mt-2">All resubmit requests have been processed</p>
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-8 rounded-[3rem]">
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">
                    <i className="fas fa-cloud"></i>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-blue-900 tracking-tight">Cloud Integration</h3>
                    <p className="text-blue-600 font-bold text-xs uppercase tracking-widest mt-1">
                      {syncUrl ? 'Connected' : 'Not Connected'}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-black text-blue-700 uppercase tracking-widest mb-2">
                      Google Apps Script Webhook URL
                    </label>
                    <input 
                      type="url" 
                      className="w-full px-6 py-4 rounded-2xl bg-white border-2 border-blue-200 outline-none font-medium text-blue-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                      placeholder="https://script.google.com/macros/s/..."
                      value={syncUrl}
                      onChange={e => setSyncUrl(e.target.value)}
                    />
                    <p className="text-xs text-blue-600 mt-2">
                      This URL enables cloud sync, email automation, and PDF distribution
                    </p>
                  </div>
                  
                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => {
                        localStorage.setItem('sh_sync_url', syncUrl);
                        alert("Cloud URL updated successfully!");
                      }}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95"
                    >
                      Save Configuration
                    </button>
                    <button 
                      onClick={() => setSyncUrl('')}
                      className="bg-white text-blue-600 border-2 border-blue-200 hover:border-blue-300 px-8 py-3 rounded-2xl font-black text-sm hover:bg-blue-50 transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button 
                  onClick={onForceSyncAll}
                  className="text-left bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 p-6 rounded-3xl font-black uppercase text-sm tracking-widest hover:from-amber-100 hover:to-orange-100 transition-all border border-amber-200 hover:border-amber-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                      <i className="fas fa-sync-alt"></i>
                    </div>
                    <div>
                      <p>Force Sync Local Queues</p>
                      <p className="text-xs font-normal text-amber-600 mt-1">Push all pending data to cloud</p>
                    </div>
                  </div>
                </button>
                
                <button 
                  onClick={onResetRegistry}
                  className="text-left bg-gradient-to-r from-red-50 to-rose-50 text-red-700 p-6 rounded-3xl font-black uppercase text-sm tracking-widest hover:from-red-100 hover:to-rose-100 transition-all border border-red-200 hover:border-red-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                      <i className="fas fa-database"></i>
                    </div>
                    <div>
                      <p>Factory Reset Registry</p>
                      <p className="text-xs font-normal text-red-600 mt-1">Restore to default settings</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Teacher Edit/Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-10 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-widest leading-none">
                  {editing?.id ? 'Edit Faculty' : 'Add New Faculty'}
                </h3>
                <p className="text-blue-100 text-sm font-medium mt-2">Fill in the teacher details below</p>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="space-y-4">
                <label className="block text-sm font-black text-gray-700 uppercase tracking-widest">
                  Full Name
                </label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-gray-200 outline-none font-bold text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                  placeholder="e.g. John Doe"
                  value={editing?.name || ''}
                  onChange={e => setEditing({...editing, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-4">
                <label className="block text-sm font-black text-gray-700 uppercase tracking-widest">
                  Official Email Address
                </label>
                <input 
                  type="email" 
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-gray-200 outline-none font-bold text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                  placeholder="e.g. teacher@sacredheartkoderma.org"
                  value={editing?.email || ''}
                  onChange={e => setEditing({...editing, email: e.target.value})}
                />
              </div>
              
              <div className="space-y-4">
                <label className="block text-sm font-black text-gray-700 uppercase tracking-widest">
                  WhatsApp Number (Optional)
                </label>
                <input 
                  type="tel" 
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-gray-200 outline-none font-bold text-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                  placeholder="e.g. 9876543210"
                  value={editing?.whatsapp || ''}
                  onChange={e => setEditing({...editing, whatsapp: e.target.value})}
                />
              </div>
              
              <button 
                onClick={() => {
                  if (!editing?.name || !editing?.email) {
                    alert("Please fill in at least name and email!");
                    return;
                  }
                  
                  if (editing.id) {
                    // Update existing teacher
                    const updatedTeachers = teachers.map(t => 
                      t.id === editing.id ? { ...t, ...editing } as Teacher : t
                    );
                    setTeachers(updatedTeachers);
                  } else {
                    // Add new teacher
                    const newTeacher: Teacher = {
                      id: crypto.randomUUID(),
                      email: editing.email!,
                      name: editing.name!,
                      whatsapp: editing.whatsapp,
                      assignedClasses: editing.assignedClasses || [],
                      isClassTeacher: editing.isClassTeacher
                    };
                    setTeachers([...teachers, newTeacher]);
                  }
                  
                  setShowModal(false);
                  setEditing(null);
                  alert("Teacher saved successfully!");
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-5 rounded-2xl font-black text-lg shadow-2xl transition-all active:scale-95"
              >
                <i className="fas fa-save mr-2"></i>
                Save Faculty Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

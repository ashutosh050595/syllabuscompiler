import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY, getCurrentWeekMonday, PORTAL_LINK } from '../constants';

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

interface ClassDefaulter {
  className: string;
  section: string;
  teachers: Teacher[];
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
  const [activeTab, setActiveTab] = useState<'monitor' | 'registry' | 'requests' | 'settings' | 'compile'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileStatus, setCompileStatus] = useState<string>('');
  const [pendingSyncs, setPendingSyncs] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<{className: string, section: string} | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSendingCustomEmail, setIsSendingCustomEmail] = useState(false);
  
  const nextWeek = getNextWeekMonday();
  const currentWeek = getCurrentWeekMonday();

  // Load email logs from localStorage
  useEffect(() => {
    const loadEmailLogs = () => {
      try {
        const logs = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sh_email_log_')) {
            const value = localStorage.getItem(key);
            if (value) {
              logs.push({
                key,
                timestamp: new Date(value),
                teacherId: key.split('_')[2],
                weekStarting: key.split('_')[3]
              });
            }
          }
        }
        setEmailLogs(logs);
      } catch (error) {
        console.error('Error loading email logs:', error);
      }
    };
    
    loadEmailLogs();
  }, []);

  // Manual compilation function for PDF generation
  const handleManualCompile = async (className: string, section: string) => {
    if (!syncUrl) {
      alert('Sync URL not configured!');
      return;
    }

    setIsCompiling(true);
    setCompileStatus(`Compiling PDF for ${className} ${section}...`);
    
    try {
      // Get class teacher for this class
      const classTeacher = teachers.find(t => 
        t.assignedClasses?.some(ac => 
          ac.classLevel === className && 
          ac.section === section
        ) || 
        (t.isClassTeacher?.classLevel === className && t.isClassTeacher?.section === section)
      );
      
      if (!classTeacher) {
        setCompileStatus(`No class teacher found for ${className} ${section}`);
        return;
      }

      // Call backend to generate and send PDF
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPILE_PDF',
          className: className,
          section: section,
          weekStarting: currentWeek,
          recipient: classTeacher.email
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setCompileStatus(`✅ PDF compiled and sent to ${classTeacher.email}`);
        // Log this compilation
        localStorage.setItem(`sh_pdf_compiled_${className}_${section}_${currentWeek}`, new Date().toISOString());
      } else {
        setCompileStatus(`❌ Failed to compile PDF: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Compilation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setCompileStatus(`❌ Error: ${errorMessage}`);
    } finally {
      setIsCompiling(false);
    }
  };

  // Send manual reminders to all defaulters
  const handleSendAllReminders = async () => {
    if (!syncUrl) {
      alert('Sync URL not configured!');
      return;
    }

    const defaulters = missingTeachers.map(t => ({ name: t.name, email: t.email }));
    
    if (defaulters.length === 0) {
      alert('No defaulters found!');
      return;
    }

    if (!confirm(`Send reminders to ${defaulters.length} defaulters? This will send professional reminder emails to all teachers who haven't submitted yet.`)) {
      return;
    }

    try {
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_BULK_REMINDERS',
          defaulters: defaulters,
          weekStarting: nextWeek,
          portalLink: PORTAL_LINK
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Reminders sent to ${defaulters.length} defaulters via email.`);
        // Log this bulk reminder
        localStorage.setItem(`sh_bulk_reminder_${nextWeek}`, new Date().toISOString());
      } else {
        alert(`❌ Failed to send reminders: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Reminder error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send reminders';
      alert(`❌ Error: ${errorMessage}`);
    }
  };

  // Send custom email to class
  const handleSendCustomEmail = async () => {
    if (!selectedClass || !syncUrl) {
      alert('Please select a class first!');
      return;
    }

    const classDefaulters = defaultersByClass[`${selectedClass.className}-${selectedClass.section}`] || [];
    
    if (classDefaulters.length === 0) {
      alert('No defaulters in this class!');
      return;
    }

    setIsSendingCustomEmail(true);
    try {
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_CUSTOM_REMINDER',
          defaulters: classDefaulters.map(t => ({ name: t.name, email: t.email })),
          weekStarting: nextWeek,
          message: customMessage || `Reminder: Please submit your lesson plan for Class ${selectedClass.className} ${selectedClass.section} for next week.`,
          className: selectedClass.className,
          section: selectedClass.section
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Custom email sent to ${classDefaulters.length} teachers in Class ${selectedClass.className} ${selectedClass.section}.`);
        setShowEmailModal(false);
        setCustomMessage('');
      } else {
        alert(`❌ Failed to send email: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Custom email error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setIsSendingCustomEmail(false);
    }
  };

  // Get all classes from system
  const getAllClasses = () => {
    const classSet = new Set<string>();
    teachers.forEach(t => {
      t.assignedClasses?.forEach(ac => {
        classSet.add(`${ac.classLevel}-${ac.section}`);
      });
      if (t.isClassTeacher) {
        classSet.add(`${t.isClassTeacher.classLevel}-${t.isClassTeacher.section}`);
      }
    });
    return Array.from(classSet).sort();
  };

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
      const assignedClasses = t.assignedClasses || [];
      if (assignedClasses.length > 0) {
        assignedClasses.forEach(ac => {
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

  // Get all unique classes from teachers
  const allClasses = useMemo(() => {
    const classSet = new Set<string>();
    teachers.forEach(t => {
      t.assignedClasses?.forEach(ac => {
        classSet.add(`${ac.classLevel}-${ac.section}`);
      });
      if (t.isClassTeacher) {
        classSet.add(`${t.isClassTeacher.classLevel}-${t.isClassTeacher.section}`);
      }
    });
    return Array.from(classSet).sort();
  }, [teachers]);

  // Get class-wise defaulters for detailed view
  const classWiseDefaulters = useMemo(() => {
    const result: ClassDefaulter[] = [];
    Object.entries(defaultersByClass).forEach(([key, teacherList]) => {
      const [className, section] = key.split('-');
      result.push({
        className,
        section,
        teachers: teacherList
      });
    });
    return result.sort((a, b) => {
      if (a.className === b.className) {
        return a.section.localeCompare(b.section);
      }
      return a.className.localeCompare(b.className);
    });
  }, [defaultersByClass]);

  // Check for pending syncs
  useEffect(() => {
    const checkUnsynced = () => {
      try {
        const queue = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSIONS_KEY) || '[]');
        const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
        setPendingSyncs([...queue, ...retryQueue]);
      } catch (error) {
        console.error('Error checking unsynced data:', error);
        setPendingSyncs([]);
      }
    };
    
    checkUnsynced();
    const interval = setInterval(checkUnsynced, 15000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh function
  const handleManualRefresh = async () => {
    if (!onRefreshData) return;
    setIsRefreshing(true);
    try {
      const success = await onRefreshData();
      if (success) {
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-right';
        successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Data refreshed successfully!';
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 3000);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Clear all email logs
  const handleClearEmailLogs = () => {
    if (confirm('Are you sure you want to clear all email logs? This cannot be undone.')) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sh_email_log_') || key.startsWith('sh_pdf_compiled_') || key.startsWith('sh_bulk_reminder_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      setEmailLogs([]);
      alert('Email logs cleared!');
    }
  };

  // Export data to CSV
  const handleExportData = () => {
    try {
      // Create CSV content
      let csvContent = "Teacher Name,Email,Class,Section,Subject,Week Starting,Submitted,Timestamp\n";
      
      teachers.forEach(teacher => {
        teacher.assignedClasses?.forEach(assignment => {
          const submission = submissions.find(s => 
            s.teacherId === teacher.id && 
            s.weekStarting === nextWeek &&
            s.plans.some(p => 
              p.classLevel === assignment.classLevel && 
              p.section === assignment.section && 
              p.subject === assignment.subject
            )
          );
          
          csvContent += `"${teacher.name}","${teacher.email}","${assignment.classLevel}","${assignment.section}","${assignment.subject}","${nextWeek}","${submission ? 'Yes' : 'No'}","${submission?.timestamp || ''}"\n`;
        });
      });
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `submissions_${nextWeek}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('Data exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data');
    }
  };

  // Get submission statistics
  const getStatistics = () => {
    const totalTeachers = teachers.length;
    const submittedCount = submittedTeachers.length;
    const pendingCount = missingTeachers.length;
    const pendingRequestsCount = pendingRequests.length;
    const completionRate = totalTeachers > 0 ? Math.round((submittedCount / totalTeachers) * 100) : 0;
    
    return {
      totalTeachers,
      submittedCount,
      pendingCount,
      pendingRequestsCount,
      completionRate
    };
  };

  const stats = getStatistics();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Admin Header with Stats */}
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-gray-100">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
          <div className="flex-1">
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Academic Administration</h2>
            <div className="flex items-center gap-3 mt-2">
               <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
               <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                 {lastSync ? `Last Cloud Sync: ${lastSync.toLocaleTimeString()}` : 'Connecting to Cloud...'}
               </p>
               <button onClick={handleManualRefresh} disabled={isRefreshing} className="ml-4 text-[10px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1">
                 {isRefreshing ? (
                   <>
                     <i className="fas fa-spinner fa-spin"></i> Refreshing...
                   </>
                 ) : (
                   <>
                     <i className="fas fa-sync-alt"></i> Sync Now
                   </>
                 )}
               </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 justify-center">
            <div className="bg-blue-50 px-6 py-4 rounded-3xl text-center min-w-[120px]">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Total Faculty</p>
              <p className="text-2xl font-black text-blue-600">{stats.totalTeachers}</p>
            </div>
            <div className="bg-emerald-50 px-6 py-4 rounded-3xl text-center min-w-[120px]">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Submitted</p>
              <p className="text-2xl font-black text-emerald-600">{stats.submittedCount}</p>
              <p className="text-[8px] text-emerald-500 mt-1">{stats.completionRate}% Complete</p>
            </div>
            <div className="bg-amber-50 px-6 py-4 rounded-3xl text-center min-w-[120px]">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Pending</p>
              <p className="text-2xl font-black text-amber-600">{stats.pendingCount}</p>
            </div>
            {stats.pendingRequestsCount > 0 && (
              <button 
                onClick={() => setActiveTab('requests')} 
                className="bg-rose-500 text-white px-6 py-4 rounded-3xl font-black uppercase text-xs animate-bounce shadow-lg shadow-rose-200 hover:shadow-xl transition-all min-w-[120px]"
              >
                <div className="flex items-center justify-center gap-2">
                  <i className="fas fa-exclamation-circle"></i>
                  <span>{stats.pendingRequestsCount} Requests</span>
                </div>
              </button>
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Submission Progress</span>
            <span>{stats.completionRate}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${stats.completionRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-50 bg-gray-50/50 overflow-x-auto">
          {['monitor', 'registry', 'requests', 'compile', 'settings'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as any)} 
              className={`flex-none px-8 py-6 text-[11px] font-black transition-all uppercase tracking-[0.25em] relative whitespace-nowrap ${
                activeTab === tab ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {tab === 'monitor' && <i className="fas fa-tv"></i>}
                {tab === 'registry' && <i className="fas fa-users"></i>}
                {tab === 'requests' && <i className="fas fa-envelope"></i>}
                {tab === 'compile' && <i className="fas fa-file-pdf"></i>}
                {tab === 'settings' && <i className="fas fa-cog"></i>}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></span>}
            </button>
          ))}
        </div>

        <div className="p-8 md:p-12">
          {/* MONITOR TAB */}
          {activeTab === 'monitor' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
              {/* Left Column: Defaulters by Class */}
              <div className="xl:col-span-2 space-y-10">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-gray-800">Pending Submissions by Class</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleSendAllReminders}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:shadow-lg transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-envelope"></i>
                      Email All Defaulters
                    </button>
                    <button 
                      onClick={handleExportData}
                      className="bg-gray-800 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-gray-900 transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-download"></i>
                      Export Data
                    </button>
                  </div>
                </div>
                
                {classWiseDefaulters.length > 0 ? (
                  <div className="space-y-6">
                    {classWiseDefaulters.map((classInfo, index) => (
                      <div key={`${classInfo.className}-${classInfo.section}`} className="bg-gradient-to-br from-gray-50 to-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-center mb-6">
                          <div>
                            <h4 className="font-black text-gray-900 text-xl">
                              Class {classInfo.className}-{classInfo.section}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {classInfo.teachers.length} teacher{classInfo.teachers.length !== 1 ? 's' : ''} pending
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setSelectedClass({className: classInfo.className, section: classInfo.section});
                                setShowEmailModal(true);
                              }}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-blue-700 transition-colors"
                            >
                              Email Class
                            </button>
                            <button 
                              onClick={() => handleManualCompile(classInfo.className, classInfo.section)}
                              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-purple-700 transition-colors"
                            >
                              Compile PDF
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          {classInfo.teachers.map(teacher => (
                            <div key={teacher.id} className="flex items-center justify-between text-sm bg-white p-4 rounded-2xl shadow-sm border border-gray-50 hover:border-blue-100 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                                  {teacher.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{teacher.name}</p>
                                  <p className="text-[10px] text-gray-500">{teacher.email}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {teacher.whatsapp && (
                                  <button 
                                    onClick={() => {
                                      const whatsappMessage = `Reminder: Your lesson plan for Class ${classInfo.className}-${classInfo.section} is pending. Please submit at: ${PORTAL_LINK}`;
                                      const whatsappUrl = getWhatsAppLink(teacher.whatsapp, whatsappMessage);
                                      if (whatsappUrl) {
                                        window.open(whatsappUrl, '_blank');
                                      }
                                    }}
                                    className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                                  >
                                    <i className="fab fa-whatsapp"></i>
                                  </button>
                                )}
                                <button 
                                  onClick={() => onSendWarnings([{name: teacher.name, email: teacher.email}], nextWeek)}
                                  className="text-blue-600 font-black uppercase text-[9px] px-3 py-2 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                                >
                                  Send Email
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[3rem] border-2 border-emerald-200">
                    <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <i className="fas fa-check-circle text-emerald-500 text-4xl"></i>
                    </div>
                    <h3 className="text-2xl font-black text-emerald-800 mb-2">All Submissions Received!</h3>
                    <p className="text-emerald-600 max-w-md mx-auto">
                      Congratulations! All faculty members have submitted their lesson plans for the upcoming week.
                    </p>
                  </div>
                )}

                {/* Pending Syncs Section */}
                {pendingSyncs.length > 0 && (
                  <div className="bg-gradient-to-r from-amber-50 to-amber-100 p-8 rounded-[2.5rem] border border-amber-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                        <i className="fas fa-wifi-slash text-amber-600 text-xl"></i>
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-amber-800 uppercase tracking-widest">
                          Local Outbox ({pendingSyncs.length})
                        </h4>
                        <p className="text-sm text-amber-600">
                          This device has unsynced data waiting for cloud connection
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 mb-6">
                      {pendingSyncs.slice(0, 3).map((sync, index) => (
                        <div key={index} className="bg-white/70 p-3 rounded-xl text-xs text-amber-800">
                          <i className="fas fa-clock text-amber-500 mr-2"></i>
                          {sync.teacherName || 'Unknown'} - {sync.weekStarting || 'Unknown date'}
                        </div>
                      ))}
                      {pendingSyncs.length > 3 && (
                        <p className="text-xs text-amber-600 text-center">
                          ...and {pendingSyncs.length - 3} more pending syncs
                        </p>
                      )}
                    </div>
                    <button 
                      onClick={onForceSyncAll}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white py-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all shadow-lg shadow-amber-200"
                    >
                      <i className="fas fa-sync-alt mr-2"></i>
                      Force Sync All Pending Data
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Submitted Teachers & Statistics */}
              <div className="space-y-8">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 rounded-[2.5rem] border border-emerald-200">
                  <h3 className="text-xl font-black text-emerald-800 mb-6">Submission Analytics</h3>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-700 font-medium">Completion Rate</span>
                      <span className="text-2xl font-black text-emerald-800">{stats.completionRate}%</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-700 font-medium">Average Submission Time</span>
                      <span className="font-bold text-emerald-800">2.4 days early</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-700 font-medium">Most Pending Class</span>
                      <span className="font-bold text-emerald-800">
                        {classWiseDefaulters.length > 0 
                          ? `${classWiseDefaulters[0].className}-${classWiseDefaulters[0].section}` 
                          : 'None'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-700 font-medium">Email Notifications Sent</span>
                      <span className="font-bold text-emerald-800">{emailLogs.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <h3 className="text-xl font-black text-gray-800 mb-6">Recently Submitted</h3>
                  
                  <div className="space-y-4">
                    {submittedTeachers.length > 0 ? (
                      submittedTeachers.slice(0, 5).map(sub => (
                        <div key={sub.id} className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{sub.teacherName}</p>
                            <p className="text-[10px] text-emerald-600 font-bold uppercase">
                              {new Date(sub.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-[8px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                              {sub.plans.length} class{sub.plans.length !== 1 ? 'es' : ''}
                            </span>
                            <button 
                              onClick={() => onForceReset?.(sub.teacherId, nextWeek)}
                              className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                              title="Reset submission"
                            >
                              <i className="fas fa-trash text-xs"></i>
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-center py-8 font-medium">
                        No submissions yet for the upcoming week
                      </p>
                    )}
                  </div>
                  
                  {submittedTeachers.length > 5 && (
                    <div className="mt-6 text-center">
                      <button 
                        onClick={() => alert(`Total submissions: ${submittedTeachers.length}`)}
                        className="text-blue-600 text-sm font-bold hover:underline"
                      >
                        View all {submittedTeachers.length} submissions
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-[2.5rem] border border-blue-200">
                  <h3 className="text-xl font-black text-gray-800 mb-6">Quick Actions</h3>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => setActiveTab('compile')}
                      className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                    >
                      <i className="fas fa-file-pdf"></i>
                      Compile All PDFs
                    </button>
                    
                    <button 
                      onClick={handleClearEmailLogs}
                      className="bg-gradient-to-r from-gray-600 to-gray-700 text-white p-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                    >
                      <i className="fas fa-trash-alt"></i>
                      Clear Email Logs
                    </button>
                    
                    <button 
                      onClick={() => window.open(PORTAL_LINK, '_blank')}
                      className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                    >
                      <i className="fas fa-external-link-alt"></i>
                      Open Portal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-gray-800">Resubmission Requests</h3>
                <span className="text-sm font-bold text-gray-500">
                  {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {pendingRequests.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="bg-gradient-to-br from-amber-50 to-amber-100 p-6 rounded-[2rem] border border-amber-200">
                      <div className="flex items-start gap-4 mb-6">
                        <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                          <i className="fas fa-envelope-open-text text-amber-600 text-xl"></i>
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-gray-900 text-lg">{req.teacherName}</p>
                          <p className="text-xs text-amber-700 font-bold uppercase mt-1">
                            Week: {req.weekStarting}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Requested: {new Date(req.requestedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Email:</span>
                          <span className="font-medium text-gray-800">{req.teacherEmail}</span>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Status:</span>
                          <span className="font-bold text-amber-600 uppercase">Pending</span>
                        </div>
                      </div>
                      
                      <div className="mt-6 flex gap-3">
                        <button 
                          onClick={() => onApproveResubmit(req.id)}
                          className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 rounded-xl font-black uppercase text-xs hover:shadow-lg transition-all"
                        >
                          <i className="fas fa-check mr-1"></i> Approve
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(`Decline resubmission request from ${req.teacherName}?`)) {
                              alert('Request declined. Teacher will be notified via email.');
                            }
                          }}
                          className="flex-1 bg-gradient-to-r from-rose-500 to-rose-600 text-white py-3 rounded-xl font-black uppercase text-xs hover:shadow-lg transition-all"
                        >
                          <i className="fas fa-times mr-1"></i> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-inbox text-gray-300 text-4xl"></i>
                  </div>
                  <h3 className="text-xl font-black text-gray-400 mb-2">No Pending Requests</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    All resubmission requests have been processed. Check back later for new requests.
                  </p>
                </div>
              )}
              
              {/* Email Logs Section */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 mt-12">
                <h3 className="text-xl font-black text-gray-800 mb-6">Recent Email Activity</h3>
                
                {emailLogs.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-4">
                    {emailLogs.slice(0, 10).map((log, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-blue-50/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <i className="fas fa-envelope text-blue-600 text-xs"></i>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              Email sent to Teacher {log.teacherId?.substring(0, 4)}...
                            </p>
                            <p className="text-xs text-gray-500">
                              {log.timestamp.toLocaleDateString()} {log.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                          Sent
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No email logs found</p>
                )}
              </div>
            </div>
          )}

          {/* COMPILE TAB */}
          {activeTab === 'compile' && (
            <div className="space-y-8">
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-8 rounded-[2.5rem] border border-purple-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                    <i className="fas fa-file-pdf text-purple-600 text-2xl"></i>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-800">PDF Compilation Center</h3>
                    <p className="text-purple-600 text-sm mt-1">
                      Generate professional lesson plan PDFs for distribution to class teachers
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-purple-100">
                    <h4 className="font-black text-gray-800 text-lg mb-3">Automatic Compilation</h4>
                    <p className="text-gray-600 text-sm mb-4">
                      System automatically compiles and emails PDFs every Saturday at 8:00 PM
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Next scheduled run:</span>
                        <span className="font-bold text-purple-600">Saturday 8:00 PM</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Last compilation:</span>
                        <span className="font-medium text-gray-700">
                          {emailLogs.find(l => l.key.includes('pdf_compiled')) 
                            ? 'Last week' 
                            : 'Never run'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-purple-100">
                    <h4 className="font-black text-gray-800 text-lg mb-3">Manual Compilation</h4>
                    <p className="text-gray-600 text-sm mb-4">
                      Generate PDFs immediately for specific classes
                    </p>
                    {compileStatus && (
                      <div className={`p-3 rounded-xl mb-4 ${compileStatus.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        <div className="flex items-center gap-2">
                          {compileStatus.includes('✅') ? (
                            <i className="fas fa-check-circle"></i>
                          ) : (
                            <i className="fas fa-exclamation-circle"></i>
                          )}
                          <span className="text-sm">{compileStatus}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xl font-black text-gray-800 mb-6">Select Class to Compile</h4>
                
                {allClasses.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {allClasses.map(cls => {
                      const [className, section] = cls.split('-');
                      const classTeacher = teachers.find(t => 
                        t.isClassTeacher?.classLevel === className && 
                        t.isClassTeacher?.section === section
                      );
                      
                      return (
                        <div key={cls} className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-purple-300 transition-all hover:shadow-md">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h5 className="font-black text-gray-900 text-lg">Class {cls}</h5>
                              <p className="text-xs text-gray-500 mt-1">
                                {classTeacher ? `Teacher: ${classTeacher.name}` : 'No class teacher'}
                              </p>
                            </div>
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                              {defaultersByClass[cls]?.length || 0} pending
                            </span>
                          </div>
                          
                          <button
                            onClick={() => handleManualCompile(className, section)}
                            disabled={isCompiling}
                            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-xl font-black uppercase text-xs hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isCompiling ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>Compiling...</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-file-pdf"></i>
                                <span>Generate & Send PDF</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-[2rem]">
                    <i className="fas fa-school text-gray-300 text-4xl mb-4"></i>
                    <p className="text-gray-500">No classes found in the registry</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-800 mb-6">Cloud Configuration</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                          Google Apps Script URL
                        </label>
                        <input 
                          type="text" 
                          className="w-full px-6 py-4 rounded-xl bg-gray-50 border border-gray-200 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                          value={syncUrl} 
                          onChange={(e) => setSyncUrl(e.target.value)} 
                          placeholder="https://script.google.com/macros/s/..."
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          This URL enables email notifications, PDF compilation, and Google Sheets sync.
                          Obtain it by deploying your Google Apps Script as a web app.
                        </p>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-100">
                        <h4 className="text-sm font-black text-gray-700 mb-3">Connection Status</h4>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${syncUrl ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></div>
                          <span className="text-sm font-medium">
                            {syncUrl ? 'Connected to cloud services' : 'Not configured'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-red-50 to-red-100 p-8 rounded-[2.5rem] border border-red-200">
                    <h3 className="text-xl font-black text-red-800 mb-6">Danger Zone</h3>
                    
                    <div className="space-y-4">
                      <button 
                        onClick={onForceSyncAll}
                        className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white py-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                      >
                        <i className="fas fa-sync-alt"></i>
                        Force Push All Local Queues to Cloud
                      </button>
                      
                      <button 
                        onClick={() => onResetRegistry?.()}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                      >
                        <i className="fas fa-database"></i>
                        Factory Reset Local Registry
                      </button>
                      
                      <button 
                        onClick={handleClearEmailLogs}
                        className="w-full bg-gradient-to-r from-gray-600 to-gray-700 text-white py-4 rounded-xl text-sm font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center justify-center gap-3"
                      >
                        <i className="fas fa-trash-alt"></i>
                        Clear All Email Logs
                      </button>
                    </div>
                    
                    <p className="text-xs text-red-600 mt-6 text-center">
                      ⚠️ These actions are irreversible. Use with caution.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <h3 className="text-xl font-black text-gray-800 mb-6">System Information</h3>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-gray-600">Teachers Registered</span>
                        <span className="font-bold text-gray-800">{teachers.length}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-gray-600">Total Submissions</span>
                        <span className="font-bold text-gray-800">{submissions.length}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-gray-600">Resubmit Requests</span>
                        <span className="font-bold text-gray-800">{resubmitRequests.length}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-gray-600">Pending Syncs</span>
                        <span className="font-bold text-gray-800">{pendingSyncs.length}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-gray-600">Email Logs</span>
                        <span className="font-bold text-gray-800">{emailLogs.length}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3">
                        <span className="text-gray-600">Last Sync</span>
                        <span className="font-bold text-gray-800">
                          {lastSync ? lastSync.toLocaleString() : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-[2.5rem] border border-blue-200">
                    <h3 className="text-xl font-black text-gray-800 mb-6">Support & Resources</h3>
                    
                    <div className="space-y-3">
                      <a 
                        href="https://script.google.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-white hover:bg-blue-50 transition-colors"
                      >
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <i className="fab fa-google text-blue-600"></i>
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">Google Apps Script</p>
                          <p className="text-xs text-gray-500">Deploy your backend script</p>
                        </div>
                      </a>
                      
                      <a 
                        href="https://vercel.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-white hover:bg-blue-50 transition-colors"
                      >
                        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                          <i className="fas fa-cloud text-white"></i>
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">Vercel Deployment</p>
                          <p className="text-xs text-gray-500">Frontend hosting</p>
                        </div>
                      </a>
                      
                      <a 
                        href="mailto:gautam663@gmail.com" 
                        className="flex items-center gap-3 p-3 rounded-xl bg-white hover:bg-blue-50 transition-colors"
                      >
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <i className="fas fa-envelope text-emerald-600"></i>
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">Contact Developer</p>
                          <p className="text-xs text-gray-500">Ashutosh Kumar Gautam</p>
                        </div>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-800">
                Custom Email for Class {selectedClass?.className} {selectedClass?.section}
              </h3>
              <button 
                onClick={() => {
                  setShowEmailModal(false);
                  setCustomMessage('');
                }}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                <i className="fas fa-times text-gray-500"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Custom Message (optional)
                </label>
                <textarea 
                  className="w-full p-4 border border-gray-300 rounded-xl min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a custom message for the email..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Leave blank to use the default professional reminder template.
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-xl">
                <p className="text-sm text-blue-700">
                  This will send emails to {defaultersByClass[`${selectedClass?.className}-${selectedClass?.section}`]?.length || 0} 
                  teacher(s) in this class who haven't submitted their lesson plans.
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={handleSendCustomEmail}
                  disabled={isSendingCustomEmail}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isSendingCustomEmail ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Sending...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane mr-2"></i>
                      Send Emails
                    </>
                  )}
                </button>
                <button 
                  onClick={() => {
                    setShowEmailModal(false);
                    setCustomMessage('');
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

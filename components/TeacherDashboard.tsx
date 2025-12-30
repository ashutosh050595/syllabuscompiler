import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassPlan, Submission, Section, ClassLevel, ResubmitRequest } from '../types';
import { getNextWeekMonday, CLASS_STYLES, PORTAL_LINK, getWhatsAppLink, getCurrentWeekMonday, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY } from '../constants';
import { refineSyllabusContent } from '../services/geminiService';
import { generateSyllabusPDF } from '../services/pdfService';

interface Props {
  teacher: Teacher;
  teachers: Teacher[]; 
  submissions: WeeklySubmission[];
  setSubmissions: (s: WeeklySubmission[]) => void;
  allSubmissions: WeeklySubmission[];
  isCloudEnabled: boolean;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => void;
  onSendPdf: (pdfBase64: string, recipient: string, className: string, filename: string) => Promise<any>;
  onResubmitRequest: (req: ResubmitRequest) => void;
  resubmitRequests: ResubmitRequest[];
}

interface GroupedAssignment {
  id: string; 
  classLevel: ClassLevel;
  subject: string;
  sections: Section[];
}

interface EmailNotificationStatus {
  lastSubmissionEmail?: Date;
  lastReminderEmail?: Date;
  lastResubmitRequest?: Date;
}

const TeacherDashboard: React.FC<Props> = ({ 
  teacher, 
  teachers, 
  submissions, 
  setSubmissions, 
  allSubmissions, 
  isCloudEnabled, 
  syncUrl, 
  setSyncUrl, 
  onSendWarnings, 
  onSendPdf, 
  onResubmitRequest, 
  resubmitRequests 
}) => {
  const nextWeek = getNextWeekMonday();
  const currentWeek = getCurrentWeekMonday();
  const [view, setView] = useState<'status' | 'form' | 'history'>('status');
  const [isMailing, setIsMailing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [resubmitStatus, setResubmitStatus] = useState<{ requested: boolean; error: string; message?: string }>({ 
    requested: false, 
    error: '' 
  });
  const [emailNotifications, setEmailNotifications] = useState<EmailNotificationStatus>({});
  const [showEmailSuccess, setShowEmailSuccess] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  const saturday = new Date(nextWeek);
  saturday.setDate(saturday.getDate() + 5);
  const saturdayStr = saturday.toISOString().split('T')[0];

  const currentSubmission = submissions.find(s => s.teacherId === teacher.id && s.weekStarting === nextWeek);
  const hasPendingRequest = resubmitRequests.some(r => r.teacherId === teacher.id && r.weekStarting === nextWeek && r.status === 'pending');
  const hasApprovedRequest = resubmitRequests.some(r => r.teacherId === teacher.id && r.weekStarting === nextWeek && r.status === 'approved');

  const myHistory = useMemo(() => {
    return submissions
      .filter(s => s.teacherId === teacher.id)
      .sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime());
  }, [submissions, teacher.id]);

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
    
    const requirements = teachers.flatMap(t => 
      t.assignedClasses
        .filter(ac => ac.classLevel === classLevel && ac.section === section)
        .map(ac => ({
          subject: ac.subject,
          teacherName: t.name,
          teacherId: t.id,
          email: t.email,
          whatsapp: t.whatsapp,
          isSelf: t.id === teacher.id
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
  }, [teacher.isClassTeacher, teachers, allSubmissions, nextWeek, teacher.id]);

  const [formData, setFormData] = useState<Record<string, { chapter: string, topics: string, homework: string }>>({});
  const [dates, setDates] = useState({ from: nextWeek, to: saturdayStr });

  // Load email notification status
  useEffect(() => {
    if (currentSubmission) {
      const emailLog = localStorage.getItem(`sh_email_log_${teacher.id}_${nextWeek}`);
      if (emailLog) {
        setEmailNotifications(prev => ({
          ...prev,
          lastSubmissionEmail: new Date(emailLog)
        }));
      }
    }

    // Load resubmit request email status
    const resubmitLog = localStorage.getItem(`sh_resubmit_request_${teacher.id}_${nextWeek}`);
    if (resubmitLog) {
      setEmailNotifications(prev => ({
        ...prev,
        lastResubmitRequest: new Date(resubmitLog)
      }));
    }

    // Check for pending syncs
    const checkPendingSyncs = () => {
      try {
        const queue = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSIONS_KEY) || '[]');
        const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
        const myPending = [...queue, ...retryQueue].filter(item => 
          item.teacherId === teacher.id || 
          item.teacherEmail === teacher.email
        );
        setPendingSyncCount(myPending.length);
      } catch (error) {
        console.error('Error checking pending syncs:', error);
      }
    };

    checkPendingSyncs();
    const interval = setInterval(checkPendingSyncs, 10000);
    return () => clearInterval(interval);
  }, [teacher.id, teacher.email, currentSubmission, nextWeek]);

  // Initialize form data
  useEffect(() => {
    const initialForm: any = {};
    groupedAssignments.forEach(g => { 
      initialForm[g.id] = { 
        chapter: '', 
        topics: '', 
        homework: '' 
      }; 
    });
    setFormData(initialForm);
  }, [groupedAssignments]);

  // Handle AI content refinement
  const handleRefine = async (groupId: string, field: 'topics' | 'homework') => {
    const val = formData[groupId][field];
    if (!val.trim()) return;
    
    try {
      const refined = await refineSyllabusContent(val, field);
      setFormData(prev => ({ 
        ...prev, 
        [groupId]: { 
          ...prev[groupId], 
          [field]: refined 
        } 
      }));
    } catch (error) {
      console.error('AI refinement error:', error);
      alert('Failed to refine content. Please try again.');
    }
  };

  // Handle form submission with email notification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (currentSubmission && !hasApprovedRequest) {
      alert('You have already submitted for this week. Please request resubmission if needed.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Prepare plans
      const flattenedPlans: ClassPlan[] = [];
      groupedAssignments.forEach(g => {
        const content = formData[g.id];
        g.sections.forEach(sec => {
          flattenedPlans.push({
            classLevel: g.classLevel, 
            section: sec, 
            subject: g.subject,
            chapterName: content.chapter, 
            topics: content.topics, 
            homework: content.homework
          });
        });
      });

      const newSubmission: WeeklySubmission = {
        id: crypto.randomUUID(), 
        teacherId: teacher.id, 
        teacherName: teacher.name, 
        teacherEmail: teacher.email,
        weekStarting: dates.from, 
        plans: flattenedPlans, 
        timestamp: new Date().toISOString()
      };

      // Update submissions
      const filtered = submissions.filter(s => !(s.teacherId === teacher.id && s.weekStarting === nextWeek));
      setSubmissions([...filtered, newSubmission]);
      
      // Store email notification timestamp
      const emailTimestamp = new Date().toISOString();
      localStorage.setItem(`sh_email_log_${teacher.id}_${nextWeek}`, emailTimestamp);
      setEmailNotifications(prev => ({
        ...prev,
        lastSubmissionEmail: new Date(emailTimestamp)
      }));
      
      // Show success message
      setShowEmailSuccess(true);
      setTimeout(() => setShowEmailSuccess(false), 5000);
      
      // Switch to status view
      setView('status');
      
      // Reset form
      const resetForm: any = {};
      groupedAssignments.forEach(g => { 
        resetForm[g.id] = { chapter: '', topics: '', homework: '' }; 
      });
      setFormData(resetForm);
      
    } catch (error) {
      console.error('Submission error:', error);
      alert('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resubmission request with email notification
  const handleRequestResubmitAction = () => {
    if (!confirm('Request resubmission? This will send an email to the administrator for approval.')) {
      return;
    }

    const req: ResubmitRequest = {
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      weekStarting: nextWeek,
      status: 'pending',
      requestedAt: new Date(),
      teacherNotified: false,
      adminNotified: false
    };
    
    onResubmitRequest(req);
    
    // Store resubmit request timestamp
    const requestTimestamp = new Date().toISOString();
    localStorage.setItem(`sh_resubmit_request_${teacher.id}_${nextWeek}`, requestTimestamp);
    setEmailNotifications(prev => ({
      ...prev,
      lastResubmitRequest: new Date(requestTimestamp)
    }));
    
    setResubmitStatus({ 
      requested: true, 
      error: '',
      message: 'Resubmission request sent! You will receive email notifications when processed.'
    });
    
    // Clear message after 5 seconds
    setTimeout(() => {
      setResubmitStatus(prev => ({ ...prev, message: undefined }));
    }, 5000);
  };

  // Send reminders to defaulters
  const handleWarnDefaulters = () => {
    if (!classStatus) return;
    
    const defaulters = classStatus
      .filter(s => !s.submitted && !s.isSelf)
      .map(s => ({ name: s.teacherName, email: s.email }));
    
    if (defaulters.length === 0) {
      alert('All subject teachers have submitted!');
      return;
    }

    if (!confirm(`Send reminder emails to ${defaulters.length} defaulters?`)) {
      return;
    }

    onSendWarnings(defaulters, nextWeek);
    alert(`Reminder emails sent to ${defaulters.length} defaulters.`);
  };

  // Generate and email compiled PDF
  const handleMailCompiled = async () => {
    if (!teacher.isClassTeacher || !classStatus) return;
    
    setIsMailing(true);
    const { classLevel, section } = teacher.isClassTeacher;
    
    try {
      const compiledPlans: Submission[] = classStatus.map(req => {
        const teacherSub = allSubmissions.find(s => s.teacherId === req.teacherId && s.weekStarting === nextWeek);
        const plan = teacherSub?.plans.find(p => 
          p.classLevel === classLevel && 
          p.section === section && 
          p.subject === req.subject
        );
        
        return {
          subject: req.subject, 
          teacherName: req.teacherName,
          chapterName: plan?.chapterName || 'NOT SUBMITTED',
          topics: plan?.topics || 'Lesson plan not submitted yet.',
          homework: plan?.homework || 'Will be assigned after submission.',
          classLevel, 
          section
        };
      });
      
      const doc = generateSyllabusPDF(
        compiledPlans, 
        { 
          name: teacher.name, 
          email: teacher.email, 
          classLevel, 
          section 
        }, 
        dates.from, 
        dates.to
      );
      
      const pdfBase64 = doc.output('datauristring');
      await onSendPdf(
        pdfBase64, 
        teacher.email, 
        `${classLevel}-${section}`, 
        `Weekly_Plan_${classLevel}${section}_${nextWeek.replace(/-/g, '')}.pdf`
      );
      
      alert('Compiled PDF has been emailed to you!');
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsMailing(false);
    }
  };

  // Share status via WhatsApp
  const handleWhatsAppShare = () => {
    if (!teacher.isClassTeacher || !classStatus) return;
    
    const { classLevel, section } = teacher.isClassTeacher;
    const pendingCount = classStatus.filter(s => !s.submitted && !s.isSelf).length;
    const totalCount = classStatus.length - 1; // Exclude self
    
    let message = `*Class ${classLevel}-${section} Syllabus Status*\n`;
    message += `Week: ${nextWeek}\n`;
    message += `Submitted: ${totalCount - pendingCount}/${totalCount}\n`;
    message += `Pending: ${pendingCount}\n\n`;
    
    if (pendingCount > 0) {
      const pendingTeachers = classStatus
        .filter(s => !s.submitted && !s.isSelf)
        .map(s => s.teacherName)
        .join(', ');
      message += `Awaiting: ${pendingTeachers}\n\n`;
    }
    
    message += `Submit here: ${PORTAL_LINK}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Sync pending submissions
  const handleSyncPending = () => {
    alert('Pending syncs will be processed automatically. You can continue working.');
  };

  // Get formatted date range
  const getFormattedDateRange = () => {
    const start = new Date(dates.from);
    const end = new Date(dates.to);
    return `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Email Success Notification */}
      {showEmailSuccess && (
        <div className="animate-in slide-in-from-top fade-in duration-300">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                  <i className="fas fa-check text-emerald-600"></i>
                </div>
                <div>
                  <p className="font-bold text-emerald-800 text-sm">Submission Successful!</p>
                  <p className="text-emerald-600 text-xs">
                    Confirmation email sent to <span className="font-semibold">{teacher.email}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowEmailSuccess(false)} 
                className="text-emerald-500 hover:text-emerald-700"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resubmit Status Notification */}
      {resubmitStatus.message && (
        <div className="animate-in slide-in-from-top fade-in duration-300">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <i className="fas fa-envelope text-blue-600"></i>
              </div>
              <div>
                <p className="font-bold text-blue-800 text-sm">{resubmitStatus.message}</p>
                <p className="text-blue-600 text-xs">Check your email for updates on approval status.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Sync Notification */}
      {pendingSyncCount > 0 && (
        <div className="animate-in slide-in-from-top fade-in duration-300">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <i className="fas fa-sync-alt text-amber-600"></i>
                </div>
                <div>
                  <p className="font-bold text-amber-800 text-sm">{pendingSyncCount} pending sync{pendingSyncCount !== 1 ? 's' : ''}</p>
                  <p className="text-amber-600 text-xs">
                    Your submission{pendingSyncCount !== 1 ? 's are' : ' is'} queued for cloud sync
                  </p>
                </div>
              </div>
              <button 
                onClick={handleSyncPending}
                className="text-amber-600 hover:text-amber-800 text-xs font-bold"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center space-x-5 w-full md:w-auto">
          <div className="relative">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl md:text-3xl shadow-xl shadow-blue-100">
              <i className="fas fa-user-tie"></i>
            </div>
            {emailNotifications.lastSubmissionEmail && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white animate-pulse"></div>
            )}
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">{teacher.name}</h2>
            <div className="flex items-center flex-wrap gap-2 mt-1">
              <span className="text-[10px] md:text-xs font-bold text-gray-400">{teacher.email}</span>
              {emailNotifications.lastSubmissionEmail && (
                <span className="text-[8px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                  <i className="fas fa-envelope mr-1"></i> Email confirmed
                </span>
              )}
              {!isCloudEnabled && (
                <span className="text-[8px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                  <i className="fas fa-wifi-slash mr-1"></i> Offline mode
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap justify-center w-full md:w-auto">
          <button 
            onClick={() => setView('status')} 
            className={`flex-1 md:flex-none px-4 md:px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${view === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setView('form')} 
            className={`flex-1 md:flex-none px-4 md:px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${view === 'form' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
            disabled={currentSubmission && !hasApprovedRequest}
          >
            {currentSubmission && !hasApprovedRequest ? 'Submitted' : 'New Plan'}
          </button>
          <button 
            onClick={() => setView('history')} 
            className={`flex-1 md:flex-none px-4 md:px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${view === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            History
          </button>
        </div>
      </div>

      {/* Main Content Views */}
      {view === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Class Monitor Card */}
            {teacher.isClassTeacher && classStatus && (
              <div className="bg-white rounded-[3rem] p-6 md:p-10 shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">
                      Class Monitor: {teacher.isClassTeacher.classLevel}-{teacher.isClassTeacher.section}
                    </h3>
                    <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">
                      Week of {nextWeek} • {getFormattedDateRange()}
                    </p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button 
                      onClick={handleMailCompiled} 
                      disabled={isMailing}
                      className="flex-1 md:flex-none bg-gray-900 text-white px-4 py-3 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                      {isMailing ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-file-pdf"></i>
                          <span>Email PDF</span>
                        </>
                      )}
                    </button>
                    <button 
                      onClick={handleWhatsAppShare} 
                      className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-3 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                    >
                      <i className="fab fa-whatsapp"></i> 
                      <span>Share Status</span>
                    </button>
                  </div>
                </div>

                {/* Subjects Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {classStatus.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-2xl border flex items-center justify-between ${
                        item.submitted ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50/50 border-blue-100'
                      }`}
                    >
                      <div>
                        <p className={`text-[11px] font-black ${item.submitted ? 'text-emerald-800' : 'text-blue-800'}`}>
                          {item.subject}
                        </p>
                        <p className={`text-[9px] font-bold ${item.submitted ? 'text-emerald-600/70' : 'text-blue-600/70'}`}>
                          {item.teacherName}
                          {item.isSelf && ' (You)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!item.submitted && !item.isSelf && (
                          <button 
                            onClick={() => window.open(getWhatsAppLink(item.whatsapp, `Reminder: ${item.subject} plan for Class ${teacher.isClassTeacher!.classLevel}-${teacher.isClassTeacher!.section} is pending.`) || '', '_blank')} 
                            className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                          >
                            <i className="fab fa-whatsapp"></i>
                          </button>
                        )}
                        {item.submitted ? (
                          <i className="fas fa-check-circle text-emerald-500 text-lg"></i>
                        ) : (
                          <i className="fas fa-exclamation-triangle text-blue-400 animate-pulse text-lg"></i>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Reminder Button */}
                <div className="mt-8">
                  <button 
                    onClick={handleWarnDefaulters}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:shadow-xl transition-all"
                  >
                    Send Email Reminders to Pending Teachers
                  </button>
                </div>
              </div>
            )}

            {/* My Assignments Card */}
            <div className="bg-white rounded-[3rem] p-8 md:p-10 shadow-sm border border-gray-100">
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-8 tracking-tight">
                My Teaching Assignments
              </h3>
              <div className="space-y-4">
                {groupedAssignments.map(g => {
                  const isDone = currentSubmission?.plans.some(p => 
                    p.subject === g.subject && 
                    p.classLevel === g.classLevel
                  );
                  
                  return (
                    <div 
                      key={g.id} 
                      className="p-5 md:p-6 rounded-[2rem] bg-gray-50 border border-gray-100 flex items-center justify-between hover:border-blue-100 transition-all"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                          CLASS_STYLES[g.classLevel]?.bg || 'bg-blue-600'
                        }`}>
                          <i className="fas fa-graduation-cap text-sm"></i>
                        </div>
                        <div>
                          <p className="font-black text-gray-800 text-sm md:text-base">
                            {g.subject}
                          </p>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                            Class {g.classLevel} • Sections: {g.sections.join(', ')}
                          </p>
                        </div>
                      </div>
                      {isDone ? (
                        <span className="text-emerald-600 font-black text-[9px] uppercase flex items-center gap-1">
                          <i className="fas fa-check-circle"></i> 
                          {emailNotifications.lastSubmissionEmail ? 'Submitted & Emailed' : 'Submitted'}
                        </span>
                      ) : (
                        <button 
                          onClick={() => setView('form')}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg transition-all"
                        >
                          Fill Plan
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-8">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
              <h3 className="text-lg font-black text-gray-800 mb-6">This Week's Status</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Your Submission</span>
                  <span className={`text-sm font-bold ${currentSubmission ? 'text-emerald-600' : 'text-blue-600'}`}>
                    {currentSubmission ? 'Submitted ✓' : 'Pending'}
                  </span>
                </div>
                
                {currentSubmission && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Email Confirmation</span>
                      <span className="text-sm font-bold text-emerald-600">
                        {emailNotifications.lastSubmissionEmail ? 'Sent ✓' : 'Queued'}
                      </span>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Submission Time</p>
                      <p className="text-sm font-bold">
                        {new Date(currentSubmission.timestamp).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </p>
                    </div>
                  </>
                )}

                {teacher.isClassTeacher && classStatus && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Class Completion</p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-bold text-emerald-600">
                          {classStatus.filter(s => s.submitted).length}
                        </span>
                        <span className="text-gray-400"> of {classStatus.length}</span>
                      </div>
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{
                            width: `${(classStatus.filter(s => s.submitted).length / classStatus.length) * 100}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-[2.5rem] p-8 border border-blue-100">
              <h3 className="text-lg font-black text-gray-800 mb-6">Quick Actions</h3>
              
              <div className="space-y-4">
                {currentSubmission && !hasApprovedRequest && (
                  <button
                    onClick={handleRequestResubmitAction}
                    className="w-full bg-white text-gray-800 py-3 rounded-xl text-xs font-bold border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-redo-alt text-blue-600"></i>
                    Request Resubmission
                  </button>
                )}
                
                {currentSubmission && (
                  <button
                    onClick={() => {
                      const submissionElement = document.getElementById('currentSubmission');
                      if (submissionElement) {
                        submissionElement.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="w-full bg-white text-gray-800 py-3 rounded-xl text-xs font-bold border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-eye text-blue-600"></i>
                    View Submission
                  </button>
                )}
                
                <button
                  onClick={() => window.open(PORTAL_LINK, '_blank')}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <i className="fas fa-external-link-alt"></i>
                  Open Portal in New Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          {currentSubmission && !hasApprovedRequest ? (
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border-4 border-amber-100 text-center space-y-8">
              <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto text-4xl">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-gray-800">Plan Already Submitted</h3>
                <p className="text-gray-500 font-medium max-w-md mx-auto leading-relaxed">
                  Your lesson plan for <b>{getFormattedDateRange()}</b> has already been submitted. 
                  The system allows only one submission per week to maintain academic record integrity.
                </p>
                <p className="text-sm text-red-500 font-bold uppercase tracking-widest">
                  To modify your submission, request administrative approval below.
                </p>
              </div>
              
              <div className="pt-6 space-y-4">
                {hasPendingRequest || resubmitStatus.requested ? (
                  <div className="bg-blue-50 text-blue-600 p-6 rounded-3xl font-black uppercase tracking-widest text-xs border border-blue-100">
                    <i className="fas fa-clock mr-2"></i> Request Pending Admin Approval
                    <p className="text-xs text-blue-500 mt-2 font-normal normal-case">
                      You will receive email notifications when your request is processed.
                    </p>
                  </div>
                ) : (
                  <button 
                    onClick={handleRequestResubmitAction}
                    className="bg-gradient-to-r from-gray-900 to-black text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:shadow-2xl transition-all shadow-xl flex items-center justify-center gap-3 mx-auto"
                  >
                    <i className="fas fa-envelope"></i> 
                    Request Permission to Resubmit
                  </button>
                )}
                
                <button 
                  onClick={() => setView('status')}
                  className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                >
                  <i className="fas fa-arrow-left mr-2"></i> Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-8 md:p-12 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-2xl md:text-3xl font-black tracking-tight">Weekly Lesson Plan</h3>
                  <p className="text-blue-200 text-xs mt-2">
                    Confirmation email will be sent to <span className="font-bold">{teacher.email}</span>
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setView('status')}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="p-6 md:p-12 space-y-12">
                {/* Date Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      Week Starting (Monday)
                    </label>
                    <input 
                      type="date" 
                      required 
                      className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold" 
                      value={dates.from} 
                      onChange={e => setDates({...dates, from: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      Week Ending (Saturday)
                    </label>
                    <input 
                      type="date" 
                      required 
                      className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold" 
                      value={dates.to} 
                      onChange={e => setDates({...dates, to: e.target.value})} 
                    />
                  </div>
                </div>

                {/* Email Notification Banner */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <i className="fas fa-envelope text-blue-600"></i>
                    </div>
                    <div>
                      <p className="font-bold text-blue-800 text-sm">Email Confirmation</p>
                      <p className="text-blue-600 text-xs">
                        A professional confirmation email will be sent to <strong>{teacher.email}</strong> upon submission.
                        This email serves as official proof of your weekly lesson plan submission.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subject Forms */}
                <div className="space-y-10">
                  {groupedAssignments.map((g) => (
                    <div key={g.id} className="pl-4 md:pl-10 border-l-4 border-blue-500 space-y-6">
                      <h4 className="text-xl md:text-2xl font-black text-gray-800">
                        {g.subject} 
                        <span className="text-xs text-gray-400 ml-2">
                          (Class {g.classLevel}, Sections: {g.sections.join(', ')})
                        </span>
                      </h4>
                      
                      <div className="space-y-5">
                        <input 
                          required 
                          type="text" 
                          className="w-full px-6 py-4 rounded-xl bg-gray-50 border-gray-100 border outline-none font-bold text-sm" 
                          placeholder="Chapter Name / Unit Title" 
                          value={formData[g.id]?.chapter || ''} 
                          onChange={e => setFormData({ 
                            ...formData, 
                            [g.id]: { ...formData[g.id], chapter: e.target.value } 
                          })} 
                        />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Topics Column */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                Topics & Sub-Topics
                              </label>
                              <button 
                                type="button" 
                                onClick={() => handleRefine(g.id, 'topics')}
                                className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase hover:bg-blue-100 transition-colors"
                              >
                                <i className="fas fa-magic mr-1"></i> AI Refine
                              </button>
                            </div>
                            <textarea 
                              required 
                              rows={4} 
                              className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-gray-100 border outline-none text-xs font-medium resize-none" 
                              placeholder="List the topics and sub-topics to be covered this week..."
                              value={formData[g.id]?.topics || ''} 
                              onChange={e => setFormData({ 
                                ...formData, 
                                [g.id]: { ...formData[g.id], topics: e.target.value } 
                              })} 
                            />
                          </div>
                          
                          {/* Homework Column */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                Homework / Assignments
                              </label>
                              <button 
                                type="button" 
                                onClick={() => handleRefine(g.id, 'homework')}
                                className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase hover:bg-blue-100 transition-colors"
                              >
                                <i className="fas fa-magic mr-1"></i> AI Refine
                              </button>
                            </div>
                            <textarea 
                              required 
                              rows={4} 
                              className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-gray-100 border outline-none text-xs font-medium resize-none" 
                              placeholder="Homework assignments, projects, or practice work..."
                              value={formData[g.id]?.homework || ''} 
                              onChange={e => setFormData({ 
                                ...formData, 
                                [g.id]: { ...formData[g.id], homework: e.target.value } 
                              })} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Submit Button */}
                <button 
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-6 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-4 hover:shadow-2xl transition-all disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Processing Submission...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane"></i>
                      <span>Submit & Send Email Confirmation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {view === 'history' && (
        <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-sm border border-gray-100 animate-in slide-in-from-right-4">
          <h3 className="text-2xl md:text-3xl font-black text-gray-800 mb-10 tracking-tight">
            Submission History
          </h3>
           
          {myHistory.length > 0 ? (
            <div className="space-y-6">
              {myHistory.map(h => {
                const emailSent = localStorage.getItem(`sh_email_log_${teacher.id}_${h.weekStarting}`);
                const weekEnd = new Date(h.weekStarting);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const dateRange = `${new Date(h.weekStarting).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${weekEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
                
                return (
                  <div key={h.id} className="bg-gray-50 rounded-[2.5rem] border border-gray-100 overflow-hidden">
                    <button 
                      onClick={() => setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)}
                      className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-white transition-colors text-left"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-xl">
                          <i className="fas fa-calendar-alt"></i>
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-base md:text-lg">
                            Week of {dateRange}
                          </p>
                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Submitted: {new Date(h.timestamp).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </p>
                            {emailSent && (
                              <span className="text-[8px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                                <i className="fas fa-envelope mr-1"></i> Email confirmed
                              </span>
                            )}
                            <span className="text-[8px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                              {h.plans.length} plan{h.plans.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <i className={`fas fa-chevron-${expandedHistoryId === h.id ? 'up' : 'down'} text-gray-300 text-lg`}></i>
                    </button>
                    
                    {expandedHistoryId === h.id && (
                      <div className="px-8 pb-10 pt-4 space-y-8 animate-in slide-in-from-top-4">
                        {h.plans.map((p, idx) => (
                          <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 shadow-sm">
                            <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                              <div>
                                <h4 className="font-black text-gray-800">
                                  {p.subject} 
                                  <span className="text-blue-500 ml-2">{p.classLevel}-{p.section}</span>
                                </h4>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  Chapter: {p.chapterName}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase">
                                Week {h.weekStarting}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                  Topics Covered
                                </p>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">
                                  {p.topics}
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                  Homework Assigned
                                </p>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">
                                  {p.homework}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <i className="fas fa-history text-gray-300 text-4xl"></i>
              </div>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">
                No past submissions found
              </p>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Your submission history will appear here once you submit your first lesson plan.
              </p>
              <button 
                onClick={() => setView('form')}
                className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                <i className="fas fa-plus mr-2"></i> Create First Submission
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;

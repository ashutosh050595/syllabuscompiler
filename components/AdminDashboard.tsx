import React, { useState, useMemo, useEffect } from 'react';
import { Teacher, WeeklySubmission, ClassLevel, Section, AssignedClass, ResubmitRequest } from '../types';
import { getNextWeekMonday, getWhatsAppLink, ALL_CLASSES, ALL_SECTIONS, OFFLINE_SUBMISSIONS_KEY, SUBMISSION_RETRY_KEY } from '../constants';

interface Props {
  teachers: Teacher[];
  submissions: WeeklySubmission[];
  resubmitRequests: ResubmitRequest[];
  onApproveResubmit: (id: string) => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  onSendWarnings: (defaulters: {name: string, email: string}[], weekStarting: string) => Promise<any>;
  onForceReset?: (teacherId: string, week: string) => Promise<void>;
  onForceSyncAll?: () => Promise<void>;
  onRefreshData?: () => Promise<boolean>;
  lastSync: Date | null;
}

const AdminDashboard: React.FC<Props> = ({ 
  teachers, 
  submissions, 
  resubmitRequests, 
  onApproveResubmit, 
  syncUrl, 
  setSyncUrl, 
  onSendWarnings, 
  onForceReset, 
  onForceSyncAll, 
  onRefreshData, 
  lastSync 
}) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'requests' | 'settings'>('monitor');
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
      // Make sure assignedClasses exists and is an array
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

  useEffect(() => {
    const checkUnsynced = () => {
      try {
        const queue = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSIONS_KEY) || '[]');
        const retryQueue = JSON.parse(localStorage.getItem(SUBMISSION_RETRY_KEY) || '[]');
        setPendingSyncs([...queue, ...retryQueue]);
      } catch (error) {
        console.error('Error checking unsynced data:', error);
      }
    };
    
    checkUnsynced();
    const interval = setInterval(checkUnsynced, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    if (!onRefreshData) return;
    setIsRefreshing(true);
    try {
      await onRefreshData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Admin Header */}
      <div className="bg-white rounded-2xl p-6 shadow border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <p className="text-gray-500 text-sm">
                {lastSync ? `Last Sync: ${lastSync.toLocaleTimeString()}` : 'Connecting...'}
              </p>
              <button 
                onClick={handleManualRefresh} 
                disabled={isRefreshing} 
                className="ml-4 text-sm text-blue-600 hover:underline disabled:opacity-50"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="bg-blue-50 px-4 py-2 rounded-lg text-center">
              <p className="text-xs text-blue-600 font-semibold">Submissions</p>
              <p className="text-lg font-bold text-blue-700">{submittedTeachers.length} / {teachers.length}</p>
            </div>
            {pendingRequests.length > 0 && (
              <button 
                onClick={() => setActiveTab('requests')}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold text-sm"
              >
                {pendingRequests.length} Pending
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {['monitor', 'requests', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'monitor' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Pending Faculty ({missingTeachers.length})
                </h3>
                
                {missingTeachers.length === 0 ? (
                  <div className="text-center py-8 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-green-600 font-semibold">All faculty have submitted!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(defaultersByClass).map(([className, teachersList]) => (
                      <div key={className} className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Class {className}</h4>
                        <div className="space-y-2">
                          {teachersList.map(teacher => (
                            <div key={teacher.id} className="flex justify-between items-center text-sm">
                              <span>{teacher.name}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => window.open(getWhatsAppLink(teacher.whatsapp, `Reminder for ${className}: Syllabus is pending.`) || '', '_blank')}
                                  className="text-green-600 hover:text-green-800"
                                >
                                  WhatsApp
                                </button>
                                <button
                                  onClick={() => onSendWarnings([{name: teacher.name, email: teacher.email}], nextWeek)}
                                  className="text-blue-600 hover:text-blue-800"
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
                )}
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Submitted This Week</h3>
                {submittedTeachers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No submissions yet</p>
                ) : (
                  <div className="space-y-3">
                    {submittedTeachers.map(sub => (
                      <div key={sub.id} className="bg-green-50 p-4 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-900">{sub.teacherName}</p>
                          <p className="text-xs text-green-600">
                            {new Date(sub.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {onForceReset && (
                          <button
                            onClick={() => onForceReset(sub.teacherId, nextWeek)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingSyncs.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h4 className="font-semibold text-yellow-800 mb-2">
                    Pending Syncs ({pendingSyncs.length})
                  </h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    Data waiting to be synced to the server.
                  </p>
                  {onForceSyncAll && (
                    <button
                      onClick={onForceSyncAll}
                      className="bg-yellow-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-yellow-700"
                    >
                      Sync Now
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-gray-800">Resubmit Requests</h3>
              {pendingRequests.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending requests</p>
              ) : (
                pendingRequests.map(req => (
                  <div key={req.id} className="bg-yellow-50 p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-900">{req.teacherName}</p>
                      <p className="text-sm text-yellow-700">Week: {req.weekStarting}</p>
                    </div>
                    <button
                      onClick={() => onApproveResubmit(req.id)}
                      className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sync URL
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                  placeholder="Enter Google Apps Script URL"
                />
              </div>
              
              <div className="space-y-3">
                {onForceSyncAll && (
                  <button
                    onClick={onForceSyncAll}
                    className="w-full bg-blue-600 text-white px-4 py-3 rounded font-semibold hover:bg-blue-700"
                  >
                    Force Sync All Data
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

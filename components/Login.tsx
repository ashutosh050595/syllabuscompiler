
import React, { useState } from 'react';
import { Teacher } from '../types';
import { ADMIN_EMAIL, SCHOOL_LOGO_URL, SCHOOL_NAME } from '../constants';

interface Props {
  onLogin: (user: Teacher | { email: string; isAdmin: true }) => void;
  teachers: Teacher[];
  onSyncRegistry: (url: string) => Promise<boolean>;
}

const Login: React.FC<Props> = ({ onLogin, teachers, onSyncRegistry }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [error, setError] = useState('');
  const [syncUrlInput, setSyncUrlInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncSetup, setShowSyncSetup] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();

    if (isAdminMode) {
      if (cleanEmail === ADMIN_EMAIL.toLowerCase() && password === 'shadmin2024') {
        onLogin({ email: cleanEmail, isAdmin: true });
      } else {
        setError('Invalid Admin credentials.');
      }
    } else {
      const teacher = teachers.find(t => t.email.toLowerCase() === cleanEmail);
      if (teacher) {
        onLogin(teacher);
      } else {
        setError('Teacher email not found. If you registered on another device, use the "Link Device" option below.');
      }
    }
  };

  const handleCloudSync = async () => {
    if (!syncUrlInput) return;
    setIsSyncing(true);
    setError('');
    const success = await onSyncRegistry(syncUrlInput);
    if (success) {
      setShowSyncSetup(false);
      alert("Device successfully linked! You can now log in.");
    } else {
      setError("Failed to fetch registry. Ensure the URL is correct and script is deployed.");
    }
    setIsSyncing(false);
  };

  return (
    <div className="max-w-md mx-auto mt-10 md:mt-20 px-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-8 md:p-12 text-center text-white relative">
          <div className="absolute top-6 right-6">
             <button 
              type="button"
              onClick={() => { setIsAdminMode(!isAdminMode); setError(''); }}
              className="text-[9px] uppercase font-black tracking-widest bg-white/20 px-4 py-1.5 rounded-full hover:bg-white/30 transition-colors"
             >
               {isAdminMode ? 'Teacher Mode' : 'Admin Mode'}
             </button>
          </div>
          <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-2xl transform rotate-3 overflow-hidden p-4">
            {imgError ? (
              <div className="text-blue-600 flex flex-col items-center">
                <i className="fas fa-school text-3xl"></i>
                <span className="text-[8px] font-black mt-1 uppercase">SHS</span>
              </div>
            ) : (
              <img src={SCHOOL_LOGO_URL} alt="Logo" className="w-full h-full object-contain" onError={() => setImgError(true)} />
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">{isAdminMode ? 'Admin Portal' : 'Faculty Login'}</h2>
          <p className="text-blue-100 mt-2 opacity-90 text-xs font-medium">Sacred Heart Academic Management</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 md:p-12 space-y-6 md:space-y-8">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-xs rounded-2xl flex items-center space-x-3">
              <i className="fas fa-triangle-exclamation"></i>
              <span className="font-bold">{error}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Verified Email</label>
              <div className="relative group">
                <i className="fas fa-at absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                <input
                  type="email"
                  required
                  className="w-full pl-14 pr-6 py-4 md:py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
                  placeholder="e.g. teacher@shs.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {isAdminMode && (
              <div className="animate-in slide-in-from-top-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Passphrase</label>
                <div className="relative group">
                  <i className="fas fa-key absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                  <input
                    type="password"
                    required
                    className="w-full pl-14 pr-6 py-4 md:py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 md:py-5 px-8 rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center space-x-3 text-base md:text-lg"
          >
            <span>{isAdminMode ? 'Authenticate' : 'Enter Dashboard'}</span>
            <i className="fas fa-chevron-right text-sm"></i>
          </button>

          {!isAdminMode && (
            <div className="pt-4 border-t border-gray-50 text-center">
              <button 
                type="button" 
                onClick={() => setShowSyncSetup(!showSyncSetup)}
                className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline"
              >
                {showSyncSetup ? 'Hide Link Settings' : 'Link Mobile Device to Cloud'}
              </button>
              
              {showSyncSetup && (
                <div className="mt-4 p-4 bg-blue-50 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
                  <p className="text-[9px] text-blue-600 font-bold uppercase">Paste Deployment URL to pull Registry</p>
                  <input 
                    type="url"
                    placeholder="https://script.google.com/..."
                    className="w-full px-4 py-3 rounded-xl text-xs font-bold border border-blue-200 outline-none"
                    value={syncUrlInput}
                    onChange={e => setSyncUrlInput(e.target.value)}
                  />
                  <button 
                    type="button"
                    disabled={isSyncing}
                    onClick={handleCloudSync}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Registry Now'}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Login;


import React, { useState } from 'react';
import { Teacher } from '../types';
import { ADMIN_EMAIL, SCHOOL_LOGO_URL, SCHOOL_NAME } from '../constants';

interface Props {
  onLogin: (user: Teacher | { email: string; isAdmin: true }) => void;
  teachers: Teacher[];
  onSyncRegistry: (url: string) => Promise<boolean>;
  syncUrl: string;
}

const Login: React.FC<Props> = ({ onLogin, teachers, onSyncRegistry, syncUrl }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();

    if (isAdminMode) {
      if (cleanEmail === ADMIN_EMAIL.toLowerCase() && password === 'shadmin2024') {
        onLogin({ email: cleanEmail, isAdmin: true });
      } else {
        setError('Invalid Admin credentials.');
      }
      return;
    }

    // Attempt to find teacher locally
    let teacher = teachers.find(t => t.email.toLowerCase() === cleanEmail);
    
    if (teacher) {
      onLogin(teacher);
    } else {
      // If not found, attempt invisible cloud verify
      if (syncUrl) {
        setIsVerifying(true);
        try {
          const success = await onSyncRegistry(syncUrl);
          if (success) {
            const freshRegistry = JSON.parse(localStorage.getItem('sh_teachers_v4') || '[]');
            const freshTeacher = freshRegistry.find((t: any) => t.email.toLowerCase() === cleanEmail);
            
            if (freshTeacher) {
              onLogin(freshTeacher);
              return;
            }
          }
          setError('Email not found in school records. Please check for typos.');
        } catch (err) {
          setError('Verification service unavailable. Please try again later.');
        } finally {
          setIsVerifying(false);
        }
      } else {
        setError('Teacher email not found. Contact administrator to activate portal.');
      }
    }
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
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-xs rounded-2xl flex items-center space-x-3 animate-in shake-in-1">
              <i className="fas fa-triangle-exclamation"></i>
              <span className="font-bold">{error}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Official Email Address</label>
              <div className="relative group">
                <i className="fas fa-at absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                <input
                  type="email"
                  required
                  disabled={isVerifying}
                  className="w-full pl-14 pr-6 py-4 md:py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-gray-700 disabled:opacity-50"
                  placeholder="teacher@shs.com"
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
            disabled={isVerifying}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 md:py-5 px-8 rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center space-x-3 text-base md:text-lg disabled:bg-blue-400"
          >
            {isVerifying ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                <span>Verifying with School Cloud...</span>
              </>
            ) : (
              <>
                <span>{isAdminMode ? 'Authenticate' : 'Enter Dashboard'}</span>
                <i className="fas fa-chevron-right text-sm"></i>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

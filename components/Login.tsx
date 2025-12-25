
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

    // Attempt to find teacher
    let teacher = teachers.find(t => t.email.toLowerCase() === cleanEmail);
    
    if (teacher) {
      onLogin(teacher);
    } else {
      // If not found, attempt cloud verify
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
          setError('Email ID not found in current registry. Contact Admin to register your email.');
        } catch (err) {
          setError('Verification service unavailable. Try again.');
        } finally {
          setIsVerifying(false);
        }
      } else {
        setError('Teacher email not found. Contact administrator to activate portal.');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 px-4">
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-12 text-center text-white relative">
          <div className="absolute top-8 right-8">
             <button 
              type="button"
              onClick={() => { setIsAdminMode(!isAdminMode); setError(''); }}
              className="text-[9px] uppercase font-black tracking-widest bg-white/20 px-4 py-2 rounded-full hover:bg-white/30 transition-all"
             >
               {isAdminMode ? 'Teacher Mode' : 'Admin Mode'}
             </button>
          </div>
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl p-4">
            <img src={SCHOOL_LOGO_URL} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-3xl font-black tracking-tight">{isAdminMode ? 'Admin Portal' : 'Faculty Portal'}</h2>
          <p className="text-blue-100 mt-2 opacity-90 text-[10px] font-black uppercase tracking-widest">Sacred Heart School</p>
        </div>

        <form onSubmit={handleLogin} className="p-12 space-y-8">
          {error && (
            <div className="p-5 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase rounded-2xl flex items-center space-x-3 animate-bounce">
              <i className="fas fa-triangle-exclamation text-lg"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Official Email ID</label>
              <div className="relative group">
                <i className="fas fa-at absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-blue-500 transition-colors"></i>
                <input
                  type="email" required disabled={isVerifying}
                  className="w-full pl-14 pr-6 py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white outline-none transition-all font-bold text-gray-700"
                  placeholder="teacher@shs.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {isAdminMode && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Secret Passphrase</label>
                <div className="relative group">
                  <i className="fas fa-key absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-blue-500 transition-colors"></i>
                  <input
                    type="password" required
                    className="w-full pl-14 pr-6 py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white outline-none transition-all font-bold text-gray-700"
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit" disabled={isVerifying}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-8 rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center space-x-3 text-lg"
          >
            {isVerifying ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                <span className="text-sm">Verifying Registry...</span>
              </>
            ) : (
              <>
                <span>Enter Portal</span>
                <i className="fas fa-chevron-right text-sm"></i>
              </>
            )}
          </button>
          
          {!isAdminMode && (
            <p className="text-center text-[9px] text-gray-300 font-bold uppercase tracking-widest leading-relaxed">
              Facing Login Issues? Contact Admin to Update Registry.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default Login;

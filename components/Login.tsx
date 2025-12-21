
import React, { useState } from 'react';
import { Teacher } from '../types';
import { ADMIN_EMAIL, SCHOOL_LOGO_URL, SCHOOL_NAME } from '../constants';

interface Props {
  onLogin: (user: Teacher | { email: string; isAdmin: true }) => void;
  teachers: Teacher[];
}

const Login: React.FC<Props> = ({ onLogin, teachers }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [error, setError] = useState('');
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
        setError('Teacher email not found. Please ensure you are registered.');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-12 text-center text-white relative">
          <div className="absolute top-6 right-6">
             <button 
              type="button"
              onClick={() => { setIsAdminMode(!isAdminMode); setError(''); }}
              className="text-[9px] uppercase font-black tracking-widest bg-white/20 px-4 py-1.5 rounded-full hover:bg-white/30 transition-colors"
             >
               {isAdminMode ? 'Switch to Teacher' : 'Switch to Admin'}
             </button>
          </div>
          <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl transform rotate-6 animate-in zoom-in duration-500 overflow-hidden p-4">
            {imgError ? (
              <div className="text-blue-600 flex flex-col items-center">
                <i className="fas fa-school text-4xl"></i>
                <span className="text-[8px] font-black mt-1 uppercase">SHS</span>
              </div>
            ) : (
              <img 
                src={SCHOOL_LOGO_URL} 
                alt="School Logo" 
                className="w-full h-full object-contain" 
                onError={() => setImgError(true)}
              />
            )}
          </div>
          <h2 className="text-3xl font-black tracking-tight">{isAdminMode ? 'Admin Portal' : 'Faculty Login'}</h2>
          <p className="text-blue-100 mt-3 opacity-90 text-sm font-medium">Sacred Heart Academic Management</p>
        </div>

        <form onSubmit={handleLogin} className="p-12 space-y-8">
          {error && (
            <div className="p-5 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl flex items-center space-x-3 animate-pulse">
              <i className="fas fa-triangle-exclamation"></i>
              <span className="font-bold">{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Verified Email</label>
              <div className="relative group">
                <i className="fas fa-at absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                <input
                  type="email"
                  required
                  className="w-full pl-14 pr-6 py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
                  placeholder="e.g. teacher@sacredheartkoderma.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {isAdminMode && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Access Passphrase</label>
                <div className="relative group">
                  <i className="fas fa-key absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                  <input
                    type="password"
                    required
                    className="w-full pl-14 pr-6 py-5 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-8 rounded-2xl shadow-2xl shadow-blue-200 transform active:scale-95 transition-all flex items-center justify-center space-x-4 text-lg"
          >
            <span>{isAdminMode ? 'Authenticate' : 'Enter Dashboard'}</span>
            <i className="fas fa-chevron-right text-sm"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
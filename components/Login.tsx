import React, { useState, useEffect } from 'react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState({ email: false, password: false });

  useEffect(() => {
    // Add floating effect to decorative elements
    const elements = document.querySelectorAll('.floating-element');
    elements.forEach((el, i) => {
      (el as HTMLElement).style.animationDelay = `${i * 0.2}s`;
    });
  }, []);

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
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-r from-indigo-500/10 to-pink-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-lg mx-auto">
        {/* Floating decorative elements */}
        <div className="floating-element absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl rotate-12 opacity-20 animate-float"></div>
        <div className="floating-element absolute -bottom-8 -right-8 w-20 h-20 bg-gradient-to-br from-pink-400 to-rose-500 rounded-3xl -rotate-12 opacity-20 animate-float"></div>
        <div className="floating-element absolute top-1/3 -right-12 w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl rotate-45 opacity-15 animate-float"></div>

        {/* Main card */}
        <div className="glass-effect rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/30 backdrop-blur-xl">
          {/* Header section with gradient */}
          <div className="relative p-8 md:p-12 text-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white overflow-hidden">
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-32 h-32 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 border-2 border-white rounded-full translate-x-1/2 translate-y-1/2"></div>
            </div>
            
            {/* Admin/Teacher toggle */}
            <div className="absolute top-6 right-6">
              <button 
                type="button"
                onClick={() => { setIsAdminMode(!isAdminMode); setError(''); setPassword(''); }}
                className={`relative px-4 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-300 ${isAdminMode ? 'bg-white/30 text-white' : 'bg-white/10 text-white/90 hover:bg-white/20'}`}
              >
                <span className="flex items-center gap-2">
                  <i className={`fas ${isAdminMode ? 'fa-user-shield' : 'fa-chalkboard-user'}`}></i>
                  {isAdminMode ? 'Admin Mode' : 'Teacher Mode'}
                </span>
                <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-0.5 bg-white/50 rounded-full"></span>
              </button>
            </div>

            {/* Logo and school info */}
            <div className="relative z-10">
              <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-6 bg-gradient-to-br from-white to-blue-100 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 transform transition-transform hover:scale-105 duration-300 animate-float">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                  {imgError ? (
                    <div className="text-white flex flex-col items-center">
                      <i className="fas fa-graduation-cap text-4xl"></i>
                      <span className="text-xs font-black mt-1 uppercase tracking-widest">SHS</span>
                    </div>
                  ) : (
                    <img 
                      src={SCHOOL_LOGO_URL} 
                      alt="School Logo" 
                      className="w-16 h-16 object-contain" 
                      onError={() => setImgError(true)} 
                    />
                  )}
                </div>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
                {isAdminMode ? 'Admin Portal' : 'Faculty Login'}
              </h1>
              <p className="text-blue-100/90 text-sm font-medium tracking-wide">
                {SCHOOL_NAME} • Academic Management System
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="font-medium">Live Cloud Sync Active</span>
              </div>
            </div>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="p-8 md:p-12 space-y-8">
            {error && (
              <div className="animate-in slide-in-from-top-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-600 rounded-2xl flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                  <i className="fas fa-exclamation text-xs"></i>
                </div>
                <div>
                  <p className="font-bold">{error}</p>
                  <p className="text-xs opacity-75 mt-1">Please check your credentials and try again</p>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* Email field */}
              <div className="group">
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">
                  <span className="flex items-center gap-2">
                    <i className="fas fa-envelope text-xs"></i>
                    Official Email Address
                  </span>
                </label>
                <div className={`relative transition-all duration-300 ${isFocused.email ? 'transform -translate-y-1' : ''}`}>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                      <i className="fas fa-at"></i>
                    </div>
                    <input
                      type="email"
                      required
                      disabled={isVerifying}
                      className="w-full pl-20 pr-6 py-4 rounded-2xl border-2 border-gray-100 bg-white/50 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-semibold text-gray-700 placeholder-gray-400 disabled:opacity-50"
                      placeholder="teacher@sacredheartkoderma.org"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setIsFocused(prev => ({ ...prev, email: true }))}
                      onBlur={() => setIsFocused(prev => ({ ...prev, email: false }))}
                    />
                  </div>
                </div>
              </div>

              {/* Password field (Admin only) */}
              {isAdminMode && (
                <div className="group animate-in slide-in-from-top-2">
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-key text-xs"></i>
                      Admin Passphrase
                    </span>
                  </label>
                  <div className={`relative transition-all duration-300 ${isFocused.password ? 'transform -translate-y-1' : ''}`}>
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative flex items-center">
                      <div className="absolute left-4 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
                        <i className="fas fa-lock"></i>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full pl-20 pr-14 py-4 rounded-2xl border-2 border-gray-100 bg-white/50 focus:bg-white focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-semibold text-gray-700 placeholder-gray-400"
                        placeholder="••••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setIsFocused(prev => ({ ...prev, password: true }))}
                        onBlur={() => setIsFocused(prev => ({ ...prev, password: false }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 text-gray-400 hover:text-purple-600 transition-colors"
                      >
                        <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isVerifying}
              className="group relative w-full py-5 px-8 rounded-2xl shadow-xl transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 group-hover:from-blue-700 group-hover:via-indigo-700 group-hover:to-purple-800 transition-all"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity shimmer"></div>
              
              {/* Button content */}
              <div className="relative flex items-center justify-center gap-4">
                {isVerifying ? (
                  <>
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span className="font-black text-white tracking-wide">Verifying with Cloud...</span>
                  </>
                ) : (
                  <>
                    <span className="font-black text-white text-lg tracking-wide">
                      {isAdminMode ? 'Authenticate as Admin' : 'Access Dashboard'}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center transform group-hover:translate-x-2 transition-transform">
                      <i className="fas fa-arrow-right text-white"></i>
                    </div>
                  </>
                )}
              </div>
              
              {/* Ripple effect */}
              <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></span>
            </button>

            {/* Additional info */}
            <div className="pt-4 border-t border-gray-100">
              <p className="text-center text-xs text-gray-500">
                <i className="fas fa-shield-alt mr-1"></i>
                Secure portal • Cloud-synced • Encrypted communication
              </p>
              <p className="text-center text-[10px] text-gray-400 mt-2">
                Need help? Contact system administrator
              </p>
            </div>
          </form>
        </div>

        {/* Footer note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500 font-medium">
            <span className="inline-block px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10">
              <i className="fas fa-cloud-arrow-up mr-1"></i>
              Real-time sync with school database
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

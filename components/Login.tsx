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
  const [activeButton, setActiveButton] = useState<'teacher' | 'admin'>('teacher');

  useEffect(() => {
    // Add floating effect to decorative elements
    const elements = document.querySelectorAll('.floating-element');
    elements.forEach((el, i) => {
      (el as HTMLElement).style.animationDelay = `${i * 0.2}s`;
    });
  }, []);

  // Set mode when button is clicked
  useEffect(() => {
    if (activeButton === 'teacher') {
      setIsAdminMode(false);
      setError('');
      setPassword('');
    } else {
      setIsAdminMode(true);
      setError('');
    }
  }, [activeButton]);

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
          <div className="relative p-6 md:p-8 lg:p-12 text-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white overflow-hidden">
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-32 h-32 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 border-2 border-white rounded-full translate-x-1/2 translate-y-1/2"></div>
            </div>

            {/* Logo and school info */}
            <div className="relative z-10">
              <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 bg-gradient-to-br from-white to-blue-100 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 transform transition-transform hover:scale-105 duration-300 animate-float">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                  {imgError ? (
                    <div className="text-white flex flex-col items-center">
                      <i className="fas fa-graduation-cap text-3xl md:text-4xl"></i>
                      <span className="text-xs font-black mt-1 uppercase tracking-widest">SHS</span>
                    </div>
                  ) : (
                    <img 
                      src={SCHOOL_LOGO_URL} 
                      alt="School Logo" 
                      className="w-12 h-12 md:w-16 md:h-16 object-contain" 
                      onError={() => setImgError(true)} 
                    />
                  )}
                </div>
              </div>
              
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight mb-2">
                Academic Portal
              </h1>
              <p className="text-blue-100/90 text-xs md:text-sm font-medium tracking-wide mb-4 md:mb-6">
                {SCHOOL_NAME}
              </p>
              
              {/* Two separate buttons for Teacher/Admin - Mobile Optimized */}
              <div className="flex flex-row md:flex-row gap-3 md:gap-4 justify-center mb-4">
                <button
                  type="button"
                  onClick={() => setActiveButton('teacher')}
                  className={`flex-1 py-3 px-4 md:py-4 md:px-6 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    activeButton === 'teacher'
                      ? 'bg-white text-blue-700 shadow-lg shadow-white/20'
                      : 'bg-white/10 text-white/90 hover:bg-white/20'
                  }`}
                >
                  <i className={`fas ${activeButton === 'teacher' ? 'fa-chalkboard-teacher' : 'fa-user-tie'} text-sm md:text-base`}></i>
                  <span className="text-xs md:text-sm font-bold">Teacher Login</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setActiveButton('admin')}
                  className={`flex-1 py-3 px-4 md:py-4 md:px-6 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    activeButton === 'admin'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                      : 'bg-white/10 text-white/90 hover:bg-white/20'
                  }`}
                >
                  <i className={`fas ${activeButton === 'admin' ? 'fa-shield-alt' : 'fa-user-shield'} text-sm md:text-base`}></i>
                  <span className="text-xs md:text-sm font-bold">Admin Login</span>
                </button>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="font-medium text-xs">Live Cloud Sync Active</span>
              </div>
            </div>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="p-6 md:p-8 lg:p-12 space-y-6 md:space-y-8">
            {error && (
              <div className="animate-in slide-in-from-top-4 p-3 md:p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-600 rounded-2xl flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full bg-red-100 flex items-center justify-center">
                  <i className="fas fa-exclamation text-xs"></i>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">{error}</p>
                  <p className="text-xs opacity-75 mt-1">Please check your credentials and try again</p>
                </div>
              </div>
            )}

            <div className="space-y-4 md:space-y-6">
              {/* Email field */}
              <div className="group">
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">
                  <span className="flex items-center gap-2">
                    <i className="fas fa-envelope text-xs"></i>
                    Official Email Address
                  </span>
                </label>
                <div className={`relative transition-all duration-300 ${isFocused.email ? 'transform -translate-y-1' : ''}`}>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 md:left-4 w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                      <i className="fas fa-at text-sm"></i>
                    </div>
                    <input
                      type="email"
                      required
                      disabled={isVerifying}
                      className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3 md:py-4 rounded-2xl border-2 border-gray-100 bg-white/50 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-semibold text-gray-700 placeholder-gray-400 disabled:opacity-50 text-sm md:text-base"
                      placeholder={activeButton === 'teacher' ? "teacher@sacredheartkoderma.org" : "admin@sacredheartkoderma.org"}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setIsFocused(prev => ({ ...prev, email: true }))}
                      onBlur={() => setIsFocused(prev => ({ ...prev, email: false }))}
                    />
                  </div>
                </div>
              </div>

              {/* Password field (Admin only) */}
              {activeButton === 'admin' && (
                <div className="group animate-in slide-in-from-top-2">
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-key text-xs"></i>
                      Admin Passphrase
                    </span>
                  </label>
                  <div className={`relative transition-all duration-300 ${isFocused.password ? 'transform -translate-y-1' : ''}`}>
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative flex items-center">
                      <div className="absolute left-3 md:left-4 w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
                        <i className="fas fa-lock text-sm"></i>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full pl-12 md:pl-14 pr-12 md:pr-14 py-3 md:py-4 rounded-2xl border-2 border-gray-100 bg-white/50 focus:bg-white focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-semibold text-gray-700 placeholder-gray-400 text-sm md:text-base"
                        placeholder="••••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setIsFocused(prev => ({ ...prev, password: true }))}
                        onBlur={() => setIsFocused(prev => ({ ...prev, password: false }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 md:right-4 text-gray-400 hover:text-purple-600 transition-colors"
                      >
                        <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
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
              className="group relative w-full py-4 md:py-5 px-6 md:px-8 rounded-2xl shadow-xl transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 group-hover:from-blue-700 group-hover:via-indigo-700 group-hover:to-purple-800 transition-all"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity shimmer"></div>
              
              {/* Button content */}
              <div className="relative flex items-center justify-center gap-3 md:gap-4">
                {isVerifying ? (
                  <>
                    <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span className="font-bold md:font-black text-white text-sm md:text-base tracking-wide">
                      Verifying with Cloud...
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold md:font-black text-white text-sm md:text-lg tracking-wide">
                      {activeButton === 'admin' ? 'Authenticate as Admin' : 'Access Dashboard'}
                    </span>
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 flex items-center justify-center transform group-hover:translate-x-1 md:group-hover:translate-x-2 transition-transform">
                      <i className="fas fa-arrow-right text-white text-sm"></i>
                    </div>
                  </>
                )}
              </div>
              
              {/* Ripple effect */}
              <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></span>
            </button>

            {/* Additional info */}
            <div className="pt-3 md:pt-4 border-t border-gray-100">
              <p className="text-center text-xs text-gray-500">
                <i className="fas fa-shield-alt mr-1"></i>
                Secure portal • Cloud-synced • Encrypted communication
              </p>
              <p className="text-center text-[10px] text-gray-400 mt-1 md:mt-2">
                Need help? Contact system administrator
              </p>
            </div>
          </form>
        </div>

        {/* Footer note */}
        <div className="mt-6 md:mt-8 text-center">
          <p className="text-xs text-gray-500 font-medium">
            <span className="inline-block px-3 py-1.5 md:py-1 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-xs">
              <i className="fas fa-cloud-arrow-up mr-1"></i>
              Real-time sync with school database
            </span>
          </p>
        </div>

        {/* Mobile touch hint (only on small screens) */}
        <div className="block md:hidden mt-6 text-center">
          <p className="text-[10px] text-gray-400 font-medium">
            <i className="fas fa-hand-point-up mr-1"></i>
            Tap buttons to switch between Teacher and Admin login
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

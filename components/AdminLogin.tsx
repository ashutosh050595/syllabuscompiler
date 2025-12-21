
import React, { useState } from 'react';
import { ADMIN_EMAIL } from '../constants';

interface Props {
  onLoginSuccess: () => void;
}

const AdminLogin: React.FC<Props> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // In a real production app, these would be managed securely on a server.
  // For this implementation, we use the provided admin email as the ID.
  const DEFAULT_ADMIN_ID = ADMIN_EMAIL;
  const DEFAULT_ADMIN_PASS = 'shadmin2024'; 

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Simulate API call
    setTimeout(() => {
      if (username === DEFAULT_ADMIN_ID && password === DEFAULT_ADMIN_PASS) {
        onLoginSuccess();
      } else {
        setError('Invalid Admin ID or Password. Please try again.');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-gray-800 px-8 py-8 text-white text-center">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h2 className="text-2xl font-bold">Admin Login</h2>
          <p className="text-gray-400 mt-2 text-sm">Access restricted to authorized personnel only.</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-center space-x-2">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Admin ID (Email)</label>
            <div className="relative">
              <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="email"
                required
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                placeholder="admin@sacredheartkoderma.org"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
            <div className="relative">
              <i className="fas fa-key absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="password"
                required
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <>
                <i className="fas fa-sign-in-alt"></i>
                <span>Authenticate</span>
              </>
            )}
          </button>
          
          <p className="text-center text-xs text-gray-400">
            For demonstration, use admin ID from prompt and password <code className="bg-gray-100 px-1 rounded">shadmin2024</code>
          </p>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;

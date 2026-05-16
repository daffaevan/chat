/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { ChatRoom } from './components/ChatRoom';
import { Heart, RefreshCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function App() {
  const { user, loading, error, signIn, signUp, logout, refreshUser, forceStopLoading } = useAuth();
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setShowRetry(true), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-soft">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-20 h-20 bg-pink-bold rounded-2xl rotate-45 animate-spin duration-[3000ms]">
            <Heart className="absolute inset-0 m-auto w-10 h-10 text-white -rotate-45" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-pink-deep font-black tracking-[0.4em] text-sm uppercase animate-pulse">
              MBULL LOADING...
            </span>
            <span className="text-pink-bold text-[10px] font-bold italic opacity-60">
              Sabar ya mbull, lagi nyiapin chat ❤️
            </span>
          </div>
          {showRetry && (
            <button 
              onClick={() => forceStopLoading()}
              className="mt-4 flex items-center gap-2 text-pink-deep hover:bg-pink-medium/50 px-4 py-2 rounded-xl transition-all text-sm font-bold border border-pink-medium"
            >
              <RefreshCcw className="w-4 h-4" />
              Sabar mbull, tetep loading? Klik ini
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-pink-soft font-sans selection:bg-pink-medium selection:text-ink">
      {user ? (
        <ChatRoom user={user} onLogout={logout} onRefreshUser={refreshUser} />
      ) : (
        <Login onSignIn={signIn} signUp={signUp} error={error} />
      )}
    </main>
  );
}

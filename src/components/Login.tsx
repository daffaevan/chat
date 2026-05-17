import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, MessageCircleHeart, UserPlus, Mail, Lock, User } from 'lucide-react';

interface LoginProps {
  onSignIn: (email: string, pass: string) => Promise<void>;
  error: string | null;
}

export function Login({ onSignIn, signUp, error }: { onSignIn: any, signUp: any, error: any }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ status: string, error?: string }>({ status: 'checking' });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          setApiStatus({ status: 'online' });
        } else {
          setApiStatus({ status: 'offline', error: "Server error" });
        }
      } catch (err: any) {
        setApiStatus({ status: 'offline', error: "Sistem sedang booting..." });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (isRegister && password.length < 6) {
      alert("Password minimal 6 karakter ya mbull! 💖");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await signUp(username, password, displayName);
      } else {
        await onSignIn(username, password);
      }
    } catch (err: any) {
      console.error(err);
      // No need to alert here as the error prop will handle it
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pink-soft px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white border-4 border-pink-medium rounded-[40px] p-8 md:p-12 text-center shadow-[20px_20px_0_var(--color-pink-medium)]"
      >
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-pink-bold rounded-2xl rotate-12 flex items-center justify-center shadow-lg">
            <MessageCircleHeart className="w-10 h-10 text-white -rotate-12" />
          </div>
        </div>
        
        <h1 className="bold-heading text-7xl mb-4 italic">
          MBULL
        </h1>
        <p className="text-pink-deep mb-2 font-bold uppercase tracking-widest text-[10px]">
          {isRegister ? 'BUAT AKUN BARU' : 'CHAT AKU DISINI YA'}
        </p>
        <p className="text-[9px] text-pink-bold font-bold uppercase italic mb-8 opacity-60">
          
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {isRegister && (
             <div>
             <label className="block text-[10px] font-bold uppercase tracking-widest text-pink-bold mb-1.5 ml-4">
               Display Name
             </label>
             <div className="relative">
               <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-medium" />
               <input
                 type="text"
                 required
                 value={displayName}
                 onChange={(e) => setDisplayName(e.target.value)}
                 className="bold-input w-full !px-12 !py-3 text-base"
                 placeholder="Nama Mbull/Daffa"
               />
             </div>
           </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-pink-bold mb-1.5 ml-4">
              Username
            </label>
            <div className="relative">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-medium" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bold-input w-full !px-12 !py-3 text-base"
                placeholder="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-pink-bold mb-1.5 ml-4">
              Secret Key (Password)
            </label>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-medium" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bold-input w-full !px-12 !py-3 text-base"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 text-center p-3 bg-red-50 rounded-2xl border border-red-100">
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest block mb-1">
                ⚠️ INFO SISTEM
              </span>
              <p className="text-[10px] text-red-600 font-bold leading-tight">
                {error.includes("booting") 
                  ? error 
                  : "Terjadi gangguan koneksi. Coba refresh halaman ya mbull. 💖"}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-pink-deep hover:bg-ink text-white rounded-[30px] transition-all duration-300 font-bold uppercase tracking-wider text-xs active:scale-95 shadow-lg disabled:opacity-50 mt-6"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {isRegister ? 'Create Account' : 'Access Chat'}
              </>
            )}
          </button>

          <div className="h-4" />
        </form>
      </motion.div>
    </div>
  );
}

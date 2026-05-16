import { useState } from 'react';
import { motion } from 'motion/react';
import { Send, MessageSquare } from 'lucide-react';

export default function App() {
  const [message, setMessage] = useState('');

  return (
    <div className="min-h-screen bg-[#fff5f5] flex flex-col items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-pink-100"
      >
        <div className="bg-pink-500 p-6 text-white flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <MessageSquare size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Chat Mbull</h1>
            <p className="text-pink-100 text-xs">Starting from zero...</p>
          </div>
        </div>

        <div className="p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-gray-800">Fresh Start!</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Your workspace is now clean and ready for the new <strong>chat-mbull</strong> repository.
          </p>
          
          <div className="pt-4">
            <div className="relative group">
              <input 
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your first message..."
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 px-6 pr-14 focus:outline-none focus:border-pink-300 transition-all text-gray-700"
              />
              <button className="absolute right-2 top-2 bg-pink-500 text-white p-3 rounded-xl hover:bg-pink-600 transition-colors">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
            Connect to daffaevan/chat-mbull in settings
          </p>
        </div>
      </motion.div>
    </div>
  );
}

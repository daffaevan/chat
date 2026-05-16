import { useState, useEffect, useRef, FormEvent, ChangeEvent, useCallback, useMemo } from 'react';
import axios from 'axios';
import socket from '../lib/socket';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'motion/react';
import { Send, LogOut, Heart, Sparkles, Reply, X, User as UserIcon, Camera, Check, Mic, Square, Trash2, Play, Pause, Smile } from 'lucide-react';
import { LocalUser } from '../hooks/useAuth';
import { format } from 'date-fns';
import { getCroppedImg, compressImage } from '../lib/imageUtils';
import { VirtualKeyboard } from './VirtualKeyboard';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  where,
  increment,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, uploadBytes } from 'firebase/storage';

interface Message {
  id: string;
  text?: string;
  audioURL?: string;
  audioDuration?: number;
  imageUrl?: string;
  stickerUrl?: string;
  type?: 'text' | 'audio' | 'sticker' | 'image';
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  createdAt: any;
  room: string;
  reactions?: {
    [emoji: string]: string[]; // array of userIds
  };
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  };
}

interface Sticker {
  id: string;
  url: string;
  userId?: string;
  createdAt: number;
}

interface ChatRoomProps {
  user: LocalUser;
  onLogout: () => void;
  onRefreshUser: () => Promise<LocalUser | null>;
}

interface TypingUser {
  id: string;
  userName: string;
  isTyping: boolean;
  updatedAt: any;
}

// Floating Hearts Background Component
const FloatingHearts = () => {
  const hearts = useMemo(() => {
    return Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: 15 + Math.random() * 25,
      delay: Math.random() * -25, // Negative delay to start mid-animation
      scale: 0.5 + Math.random() * 0.8,
      opacity: 0.05 + Math.random() * 0.15,
      emoji: ['❤️', '💖', '💕', '💗', '💓'][Math.floor(Math.random() * 5)]
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {hearts.map((heart) => (
        <motion.div
          key={heart.id}
          initial={{ y: '110vh', x: 0, opacity: 0 }}
          animate={{ 
            y: '-10vh',
            x: [0, 25, -25, 0],
            opacity: [0, heart.opacity, heart.opacity, 0]
          }}
          transition={{ 
            duration: heart.duration, 
            repeat: Infinity, 
            delay: heart.delay,
            ease: "linear",
            x: {
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              ease: "easeInOut"
            }
          }}
          className="absolute"
          style={{ 
            left: heart.left,
            fontSize: `${20 * heart.scale}px`,
            filter: 'blur(0.5px)'
          }}
        >
          {heart.emoji}
        </motion.div>
      ))}
    </div>
  );
};

const getFullUrl = (path: string | null | undefined) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return path;
};

// Audio Player Component
const AudioPlayer = ({ url, duration }: { url: string, duration?: number }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      const p = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(p || 0);
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 py-1 min-w-[160px]">
      <button 
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      
      <div className="flex-1 space-y-1">
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[8px] font-bold opacity-60">
          <span>{audioRef.current ? formatDuration(audioRef.current.currentTime) : '0:00'}</span>
          <span>{duration ? formatDuration(duration) : '--:--'}</span>
        </div>
      </div>
      
      <audio 
        ref={audioRef} 
        src={url} 
        onTimeUpdate={onTimeUpdate} 
        onEnded={onEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden" 
      />
    </div>
  );
};

export function ChatRoom({ user, onLogout, onRefreshUser }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const channelRef = useRef<any>(null);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<{ name: string, photo: string | null } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState(user.displayName || '');
  const [profilePhoto, setProfilePhoto] = useState(getFullUrl(user.photoURL) || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  useEffect(() => {
    setProfileName(user.displayName || '');
    setProfilePhoto(getFullUrl(user.photoURL) || '');
  }, [user.displayName, user.photoURL]);

  const [globalLastRead, setGlobalLastRead] = useState<number>(0);
  const [myStickers, setMyStickers] = useState<Sticker[]>([]);
  
  const allStickers = useMemo(() => {
    return [...myStickers];
  }, [myStickers]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const checkQuotaError = useCallback((err: any) => {
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota exceeded')) {
      setIsQuotaExceeded(true);
      return true;
    }
    return false;
  }, []);

  // Cropping State
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const currentReactions = msg.reactions || {};
    const userList = currentReactions[emoji] || [];
    const hasReacted = userList.includes(user.uid);

    let newUserList;
    if (hasReacted) {
      newUserList = userList.filter(id => id !== user.uid);
    } else {
      newUserList = [...userList, user.uid];
    }

    const updatedReactions = { ...currentReactions };
    if (newUserList.length > 0) {
      updatedReactions[emoji] = newUserList;
    } else {
      delete updatedReactions[emoji];
    }

    try {
      await updateDoc(doc(db, 'messages', messageId), {
        reactions: updatedReactions
      });
    } catch (err: any) {
      if (!checkQuotaError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `messages/${messageId}`);
      }
    }

    setReactionMessageId(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 100) { // Check if it's not and empty file
           await handleSendVoiceNote(audioBlob);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Mbull, izinin mikrofonnya dulu ya biar bisa rekam VN!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.onstop = null; // Don't trigger the upload
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const handleSendVoiceNote = async (blob: Blob) => {
    setSending(true);
    try {
      console.log("[AUDIO] Converting to base64 for Firestore storage...");
      // Convert blob to base64 to store directly in Firestore (bypass Storage issues)
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      const base64 = await base64Promise;
      
      // Limit base64 size for Firestore (1MB limit)
      if (base64.length > 1000000) {
        throw new Error("VN kepanjangan mbull! Maksimal 15-20 detik aja yaa ❤️");
      }

      const messageData = {
        type: 'audio' as const,
        audioURL: base64, // Storing base64 directly
        audioDuration: recordingDuration,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhoto: user.photoURL || null,
        createdAt: Date.now(),
        reactions: {},
        room: 'global'
      };

      await addDoc(collection(db, 'messages'), messageData);
      console.log("[AUDIO] Saved to Firestore success.");
    } catch (error: any) {
      console.error("Voice Note Process Error:", error);
      alert(error.message || "Gagal kirim VN mbull! 💔 Mungkin karena kepanjangan atau koneksi bapuk.");
    } finally {
      setSending(false);
      setRecordingDuration(0);
    }
  };

  useEffect(() => {
    // 1. Subscribe to Messages
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setMessages(newMessages.reverse());
    }, (err) => {
      console.error("Messages Subscription Error:", err);
      checkQuotaError(err);
    });

    // 2. Subscribe to Stickers
    // Remove orderBy to avoid composite index requirement
      console.log(`[STICKERS] Initializing sub for UID: "${user.uid}"`);
      const stickersRef = collection(db, 'stickers');
      const sq = query(stickersRef, where('userId', '==', user.uid));
      
      const unsubscribeStickers = onSnapshot(sq, (snapshot) => {
        console.log(`[STICKERS] Received snapshot. Count: ${snapshot.docs.length}`);
        const stickers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Sticker[];
      // Sort in JS
      const sortedStickers = [...stickers].sort((a, b) => {
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        return timeB - timeA;
      });
      setMyStickers(sortedStickers);
    }, (err) => {
      console.error("Stickers Subscription Error:", err);
      checkQuotaError(err);
    });

    // 3. Subscribe to App Status (Last Read) - Per User
    const unsubscribeStatus = onSnapshot(collection(db, 'status'), (snapshot) => {
      let maxOtherRead = 0;
      snapshot.docs.forEach(d => {
        // Skip our own status AND skip any stale or special docs
        // UIDs are generally long (20+ chars)
        if (d.id !== user.uid && d.id.length > 15) {
          const val = parseInt(d.data().value || "0");
          if (val > maxOtherRead) maxOtherRead = val;
        }
      });
      // ONLY update if it's actually greater to avoid state loops
      if (maxOtherRead > 0) {
        setGlobalLastRead(prev => maxOtherRead > prev ? maxOtherRead : prev);
      }
    }, (err) => {
      console.error("Status Subscription Error:", err);
      checkQuotaError(err);
    });

    // Socket listeners for typing and presence
    socket.connect();
    socket.emit('join', user.uid);
    socket.on('lastReadUpdated', (data: any) => {
      // Data expected: { uid: string, timestamp: number }
      if (data && data.uid !== user.uid) {
        setGlobalLastRead(prev => data.timestamp > prev ? data.timestamp : prev);
      }
    });
    socket.on('userTyping', (data: any) => {
      const { uid, userName, isTyping } = data;
      if (uid === user.uid) return;
      
      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.id !== uid);
        if (isTyping) {
          return [...filtered, { id: uid, userName, isTyping: true, updatedAt: Date.now() }];
        }
        return filtered;
      });
    });

    return () => {
      unsubscribeMessages();
      unsubscribeStickers();
      unsubscribeStatus();
      socket.off('lastReadUpdated');
      socket.off('userTyping');
      socket.disconnect();
    };
  }, [user.uid, user.displayName]);

  // Helper to get Date object from message
  const getMessageDate = (m: Message): Date => {
    if (!m.createdAt) return new Date();
    // Handle both number and ISO string
    const d = new Date(m.createdAt);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerUploadRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<number | null>(null);

  const handleStickerUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setSending(true);
    setUploadProgress(10);
    
    try {
      console.log("[STICKER] Compressing sticker for Firestore storage...");
      // 1. Compress image to be small enough for Firestore (usually < 200kb)
      const compressedBase64 = await compressImage(file, 400, 0.7);
      setUploadProgress(60);
      
      if (compressedBase64.length > 900000) {
        throw new Error("Gambar masih kegedean mbull! 💔 Coba file lain ya?");
      }

      // 2. Save directly to Firestore (Bypassing Storage entirely)
      console.log("[STICKER] Saving directly to Firestore...");
      await addDoc(collection(db, 'stickers'), {
        url: compressedBase64,
        userId: user.uid,
        createdAt: Date.now()
      });

      setUploadProgress(100);
      alert('Sticker berhasil disimpan mbull! 💖');
    } catch (error: any) {
      console.error("Sticker Upload Error:", error);
      setUploadProgress(0);
      const errorMsg = error.message || 'Error tidak dikenal';
      alert(`Gagal simpan sticker mbull: ${errorMsg} 💔`);
    } finally {
      setUploadProgress(0);
      setSending(false);
      if (e.target) e.target.value = '';
    }
  };

  // Sync selectionRef whenever newMessage changes from external sources or mounts
  useEffect(() => {
    if (inputRef.current) {
      selectionRef.current = inputRef.current.selectionStart;
    }
  }, [newMessage]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Browser Anda tidak mendukung notifikasi.');
      return;
    }
    
    try {
      // For iOS, remind them to add to home screen if they haven't
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
      
      if (isIOS && !isStandalone) {
        alert('Mbull, khusus di iPhone/iPad, biar notifikasinya lancar dan nggak ilang-ilang, kamu harus "Tambah ke Layar Beranda" (Add to Home Screen) dulu ya! Caranya: Klik tombol Share (panah kotak) di Safari, lalu pilih "Tambah ke Layar Beranda".');
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
        const title = 'Notifikasi Aktif! 🚀';
        const options = {
          body: 'Mbull akan menerima pemberitahuan setiap ada pesan baru dari Daffa.',
          icon: '/logo192.png',
          badge: '/logo192.png',
          vibrate: [100, 50, 100],
        };

        if (registration) {
          if (registration.active) {
            registration.active.postMessage({ type: 'SHOW_NOTIFICATION', title, options });
          } else {
            registration.showNotification(title, options);
          }
        } else {
          new Notification(title, options);
        }
      } else if (permission === 'denied') {
        alert('Izin notifikasi ditolak. Mbull perlu mengaktifkannya secara manual di pengaturan browser biar Daffa bisa kasih kejutan lewat notif!');
      }
    } catch (err) {
      console.error('Error requesting permission:', err);
    }
  };

  const saveSticker = async (url: string) => {
    if (!user) return;
    try {
      if (myStickers.some(s => s.url === url)) {
        alert('Sticker sudah tersimpan di koleksi kamu! ❤️');
        return;
      }
      
      await addDoc(collection(db, 'stickers'), {
        url,
        userId: user.uid,
        createdAt: Date.now()
      });
      alert('Sticker berhasil disimpan! 💖');
    } catch (error: any) {
      if (!checkQuotaError(error)) {
        handleFirestoreError(error, OperationType.CREATE, 'stickers');
      }
    }
  };

  const deleteSticker = async (stickerId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'stickers', stickerId));
    } catch (error: any) {
      if (!checkQuotaError(error)) {
        handleFirestoreError(error, OperationType.DELETE, `stickers/${stickerId}`);
      }
    }
  };

  const sendSticker = async (url: string) => {
    if (!user || sending) return;
    setSending(true);
    setShowStickerPicker(false);
    try {
      const messageData = {
        type: 'sticker' as const,
        stickerUrl: url,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhoto: user.photoURL || null,
        createdAt: Date.now(),
        reactions: {},
        room: 'global',
        replyTo: replyingTo ? {
          messageId: replyingTo.id,
          text: replyingTo.text || (replyingTo.type === 'audio' ? '🎵 Audio' : replyingTo.type === 'sticker' ? '🖼️ Sticker' : 'Kirim gambar'),
          senderName: replyingTo.senderName
        } : null
      };

      await addDoc(collection(db, 'messages'), messageData);
      setReplyingTo(null);
    } catch (error: any) {
       if (!checkQuotaError(error)) {
         handleFirestoreError(error, OperationType.CREATE, 'messages');
       }
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scrollToBottom();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // Only notify if message is from others and not too old
      // Increase tolerance to 2 minutes (120000ms) for better reliability
      const isRecent = lastMessage.createdAt ? (Date.now() - lastMessage.createdAt < 120000) : true;
      
      if (lastMessage.senderId !== user.uid && isRecent) {
        // Show desktop notification only if tab is not visible
        if (document.visibilityState === 'hidden' && notificationPermission === 'granted') {
          const showMsgNotification = async () => {
            const title = `Pesan dari ${lastMessage.senderName}`;
            const options = {
              body: lastMessage.text || (lastMessage.type === 'audio' ? '🎵 Voice Note' : lastMessage.type === 'sticker' ? '🖼️ Sticker' : 'Kirim gambar'),
              icon: getFullUrl(lastMessage.senderPhoto) || '/logo192.png',
              badge: '/logo192.png',
              vibrate: [200, 100, 200],
              tag: 'new-message',
              renotify: true,
              data: {
                url: window.location.origin
              }
            };

            if ('serviceWorker' in navigator) {
              const registration = await navigator.serviceWorker.ready;
              if (registration.active) {
                registration.active.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  title,
                  options
                });
              } else {
                registration.showNotification(title, options);
              }
            } else {
              new Notification(title, options);
            }
          };
          showMsgNotification();
        }
      }
    }
  }, [messages, user.uid, notificationPermission]);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // Removed redundant effects already handled by socket init

  // Per-user "Seen" logic with optimization (throttled)
  const lastUpdateRef = useRef<number>(0);
  const lastFirestoreWriteRef = useRef<number>(0);
  const writeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (messages.length === 0) return;

    const performUpdate = async (msgTime: number) => {
      lastUpdateRef.current = msgTime;
      try {
        // 1. Live notification via Socket (Cheapest, instant)
        socket.emit('updateLastRead', { uid: user.uid, timestamp: msgTime });
        
        // 2. Occasional persistence to Firestore (To handle boros logic)
        // Only write to Firestore if the change is significant (more than 10s difference)
        // OR if the user hasn't written in a while.
        const shouldWriteToFirestore = !lastFirestoreWriteRef.current || (Date.now() - lastFirestoreWriteRef.current > 15000);
        
        if (shouldWriteToFirestore) {
          lastFirestoreWriteRef.current = Date.now();
          await setDoc(doc(db, 'status', user.uid), { 
            value: msgTime.toString(),
            updatedAt: Date.now()
          }, { merge: true });
        }
      } catch (err) {
        console.error("Error updating last read:", err);
      }
    };

    const updateLastRead = () => {
      if (document.visibilityState !== 'visible' || messages.length === 0) return;

      const lastMsg = messages[messages.length - 1];
      if (!lastMsg.createdAt) return;

      // Optimization: If the last message was sent by us, technically we've already "seen" everything up to that point.
      // However, we only need to update our status if there's a NEW message from someone else that we've now viewed.
      // If we are the one who sent the latest, our status is already updated or doesn't need to move to show "seen" to others.
      // Actually, updating on every message is fine as long as it's throttled.
      
      const msgTime = typeof lastMsg.createdAt === 'number' 
        ? lastMsg.createdAt 
        : (lastMsg.createdAt.toDate ? lastMsg.createdAt.toDate().getTime() : new Date(lastMsg.createdAt).getTime());

      if (msgTime > lastUpdateRef.current) {
        if (!writeTimeoutRef.current) {
          writeTimeoutRef.current = setTimeout(() => {
            performUpdate(msgTime);
            writeTimeoutRef.current = null;
          }, 3000); // Throttled to 3s for better 'boros' management
        }
      }
    };

    updateLastRead();
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateLastRead();
    };

    window.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      if (writeTimeoutRef.current) clearTimeout(writeTimeoutRef.current);
    };
  }, [messages, user.uid]);

  // Typing and Presence logic using socket
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const isTyping = !!newMessage.trim();
    socket.emit('typing', { uid: user.uid, userName: user.displayName || 'Anonymous', isTyping });
    
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { uid: user.uid, userName: user.displayName || 'Anonymous', isTyping: false });
      }, 3000);
    }

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [newMessage, user.uid, user.displayName]);

  // WhatsApp-style anchoring: scroll to bottom when keyboard, stickers, or messages change
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    // Use ResizeObserver to catch height changes when keyboard/stickers expand
    const resizeObserver = new ResizeObserver(() => {
      // Small timeout to allow content to "settle" during animation
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    });

    resizeObserver.observe(scrollContainer);

    // Immediate scroll when these change
    scrollToBottom('smooth');
    
    // Backup scroll after animation delay
    const timer = setTimeout(() => {
      scrollToBottom('smooth');
    }, 350);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [messages, showVirtualKeyboard, showStickerPicker]);

  // Scroll to hide keyboard and sticker picker logic
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let lastScrollTop = scrollContainer.scrollTop;

    const handleScroll = () => {
      if (!showVirtualKeyboard && !showStickerPicker) {
        lastScrollTop = scrollContainer.scrollTop;
        return;
      }

      const currentScrollTop = scrollContainer.scrollTop;
      const diff = currentScrollTop - lastScrollTop;
      
      // If we are scrolling UP (diff < 0) significantly
      if (diff < -15) {
        if (showVirtualKeyboard) setShowVirtualKeyboard(false);
        if (showStickerPicker) setShowStickerPicker(false);
      }
      
      lastScrollTop = currentScrollTop;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [showVirtualKeyboard, showStickerPicker]);


  const handleVirtualInput = useCallback((char: string) => {
    if (!inputRef.current) return;
    
    // Read from DOM only if we don't have a reliable tracked value
    const currentPos = selectionRef.current ?? inputRef.current.selectionStart ?? newMessage.length;
    
    setNewMessage(prev => {
      const text = prev.substring(0, currentPos) + char + prev.substring(currentPos);
      return text;
    });
    
    const newPos = currentPos + char.length;
    selectionRef.current = newPos;

    // We still update the DOM selection on the next tick, 
    // but the state update is now consistent even if this is called multiple times per tick.
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, []);

  const handleVirtualBackspace = useCallback(() => {
    if (!inputRef.current) return;
    
    const currentPos = selectionRef.current ?? inputRef.current.selectionStart ?? newMessage.length;
    let newPos = currentPos;

    setNewMessage(prev => {
      if (currentPos > 0) {
        newPos = currentPos - 1;
        return prev.substring(0, currentPos - 1) + prev.substring(currentPos);
      }
      return prev;
    });

    selectionRef.current = newPos;
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, []);

  const sendMessage = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const messageData = {
        type: 'text' as const,
        text: newMessage.trim(),
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhoto: user.photoURL || null,
        createdAt: Date.now(),
        reactions: {},
        room: 'global',
        replyTo: replyingTo ? {
          messageId: replyingTo.id,
          text: replyingTo.text || (replyingTo.type === 'audio' ? '🎵 Audio' : replyingTo.type === 'sticker' ? '🖼️ Sticker' : 'Kirim gambar'),
          senderName: replyingTo.senderName
        } : null
      };

      await addDoc(collection(db, 'messages'), messageData);
      setNewMessage('');
      setReplyingTo(null);
    } catch (error: any) {
      if (!checkQuotaError(error)) {
        handleFirestoreError(error, OperationType.CREATE, 'messages');
      }
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, user, replyingTo]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Allow up to 2MB for source image
        alert('Fotonya kegedean mbull, maksimal 2MB ya untuk sumbernya!');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageToCrop(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    try {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setProfilePhoto(croppedImage);
      setImageToCrop(null);
    } catch (e) {
      console.error(e);
      alert('Gagal memotong gambar.');
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (updatingProfile || !user) return;

    setUpdatingProfile(true);
    console.log("[PROFILE] Update initiated...");

    // Master timeout to ensure the UI eventually unlocks no matter what
    const masterTimeoutId = setTimeout(() => {
      if (updatingProfile) {
        console.error("[PROFILE] Operation timed out.");
        setUpdatingProfile(false);
        // We don't alert here to avoid double alerts, but we unlock the UI
      }
    }, 45000);

    try {
      const originalPhotoURL = getFullUrl(user.photoURL);
      let targetPhotoURL = originalPhotoURL;
      
      const nameChanged = profileName.trim() !== (user.displayName || '');
      const photoChanged = profilePhoto.startsWith('data:');

      if (!nameChanged && !photoChanged) {
        setShowProfile(false);
        setUpdatingProfile(false);
        clearTimeout(masterTimeoutId);
        return;
      }

      // 1. Try to upload to storage first if photo changed
      let storageUploadedURL = null;
      if (photoChanged) {
        try {
          console.log("[PROFILE] Uploading new photo to Storage...");
          const storagePath = `avatars/${user.uid}_${Date.now()}.png`;
          const storageRef = ref(storage, storagePath);
          
          const uploadTask = uploadString(storageRef, profilePhoto, 'data_url');
          // Individual timeout for storage
          const uploadTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage Timeout')), 10000));
          
          await Promise.race([uploadTask, uploadTimeout]);
          storageUploadedURL = await getDownloadURL(storageRef);
          targetPhotoURL = storageUploadedURL;
          console.log("[PROFILE] Storage upload success.");
        } catch (err) {
          console.warn("[PROFILE] Storage upload failed/timed out, will try to use base64 in Firestore temporarily if small enough.", err);
          // If the base64 is reasonably sized (< 500kb), we can try to save it to firestore directly
          if (profilePhoto.length < 600000) {
            targetPhotoURL = profilePhoto;
          }
        }
      }

      // 2. PRIMARY SYNC: Firestore (The source of truth)
      console.log("[PROFILE] Syncing to Firestore...");
      try {
        await setDoc(doc(db, 'profiles', user.uid), {
          uid: user.uid,
          username: user.username,
          displayName: profileName.trim(),
          email: user.email,
          photoURL: targetPhotoURL || null,
          lastUpdated: serverTimestamp()
        }, { merge: true });
        console.log("[PROFILE] Firestore sync success.");
      } catch (fsErr: any) {
        console.error("[PROFILE] Firestore sync failed:", fsErr);
        if (fsErr.message?.includes('too large') || profilePhoto.length > 1000000) {
          throw new Error("Fotonya kegedean mbull! 💔 Coba foto yang ukurannya lebih kecil ya?");
        }
        throw new Error("Gagal simpan profil ke database mbull. 💔");
      }

      // 3. SECONDARY SYNC: Background API Call (For Firebase Auth)
      // Do NOT await this to prevent blocking the UI
      (async () => {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (!idToken) return;

          const res = await fetch('/api/users/profile', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ 
              displayName: profileName.trim(),
              photoURL: storageUploadedURL, // Prefer the storage URL
              photoData: (!storageUploadedURL && photoChanged && profilePhoto.length < 2000000) ? profilePhoto : undefined
            })
          });
          const result = await res.json();
          console.log("[PROFILE] API background sync success:", result);
        } catch (apiErr) {
          console.warn("[PROFILE] API sync failed in background:", apiErr);
        }
      })();

      // 4. Refresh and Close
      console.log("[PROFILE] Refreshing local user state...");
      const refreshedUser = await onRefreshUser() as any;
      
      // If we got refreshed data back, we can manually trigger any local updates if needed,
      // though the prop change should handle most of it.
      if (refreshedUser) {
        console.log("[PROFILE] Local state updated with refreshed data:", refreshedUser.displayName);
      }
      
      clearTimeout(masterTimeoutId);
      setUpdatingProfile(false);
      setShowProfile(false);
      
      // Use a timeout for alert to let the UI finish updating state first
      setTimeout(() => {
        alert('Profil berhasil diperbarui mbull! ✨');
      }, 100);
      
    } catch (error: any) {
      console.error('[PROFILE] Fatal error during save:', error);
      clearTimeout(masterTimeoutId);
      setUpdatingProfile(false);
      alert(error.message || 'Gagal update profil mbull! 💔');
    }
  };

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    if (replyingTo) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        setShowVirtualKeyboard(true);
        setShowStickerPicker(false);
      }
    }
  }, [replyingTo]);

  const handleVirtualSend = useCallback(() => {
    const fakeEvent = { preventDefault: () => {} } as any;
    sendMessageRef.current(fakeEvent);
  }, []);

  const handleVirtualClose = useCallback(() => {
    setShowVirtualKeyboard(false);
  }, []);

  // Sticker Picker View
  const renderStickerPicker = () => {
    return (
      <AnimatePresence>
        {showStickerPicker && (
          <motion.div 
            key="sticker-picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="bg-white border-t border-pink-medium overflow-hidden select-none"
          >
            <div className="h-full flex flex-col p-4">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-[10px] font-black italic text-pink-deep uppercase tracking-widest flex items-center gap-2">
                    <Heart className="w-3 h-3 fill-current" />
                    KOLEKSI STICKER MBULL
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowStickerPicker(false)}
                  className="p-1"
                >
                  <X className="w-4 h-4 text-pink-bold" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-4 pb-16 custom-scrollbar">
                <button 
                  type="button"
                  onClick={() => stickerUploadRef.current?.click()}
                  className={`aspect-square bg-pink-soft border-2 border-dashed border-pink-medium rounded-2xl flex flex-col items-center justify-center gap-1 hover:bg-pink-medium transition-colors cursor-pointer active:scale-95 ${sending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={sending}
                >
                  {sending ? (
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 border-2 border-pink-deep border-t-transparent rounded-full animate-spin mb-1" />
                      <span className="text-[8px] font-black italic text-pink-deep">{uploadProgress}%</span>
                    </div>
                  ) : (
                    <Camera className="w-5 h-5 text-pink-deep" />
                  )}
                  <span className="text-[7px] font-black uppercase italic text-pink-deep">{sending ? 'Wait...' : 'UPLOAD'}</span>
                </button>

                {allStickers.map((sticker, idx) => (
                  <motion.div 
                    key={sticker.id} 
                    className="relative group"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <button 
                      type="button"
                      onClick={() => sendSticker(sticker.url)}
                      className="w-full aspect-square bg-pink-soft rounded-2xl p-2 hover:scale-105 transition-transform flex items-center justify-center border-2 border-transparent hover:border-pink-medium shadow-sm hover:shadow-md"
                    >
                      <img src={getFullUrl(sticker.url)} alt="sticker" className="w-full h-full object-contain" />
                    </button>
                  </motion.div>
                ))}
                
                {myStickers.length === 0 && !sending && (
                  <div className="col-span-4 py-8 text-center text-pink-bold opacity-60">
                     <p className="text-[9px] font-black uppercase italic">Belum ada sticker kustom mbull...</p>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence>
              {uploadError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="fixed bottom-24 left-4 right-4 bg-red-500 text-white text-[10px] font-black uppercase italic p-3 rounded-xl shadow-lg z-50 text-center"
                >
                  {uploadError}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-pink-soft md:static md:flex-row md:h-screen md:max-w-5xl md:mx-auto md:overflow-hidden md:border-x-4 md:border-pink-medium md:shadow-2xl overscroll-none">
      {/* "Sidebar" branding section */}
      <aside className="hidden md:flex flex-col w-80 bg-white border-r-4 border-pink-medium shrink-0">
        <div className="p-10">
          <h1 className="bold-heading text-5xl italic">MBULL</h1>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-pink-bold opacity-60">Private Space</p>
        </div>
        
        <div className="flex-1 p-6 space-y-4">
          <button 
            onClick={() => setShowProfile(true)}
            className="w-full text-left p-4 bg-pink-soft border-2 border-pink-bold rounded-2xl flex items-center gap-3 hover:bg-pink-medium transition-colors group"
          >
              <div className="w-10 h-10 bg-pink-bold rounded-lg flex items-center justify-center font-bold text-white overflow-hidden shrink-0">
                {user.photoURL ? (
                  <img src={getFullUrl(user.photoURL)} alt="" className="w-full h-full object-cover shadow-inner" referrerPolicy="no-referrer" />
                ) : (
                  (user.displayName || 'A').substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-pink-deep opacity-60 group-hover:opacity-100 transition-opacity">Account Settings</p>
                <p className="text-sm font-semibold text-ink truncate">{user.displayName}</p>
              </div>
          </button>

          <button 
            onClick={onLogout}
            className="w-full text-left p-4 hover:bg-pink-soft rounded-2xl flex items-center gap-3 transition-colors text-pink-deep"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-bold italic">Logout</span>
          </button>
        </div>

        <div className="p-8 border-t border-pink-medium">
           <div className="flex items-center gap-2 text-pink-bold opacity-40">
             <Heart className="w-4 h-4 fill-current" />
             <span className="text-[10px] font-bold tracking-widest uppercase">Mbull & Daffa</span>
           </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-pink-soft overflow-hidden relative min-h-0">
        <FloatingHearts />
        <header className="h-16 shrink-0 px-6 flex items-center justify-between border-b border-pink-medium bg-white/80 backdrop-blur-md z-20">
           <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-deep fill-pink-deep animate-pulse" />
                <h2 className="text-xl font-bold italic tracking-tighter text-ink">I LOVEE U MBULLL</h2>
              </div>

              {notificationPermission === 'default' && (
                <button 
                  onClick={requestNotificationPermission}
                  className="hidden md:flex items-center gap-1 px-3 py-1 bg-pink-soft text-pink-deep text-[10px] font-bold rounded-full hover:bg-pink-medium transition-colors border border-pink-medium"
                >
                  <Sparkles className="w-3 h-3" />
                  ENABLE NOTIFICATIONS
                </button>
              )}
           </div>
           
           <div className="flex items-center gap-2">
             {notificationPermission === 'default' && (
                <button 
                  onClick={requestNotificationPermission}
                  className="md:hidden p-2 text-pink-deep"
                  title="Enable Notifications"
                >
                  <Sparkles className="w-6 h-6" />
                </button>
              )}
              <button 
                onClick={() => setShowProfile(true)}
                className="p-2 text-pink-deep"
                title="Profile"
              >
                 <UserIcon className="w-6 h-6" />
              </button>
            </div>
         </header>

        <div className="text-[10px] absolute top-20 right-8 font-medium tracking-tight text-pink-bold opacity-40 select-none z-10">
          Made With Love❤
        </div>

        <div 
          ref={scrollRef}
          onClick={() => {
            setShowVirtualKeyboard(false);
            setShowStickerPicker(false);
          }}
          className="flex-1 overflow-y-auto px-1 py-6 scrollbar-hide min-h-0 relative z-10"
        >
          {isQuotaExceeded ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
              <div className="bg-pink-soft p-6 rounded-3xl border-2 border-pink-medium shadow-pink">
                <Sparkles className="w-12 h-12 text-pink-deep mx-auto mb-4 opacity-50" />
                <h2 className="text-xl font-black italic tracking-tighter text-pink-deep mb-2">LIMIT DATABASE TERCAPAI 💔</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-pink-bold leading-relaxed max-w-xs mb-4">
                  Aplikasi menggunakan database (50rb baca/hari). Kuota hari ini sudah habiss, besokk lagii yaa mbull!!
                </p>
                <div className="p-3 bg-white/50 rounded-xl">
                  <p className="text-[9px] font-black italic text-pink-deep">Info: Chat akan muncul kembali besok siang saat kuota direset otomatis.</p>
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
              const nextMsg = messages[idx + 1];
              const prevMsg = messages[idx - 1];
              
              const getMinute = (m: Message | undefined) => {
                if (!m) return '';
                const d = getMessageDate(m);
                return format(d, 'HH:mm');
              };

              const isSameSenderAsNext = nextMsg && nextMsg.senderId === msg.senderId;
              const isSameMinuteAsNext = isSameSenderAsNext && getMinute(nextMsg) === getMinute(msg);
              
              const isSameSenderAsPrev = prevMsg && prevMsg.senderId === msg.senderId;
              const isSameMinuteAsPrev = isSameSenderAsPrev && getMinute(prevMsg) === getMinute(msg);
              
              const isNewDay = (m1: Message | undefined, m2: Message) => {
                if (!m1) return true;
                const d1 = getMessageDate(m1);
                const d2 = getMessageDate(m2);
                return format(d1, 'yyyy-MM-dd') !== format(d2, 'yyyy-MM-dd');
              };

              const showDateSeparator = isNewDay(prevMsg, msg);

              const formatDateSeparator = (date: any) => {
                const d = date ? new Date(date) : new Date();
                const today = format(new Date(), 'yyyy-MM-dd');
                const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
                const dateStr = isNaN(d.getTime()) ? today : format(d, 'yyyy-MM-dd');

                if (dateStr === today) return 'Today';
                if (dateStr === yesterday) return 'Yesterday';
                return format(d, 'MMMM d, yyyy');
              };

              const showAvatar = !isSameMinuteAsPrev;
              const showName = showAvatar && msg.senderId !== user.uid;
              const showTime = !isSameMinuteAsNext;

              return (
                <div key={msg.id} className="flex flex-col w-full">
                  {showDateSeparator && (
                    <div className="flex justify-center my-6 sticky top-2 z-10">
                      <span className="px-4 py-1.5 bg-white/60 backdrop-blur-md rounded-full text-[10px] font-bold text-pink-deep border border-pink-medium shadow-sm uppercase tracking-wider">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  
                  <motion.div
                    initial={{ opacity: 0, x: msg.senderId === user.uid ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 150 }}
                    dragSnapToOrigin
                    dragElastic={{ left: 0, right: 0.5 }}
                    dragDirectionLock
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 70) {
                        setReplyingTo(msg);
                      }
                    }}
                    className={`flex flex-col relative group max-w-full min-w-0 ${msg.senderId === user.uid ? 'items-end' : 'items-start'} ${isSameMinuteAsPrev ? 'mt-1' : 'mt-4'}`}
                  >
                  <div className="absolute left-[-35px] top-1/2 -translate-y-1/2 text-pink-deep opacity-0 group-drag:opacity-100 group-active:opacity-100 transition-opacity pointer-events-none">
                    <Reply className="w-4 h-4" />
                  </div>
  
                  <div className={`flex items-start gap-1 max-w-[70%] md:max-w-[70%] ${msg.senderId === user.uid ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="shrink-0 mt-1 w-8 h-8 flex items-center justify-center">
                      {showAvatar ? (
                        <button 
                          onClick={() => setSelectedUserProfile({ name: msg.senderName, photo: msg.senderPhoto })}
                          className="w-8 h-8 flex items-center justify-center transition-transform cursor-pointer"
                        >
                          {msg.senderPhoto ? (
                            <img 
                              src={getFullUrl(msg.senderPhoto)} 
                              alt={msg.senderName} 
                              className="w-8 h-8 rounded-full border-2 border-pink-medium object-cover shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full border-2 border-pink-medium bg-pink-bold text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                              {(msg.senderName || 'A').substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div className="w-8" />
                      )}
                    </div>

                    <div className={`flex flex-col min-w-0 flex-1 ${msg.senderId === user.uid ? 'items-end' : 'items-start'}`}>
                      {showName && (
                        <div className="flex items-center gap-2 mb-1 max-w-full">
                          <span className="text-[10px] font-bold text-pink-deep opacity-60 truncate">
                            {msg.senderName}
                          </span>
                        </div>
                      )}

                      <div 
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setReactionMessageId(reactionMessageId === msg.id ? null : msg.id);
                        }}
                        // Long press implementation using motion props
                        onPointerDown={(e) => {
                          const timer = setTimeout(() => {
                            setReactionMessageId(reactionMessageId === msg.id ? null : msg.id);
                          }, 500); // 500ms long press
                          (e.target as any)._longPressTimer = timer;
                        }}
                        onPointerUp={(e) => {
                          clearTimeout((e.target as any)._longPressTimer);
                        }}
                        onPointerLeave={(e) => {
                          clearTimeout((e.target as any)._longPressTimer);
                        }}
                        className={`message-bubble relative cursor-pointer active:scale-[0.98] transition-all group ${
                        msg.type === 'sticker' ? 'bg-transparent shadow-none p-0 overflow-visible' : (msg.senderId === user.uid ? 'message-sent' : 'message-received')
                      }`}>
                        {msg.replyTo && (
                          <div className={`mb-2 p-2 bg-black/5 rounded-lg border-l-4 border-pink-deep text-[10px] leading-tight ${msg.type === 'sticker' ? 'bg-white/80 backdrop-blur-sm' : ''}`}>
                            <p className="font-bold text-pink-deep mb-0.5">{msg.replyTo.senderName}</p>
                            <p className="opacity-70 line-clamp-2">{msg.replyTo.text}</p>
                          </div>
                        )}
                        
                        {/* Reaction Picker Popover */}
                        <AnimatePresence>
                          {reactionMessageId === msg.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8, y: 10 }}
                              className={`absolute bottom-[110%] mb-2 bg-white rounded-2xl border-2 border-pink-medium shadow-[0_10px_40px_rgba(0,0,0,0.15)] flex items-center gap-1 p-1.5 z-30 ${msg.senderId === user.uid ? 'right-0' : 'left-0'}`}
                            >
                              {['❤️', '😂', '😮', '🥺', '👍', '🔥'].map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReaction(msg.id, emoji);
                                  }}
                                  className="w-10 h-10 rounded-xl hover:bg-pink-soft flex items-center justify-center text-2xl active:scale-125 transition-all"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {msg.type === 'audio' ? (
                          <AudioPlayer url={getFullUrl(msg.audioURL!)} duration={msg.audioDuration} />
                        ) : msg.type === 'sticker' ? (
                          <div className="relative group">
                            <motion.img 
                              src={getFullUrl(msg.stickerUrl!)} 
                              alt="sticker" 
                              className="w-32 h-32 object-contain"
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              whileHover={{ scale: 1.1 }}
                            />
                            {/* Save sticker button */}
                            <button 
                              onClick={() => saveSticker(msg.stickerUrl!)}
                              className="absolute -right-2 -bottom-2 bg-white rounded-full p-1.5 shadow-sm border border-pink-medium text-pink-deep opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                              title="Save to collection"
                            >
                              <Heart className="w-3 h-3 fill-current" />
                            </button>
                          </div>
                        ) : (
                          <>
                            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                            {msg.imageUrl && (
                              <div className="mt-2 relative group">
                                <img src={getFullUrl(msg.imageUrl)} alt="chat" className="rounded-xl w-full max-h-64 object-cover" />
                                <button 
                                  onClick={() => saveSticker(msg.imageUrl!)}
                                  className="absolute right-2 bottom-2 bg-white/80 backdrop-blur-sm rounded-full p-2 text-pink-deep opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white flex items-center gap-1 shadow-sm"
                                >
                                  <Heart className="w-3 h-3 fill-current" />
                                  <span className="text-[8px] font-black tracking-tighter">SAVE AS STICKER</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Display Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-[-10px] z-10 relative px-2 ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                          <div className="flex flex-wrap gap-0.5 p-0.5 bg-white/90 backdrop-blur-sm rounded-full border border-pink-medium shadow-sm">
                            {Object.entries(msg.reactions).map(([emoji, users]) => {
                              const userList = users as string[];
                              return (
                                <button
                                  key={emoji}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReaction(msg.id, emoji);
                                  }}
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-all hover:bg-pink-soft ${
                                    userList.includes(user.uid) 
                                      ? 'bg-pink-soft' 
                                      : 'bg-transparent'
                                  }`}
                                >
                                  <span className="text-[12px]">{emoji}</span>
                                  <span className={`text-[9px] font-black ${userList.includes(user.uid) ? 'text-pink-deep' : 'text-pink-bold'}`}>{userList.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {showTime && (
                        <div className={`flex items-center gap-1 mt-1 px-2 ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[9px] font-medium text-pink-bold opacity-50">
                            {format(getMessageDate(msg), 'HH:mm')}
                          </span>
                          {msg.senderId === user.uid && (
                            <div className="flex items-center ml-1">
                              {msg.createdAt && (globalLastRead >= (typeof msg.createdAt === 'number' ? msg.createdAt : (msg.createdAt.toDate ? msg.createdAt.toDate().getTime() : new Date(msg.createdAt).getTime()))) ? (
                                <motion.div 
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex -space-x-1.5"
                                >
                                  <Check className="w-2.5 h-2.5 text-pink-deep" strokeWidth={4} />
                                  <Check className="w-2.5 h-2.5 text-pink-deep" strokeWidth={4} />
                                </motion.div>
                              ) : (
                                <Check className="w-2.5 h-2.5 text-pink-bold opacity-30" strokeWidth={3} />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
            })}
          </AnimatePresence>
          )}

          {typingUsers.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-2 py-1"
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-pink-deep rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-pink-deep rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-pink-deep rounded-full animate-bounce"></span>
              </div>
              <span className="text-[10px] font-bold text-pink-deep italic">
                {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            </motion.div>
          )}
        </div>

        <motion.footer 
          animate={{ 
            backgroundColor: showVirtualKeyboard ? 'rgba(255, 182, 193, 0.2)' : 'rgba(255, 255, 255, 1)',
            padding: showVirtualKeyboard ? '4px' : '8px'
          }}
          transition={{ duration: 0.1 }}
          className="shrink-0 z-20 border-t-2 border-pink-medium"
        >
          <AnimatePresence>
            {replyingTo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-2"
              >
                <div className="bg-pink-soft p-3 rounded-2xl border-l-4 border-pink-deep flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-pink-deep uppercase tracking-wider mb-0.5">Replying to {replyingTo.senderName}</p>
                    <p className="text-xs text-ink opacity-70 truncate italic">"{replyingTo.text}"</p>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-pink-deep hover:text-white rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <form onSubmit={sendMessage} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (showStickerPicker) {
                        setShowStickerPicker(false);
                        setShowVirtualKeyboard(true);
                      } else {
                        setShowStickerPicker(true);
                        setShowVirtualKeyboard(false);
                      }
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                      showStickerPicker ? 'bg-pink-deep text-white' : 'bg-pink-soft text-pink-deep border border-pink-medium'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                  </button>
                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-3 bg-pink-soft px-4 h-10 rounded-full border border-pink-medium">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold text-pink-deep tabular-nums">
                        Recording: {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                      </span>
                      <div className="flex-1" />
                      <button 
                        type="button"
                        onClick={cancelRecording}
                        className="p-1 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="none"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onFocus={() => {
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        if (isMobile) {
                          setShowVirtualKeyboard(true);
                          setShowStickerPicker(false);
                        }
                      }}
                      onClick={() => {
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        if (isMobile) {
                          setShowVirtualKeyboard(true);
                          setShowStickerPicker(false);
                        }
                      }}
                      placeholder="Say something mbull..."
                      className="bold-input flex-1 tracking-tight text-base placeholder:text-pink-medium/60 py-1.5 h-10 px-4 caret-pink-deep"
                    />
                  )}
                </div>

                {!newMessage.trim() ? (
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md active:opacity-80 shrink-0 ${
                      isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-pink-deep text-white hover:bg-ink'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="w-10 h-10 bg-pink-deep text-white rounded-full flex items-center justify-center hover:bg-ink transition-all shadow-md active:opacity-80 disabled:opacity-50 shrink-0"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                )}
              </div>
          </form>
        </motion.footer>
        
        <div className="flex flex-col shrink-0">
          {renderStickerPicker()}
          <VirtualKeyboard 
            isOpen={showVirtualKeyboard}
            onInput={handleVirtualInput}
            onBackspace={handleVirtualBackspace}
            onSend={handleVirtualSend}
            onClose={handleVirtualClose}
          />
        </div>
        <input 
          type="file" 
          ref={stickerUploadRef} 
          onChange={handleStickerUpload} 
          accept="image/*" 
          className="hidden" 
        />
      </main>

      {/* Other User Profile Popup */}
      <AnimatePresence>
        {selectedUserProfile && (
          <div 
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-md"
            onClick={() => setSelectedUserProfile(null)}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[90vmin] aspect-square bg-white rounded-[40px] border-4 border-pink-medium shadow-2xl overflow-hidden flex flex-col"
            >
              <button 
                onClick={() => setSelectedUserProfile(null)}
                className="absolute top-6 right-6 z-10 p-3 bg-white/80 backdrop-blur-md text-pink-deep rounded-full shadow-lg hover:bg-pink-deep hover:text-white transition-all active:opacity-80"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex-1 w-full relative bg-pink-soft flex items-center justify-center overflow-hidden">
                {selectedUserProfile.photo ? (
                  <img 
                    src={getFullUrl(selectedUserProfile.photo)} 
                    alt={selectedUserProfile.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-pink-bold text-white text-9xl font-black italic">
                    {selectedUserProfile.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-[40px] border-4 border-pink-medium shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 border-b-2 border-pink-medium bg-pink-soft">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-3xl font-bold italic tracking-tighter text-ink truncate pr-8">
                    {user.displayName || 'My Profile'}
                  </h3>
                  <button onClick={() => setShowProfile(false)} className="p-2 bg-white rounded-full shadow-sm hover:bg-pink-deep hover:text-white transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div 
                  className="relative w-24 h-24 mx-auto mb-4 cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-full h-full rounded-[30px] bg-pink-bold border-4 border-white shadow-xl flex items-center justify-center overflow-hidden transition-transform">
                    {profilePhoto ? (
                      <img src={getFullUrl(profilePhoto)} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-white uppercase">{user.displayName?.substring(0, 2)}</span>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-full shadow-lg border-2 border-pink-medium group-hover:bg-pink-deep group-hover:text-white transition-colors">
                    <Camera className="w-4 h-4" />
                  </div>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-pink-deep mb-2 ml-1">Display Name</label>
                  <input 
                    type="text" 
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="bold-input w-full text-sm"
                    placeholder="Your name..."
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={updatingProfile}
                  className="w-full py-4 bg-pink-deep text-white rounded-3xl font-bold uppercase tracking-widest shadow-lg hover:bg-ink transition-all active:opacity-80 disabled:opacity-50"
                >
                  {updatingProfile ? 'SAVING...' : 'SAVE CHANGES'}
                </button>

                <div className="pt-4 border-t border-pink-medium space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-pink-deep text-center mb-3">Settings & Maintenance</p>
                  
                  <button 
                    type="button"
                    onClick={requestNotificationPermission}
                    className="w-full py-3 bg-white border-2 border-pink-medium text-pink-deep rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-pink-soft transition-all active:opacity-80 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {notificationPermission === 'granted' ? 'Notifications Active' : 'Enable Notifications'}
                  </button>

                  <button 
                    type="button"
                    onClick={onLogout}
                    className="w-full py-3 bg-pink-soft text-pink-deep rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-pink-medium transition-all active:opacity-80 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cropper Modal Overlay */}
      <AnimatePresence>
        {imageToCrop && (
          <div className="fixed inset-0 z-[110] flex flex-col bg-ink backdrop-blur-md">
            <div className="flex items-center justify-between p-6 text-white bg-ink/50 border-b border-white/10 z-10">
              <button 
                onClick={() => setImageToCrop(null)}
                className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all font-bold"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-bold italic tracking-tight">Atur Foto Profil</h3>
              <button 
                onClick={handleCropSave}
                className="p-3 bg-pink-deep text-white rounded-full hover:bg-pink-bold transition-all shadow-lg active:opacity-80"
              >
                <Check className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 relative bg-black">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1} // Square crop for WhatsApp feel
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                cropShape="round" // Round crop overlay for visual guidance
                showGrid={false}
              />
            </div>

            <div className="p-8 pb-12 bg-ink/50 border-t border-white/10">
              <div className="max-w-xs mx-auto">
                <p className="text-center text-[10px] font-bold text-white/60 uppercase tracking-widest mb-6 italic">
                  Geser dan zoom fotonya sesuai keinginan mbull ✨
                </p>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-deep"
                />
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

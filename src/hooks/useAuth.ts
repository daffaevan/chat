import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser,
  updateProfile as updateFirebaseProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';

export interface LocalUser {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  photoURL?: string;
  lastSeen?: number;
}

export function useAuth() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      console.log("[AUTH] State changed. User:", fbUser?.uid);
      clearTimeout(timeoutId);
      
      if (fbUser) {
        try {
          console.log(`[AUTH] Fetching profile for ${fbUser.uid}...`);
          const profileDoc = await getDoc(doc(db, 'profiles', fbUser.uid));
          
          if (profileDoc.exists()) {
            const profileData = profileDoc.data();
            console.log("[AUTH] Profile found in Firestore:", profileData);
            setUser({
              uid: fbUser.uid,
              email: fbUser.email || profileData.email || '',
              username: profileData.username,
              displayName: profileData.displayName || fbUser.displayName || profileData.username,
              photoURL: profileData.photoURL || fbUser.photoURL || undefined,
              lastSeen: profileData.lastSeen
            });

            // Update last seen (non-blocking)
            updateDoc(doc(db, 'profiles', fbUser.uid), {
              lastSeen: Date.now()
            }).catch(e => console.warn("Failed to update last seen:", e));
          } else {
            console.log("[AUTH] Profile not found in Firestore, using Auth fallback");
            const username = fbUser.email?.split('@')[0] || fbUser.displayName?.replace(/\s+/g, '').toLowerCase() || 'user';
            const fallbackData: LocalUser = {
              uid: fbUser.uid,
              username,
              displayName: fbUser.displayName || username,
              email: fbUser.email || '',
              photoURL: fbUser.photoURL || '',
              lastSeen: Date.now()
            };
            setUser(fallbackData);

            // Auto-create profile if missing
            setDoc(doc(db, 'profiles', fbUser.uid), {
              ...fallbackData,
              createdAt: serverTimestamp()
            }, { merge: true }).catch(e => console.error("Failed to auto-create profile:", e));
          }
        } catch (err) {
          console.error("[AUTH] Error loading profile:", err);
          setUser({
            uid: fbUser.uid,
            email: fbUser.email || '',
            username: fbUser.email?.split('@')[0] || 'user',
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            photoURL: fbUser.photoURL || undefined
          });
        }
      } else {
        console.log("[AUTH] User is null");
        setUser(null);
      }
      console.log("[AUTH] Setting loading to false");
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  const signUp = async (username: string, pass: string, name: string) => {
    setError(null);
    const normalizedUsername = username.toLowerCase().trim();
    const email = `${normalizedUsername}@pinkchat.local`;
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const fbUser = userCredential.user;

      const profileData: LocalUser = {
        uid: fbUser.uid,
        username: normalizedUsername,
        displayName: name || normalizedUsername,
        email: email,
        photoURL: '',
        lastSeen: Date.now()
      };

      // Create profile in Firestore
      await setDoc(doc(db, 'profiles', fbUser.uid), {
        ...profileData,
        createdAt: serverTimestamp()
      });

      // Update Firebase Profile
      await updateFirebaseProfile(fbUser, {
        displayName: name || normalizedUsername
      });

      setUser(profileData);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signIn = async (username: string, pass: string) => {
    setError(null);
    const normalizedUsername = username.toLowerCase().trim();
    const email = `${normalizedUsername}@pinkchat.local`;
    
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Username atau password salah nih mbull! 💔");
      } else {
        setError(err.message);
      }
      throw err;
    }
  };

  const logout = () => {
    signOut(auth);
  };

  const refreshUser = async () => {
    if (!auth.currentUser) return;
    try {
      console.log("[AUTH] Refreshing user data from Firestore...");
      const profileDoc = await getDoc(doc(db, 'profiles', auth.currentUser.uid));
      if (profileDoc.exists()) {
        const profileData = profileDoc.data();
        console.log("[AUTH] Refreshed profile data:", profileData);
        setUser({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || profileData.email || '',
          username: profileData.username,
          displayName: profileData.displayName || auth.currentUser.displayName || profileData.username,
          photoURL: profileData.photoURL || auth.currentUser.photoURL || undefined,
          lastSeen: profileData.lastSeen
        });
      }
    } catch (err) {
      console.error("[AUTH] Error refreshing user:", err);
    }
  };

  const forceStopLoading = () => {
    console.log("[AUTH] Force stopping loading state");
    setLoading(false);
  };

  return { user, loading, error, signIn, signUp, logout, refreshUser, forceStopLoading };
}


import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [business, setBusiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const businessRef = doc(db, 'businesses', firebaseUser.uid)
          const snap = await getDoc(businessRef)
          if (snap.exists()) setBusiness(snap.data())
          else setBusiness(null)
        } catch (err) {
          // Firestore rules not deployed or insufficient permissions – continue without business doc
          console.warn('Firestore read failed (check rules):', err.message)
          setBusiness(null)
        }
      } else {
        setBusiness(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signUp = async (email, password, businessData) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    try {
      await setDoc(doc(db, 'businesses', cred.user.uid), {
        business_id: cred.user.uid,
        business_name: businessData?.business_name || '',
        gstin: businessData?.gstin || '',
        owner_name: businessData?.owner_name || '',
        owner_phone: businessData?.owner_phone || '',
        gst_registered: businessData?.gst_registered ?? false,
        business_type: businessData?.business_type || '',
        business_address: businessData?.business_address || '',
        state_code: businessData?.state_code || '',
        created_at: new Date(),
        settings: {
          preferred_language: 'hi',
          auto_filing_enabled: false,
          notification_preferences: {},
        },
      })
    } catch (err) {
      // Firestore rules not deployed or insufficient permissions – user is still signed in
      console.warn('Could not save business profile (check Firestore rules):', err.message)
    }
    return cred
  }

  const signInWithGoogle = () => {
    const provider = new GoogleAuthProvider()
    return signInWithPopup(auth, provider)
  }

  const signOut = () => firebaseSignOut(auth)

  const enableDemoMode = () => {
    setDemoMode(true)
    setBusiness({
      business_id: 'demo',
      business_name: 'Ramesh Textiles Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      owner_name: 'Ramesh Kumar',
      owner_phone: '+91 98765 43210',
      settings: { preferred_language: 'hi', auto_filing_enabled: true },
    })
    setUser({ uid: 'demo', email: 'demo@taxsetu.app' })
  }

  const disableDemoMode = () => {
    setDemoMode(false)
    setUser(null)
    setBusiness(null)
  }

  const value = {
    user,
    business,
    loading,
    demoMode,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    enableDemoMode,
    disableDemoMode,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

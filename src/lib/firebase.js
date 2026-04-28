import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: "AIzaSyCn6xcIgvERHzUW-JzE5eDzbr6CyjK_TqM",
  authDomain: "podnotes-eed71.firebaseapp.com",
  projectId: "podnotes-eed71",
  storageBucket: "podnotes-eed71.firebasestorage.app",
  messagingSenderId: "595561280860",
  appId: "1:595561280860:web:a925d1c09bbf770aa93d99"
}

const app = initializeApp(firebaseConfig)
export { app }
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, 'asia-south1')
export default app

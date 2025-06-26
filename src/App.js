import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- Firebase Configuration and Initialization ---
// Estas configurações serão lidas das variáveis de ambiente definidas no seu provedor de hospedagem (ex: Netlify/Vercel).
// Certifique-se de que estas variáveis estejam configuradas no seu ambiente de deploy.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  // measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID // Opcional, se você for usar o Google Analytics para Firebase
};

// O appId para uso interno do Canvas ou para identificar a aplicação
const appId = process.env.REACT_APP_FIREBASE_APP_ID || 'default-app-id'; 

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Context for Firebase and User ---
const FirebaseContext = createContext(null);

// AuthWrapper Component: Handles Firebase Auth and provides context to children
function AuthWrapper({ children }) {
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState(''); // New state for user's chosen name
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false); // To show name input modal

  useEffect(() => {
    const authenticate = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erro ao autenticar:", error);
        try {
          await signInAnonymously(auth);
        } catch (anonError) {
          console.error("Erro ao autenticar anonimamente:", anonError);
        }
      } finally {
        setLoadingAuth(false);
      }
    };

    authenticate();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthenticated(true);
        // Check if user name is already stored in local storage
        const storedName = localStorage.getItem(`user_name_${user.uid}`);
        if (storedName) {
          setUserName(storedName);
        } else {
          setShowNameModal(true); // Ask for name if not found
        }
      } else {
        setUserId(null);
        setUserName('');
        setIsAuthenticated(false);
        setShowNameModal(false);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe(); // Cleanup subscription
  }, []);

  const handleSaveName = (name) => {
    setUserName(name);
    if (userId) {
      localStorage.setItem(`user_name_${userId}`, name);
    }
    setShowNameModal(false);
  };

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white text-xl">
        A carregar autenticação...
      </div>
    );
  }

  return (
    <FirebaseContext.Provider value={{ db, auth, userId, userName, isAuthenticated }}>
      {children}
      {showNameModal && (
        <NameInputModal onSave={handleSaveName} />
      )}
    </FirebaseContext.Provider>
  );
}

// Name Input Modal Component
function NameInputModal({ onSave }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-sm w-full space-y-6">
        <h2 className="text-2xl font-bold text-white text-center">Qual é o seu nome?</h2>
        <p className="text-gray-300 text-center">Isso nos ajudará a saber quem adicionou os momentos!</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome ou apelido"
            className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            required
          />
          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75"
          >
            Salvar Nome
          </button>
        </form>
      </div>
    </div>
  );
}


// --- Main App Component (now the content) ---
function AppContent() { // Renamed from App to AppContent
  const [view, setView] = useState('moments'); // 'moments', 'journal', 'purpose'
  const { userName, userId } = useContext(FirebaseContext); // Safely get userName and userId from context

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 md:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-purple-400 mb-2">
          Nossa Constelação de Momentos
        </h1>
        <p className="text-lg sm:text-xl text-gray-300">
          A jornada de {userName || 'Nico'} e Aniqua
        </p>
        {userName && (
          <p className="text-sm text-gray-400 mt-2">
            ID do Utilizador: <span className="font-mono text-xs text-gray-500">{userId || 'N/A'}</span>
          </p>
        )}
      </header>

      <nav className="flex justify-center space-x-4 sm:space-x-8 mb-8">
        <button
          onClick={() => setView('moments')}
          className={`px-4 py-2 sm:px-6 sm:py-3 rounded-full text-lg font-semibold transition-all duration-300

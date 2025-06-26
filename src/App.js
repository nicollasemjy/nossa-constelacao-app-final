import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics"; 

// --- Firebase Configuration and Initialization ---
// Adapta a configuração do Firebase para diferentes ambientes:
// 1. Ambiente Canvas (usa __app_id, __firebase_config, __initial_auth_token)
// 2. Ambiente de Build/Deploy de React (usa process.env.REACT_APP_FIREBASE_...)
// 3. Fallback para ambiente local de desenvolvimento (usa valores fixos se env vars não definidas)

let firebaseConfig = {};
let appId = 'default-app-id-fallback'; // Valor padrão para desenvolvimento local ou caso appId não seja encontrado
let initialAuthToken = null; // Token de autenticação inicial (apenas para ambiente Canvas)

// Configuração do Firebase para o projeto 'minhas-reflexoes' (FIXA - para fallback e clareza)
// Estes são os VALORES REAIS do seu projeto Firebase "minhas-reflexoes"
const MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA = {
  apiKey: "AIzaSyATKwnmsf8eDP9cvSWIs03QLv3PRb7P8FM",
  authDomain: "minhas-reflexoes.firebaseapp.com",
  projectId: "minhas-reflexoes",
  storageBucket: "minhas-reflexoes.firebasestorage.app",
  messagingSenderId: "454506217890",
  appId: "1:454506217890:web:740b14382d4f163c53b2fb",
  measurementId: "G-SNK166LL8P"
};

// Lógica de carregamento da configuração do Firebase
// Prioriza variáveis globais do Canvas se existirem (para o ambiente Canvas)
if (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined' && typeof window.__firebase_config !== 'undefined') {
  try {
    firebaseConfig = JSON.parse(window.__firebase_config);
    appId = window.__app_id;
    initialAuthToken = window.__initial_auth_token;
  } catch (e) {
    console.error("Erro ao fazer parse de __firebase_config no ambiente Canvas, utilizando fallback:", e);
    firebaseConfig = MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA;
    appId = MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA.appId;
  }
} 
// Se não estiver no ambiente Canvas, tenta carregar do process.env (para builds React normais, incluindo Netlify)
else if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && process.env.REACT_APP_FIREBASE_API_KEY) {
  // Para desenvolvimento local com .env
  firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET, 
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, 
  };
  appId = process.env.REACT_APP_FIREBASE_APP_ID || MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA.appId;
} else if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production' && process.env.REACT_APP_FIREBASE_API_KEY) {
  // Para builds de produção (Netlify). As variáveis já deveriam estar injetadas.
  firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET, 
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, 
  };
  appId = process.env.REACT_APP_FIREBASE_APP_ID || MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA.appId;
}
else {
  // Cenário onde não há variáveis do Canvas, nem process.env (ou .env não configurado corretamente localmente)
  // Usa a configuração fixa do projeto 'minhas-reflexoes' como último recurso.
  console.warn("Configuração do Firebase não encontrada via variáveis de ambiente. Utilizando configuração fallback fixa.");
  firebaseConfig = MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA;
  appId = MINHAS_REFLEXOES_FIREBASE_CONFIG_FIXA.appId;
}


// Initialize Firebase App
// Verifica se firebaseConfig está preenchida antes de inicializar o app
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;
// Inicializa Analytics apenas se measurementId estiver presente na config E se 'app' for válido
// eslint-disable-next-line no-unused-vars
const analytics = (app && firebaseConfig.measurementId) ? getAnalytics(app) : null; 


// --- Context for Firebase and User ---
// Fornece um objeto padrão caso db, auth, etc. sejam null
const FirebaseContext = createContext({
  db: null,
  auth: null,
  userId: null,
  userName: '',
  isAuthenticated: false,
});

// AuthWrapper Component: Handles Firebase Auth and provides context to children
function AuthWrapper({ children }) {
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState(''); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false); 

  useEffect(() => {
    const authenticate = async () => {
      // Verifica se 'auth' está inicializado antes de usar
      if (!auth) {
        setLoadingAuth(false);
        console.error("Firebase Auth não inicializado. Verifique a configuração do Firebase.");
        return;
      }
      setLoadingAuth(true); 
      try {
        if (initialAuthToken) { // initialAuthToken é do ambiente Canvas
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erro ao autenticar:", error);
      } finally {
        setLoadingAuth(false); 
      }
    };

    authenticate();

    // Verifica se 'auth' está inicializado antes de usar onAuthStateChanged
    if (!auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthenticated(true);
        const storedName = localStorage.getItem(`user_name_${user.uid}`);
        if (storedName) {
          setUserName(storedName);
        } else {
          setShowNameModal(true);
        }
      } else {
        setUserId(null);
        setUserName('');
        setIsAuthenticated(false);
        setShowNameModal(false);
      }
      setLoadingAuth(false); 
    });

    return () => unsubscribe(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, initialAuthToken, setLoadingAuth]);


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
function AppContent() { // Removido erro de digitação de App to AppContent
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
          className={`px-4 py-2 sm:px-6 sm:py-3 rounded-full text-lg font-semibold transition-all duration-300 ${
            view === 'moments'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Nossa Jornada
        </button>
        <button
          onClick={() => setView('journal')}
          className={`px-4 py-2 sm:px-6 sm:py-3 rounded-full text-lg font-semibold transition-all duration-300 ${
            view === 'journal'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Nosso Diário
        </button>
        <button
          onClick={() => setView('purpose')}
          className={`px-4 py-2 sm:px-6 sm:py-3 rounded-full text-lg font-semibold transition-all duration-300 ${
            view === 'purpose'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Nosso Propósito
        </button>
      </nav>

      <main className="max-w-4xl mx-auto bg-gray-800 rounded-3xl shadow-xl p-6 sm:p-8">
        {view === 'moments' && <JourneyMoments />}
        {view === 'journal' && <OurJournal />}
        {view === 'purpose' && <OurPurpose />}
      </main>
    </div>
  );
}

// Utility function to format date
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Data desconhecida';
  const date = new Date(timestamp.seconds * 1000);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  return date.toLocaleDateString('pt-BR');
};


// --- Journey Moments Component ---
function JourneyMoments() {
  const { db, userId, userName, isAuthenticated } = useContext(FirebaseContext);
  const [moments, setMoments] = useState([]);
  const [newMomentTitle, setNewMomentTitle] = useState('');
  const [newMomentDescription, setNewMomentDescription] = useState('');
  const [newMomentType, setNewMomentType] = useState('star');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // New state for error messages
  const [isSubmitting, setIsSubmitting] = useState(false); // New state for submission loading

  const [editingMomentId, setEditingMomentId] = useState(null);
  const [editMomentTitle, setEditMomentTitle] = useState('');
  const [editMomentDescription, setEditMomentDescription] = useState('');
  const [editMomentType, setEditMomentType] = useState('star');

  // momentsCollectionRef usa 'appId' que vem do contexto global
  const momentsCollectionRef = collection(db, `artifacts/${appId}/public/data/journey_moments`);

  useEffect(() => {
    if (!db || !isAuthenticated || !momentsCollectionRef) {
      setLoading(false);
      return;
    }

    setError(null); 
    const q = query(momentsCollectionRef, orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMoments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMoments(fetchedMoments);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar momentos:", err);
      setError("Erro ao carregar momentos. Verifique suas permissões.");
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, isAuthenticated, momentsCollectionRef, setLoading, setError]); // Dependências corrigidas

  const addMoment = async (e) => {
    e.preventDefault();
    if (!newMomentTitle.trim() || !isAuthenticated || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await addDoc(momentsCollectionRef, {
        title: newMomentTitle.trim(),
        description: newMomentDescription.trim(),
        type: newMomentType,
        date: serverTimestamp(),
        addedBy: userId,
        addedByName: userName || 'Anónimo', // Add user's chosen name
      });
      setNewMomentTitle('');
      setNewMomentDescription('');
      setNewMomentType('star');
    } catch (err) {
      console.error("Erro ao adicionar momento:", err);
      setError("Erro ao adicionar momento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingMoment = (moment) => {
    setEditingMomentId(moment.id);
    setEditMomentTitle(moment.title);
    setEditMomentDescription(moment.description || '');
    setEditMomentType(moment.type);
  };

  const cancelEditingMoment = () => {
    setEditingMomentId(null);
    setEditMomentTitle('');
    setEditMomentDescription('');
    setEditMomentType('star');
  };

  const updateMoment = async (e) => {
    e.preventDefault();
    if (!editMomentTitle.trim() || !isAuthenticated || isSubmitting || !editingMomentId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const momentDocRef = doc(db, `artifacts/${appId}/public/data/journey_moments`, editingMomentId);
      await updateDoc(momentDocRef, {
        title: editMomentTitle.trim(),
        description: editMomentDescription.trim(),
        type: editMomentType,
        // No need to update addedBy/Name/Date unless specifically required
      });
      cancelEditingMoment();
    } catch (err) {
      console.error("Erro ao atualizar momento:", err);
      setError("Erro ao atualizar momento. Verifique suas permissões ou se você é o criador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMoment = async (id, addedById) => {
    if (!isAuthenticated || userId !== addedById) {
      setError("Você não tem permissão para excluir este momento.");
      return;
    }
    setError(null);
    if (window.confirm("Tem certeza que deseja excluir este momento?")) { // Use confirm for simplicity, custom modal for production
      try {
        const momentDocRef = doc(db, `artifacts/${appId}/public/data/journey_moments`, id);
        await deleteDoc(momentDocRef);
      } catch (err) {
        console.error("Erro ao excluir momento:", err);
        setError("Erro ao excluir momento. Verifique suas permissões.");
      }
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'star': return '⭐';
      case 'cloud': return '☁️';
      case 'milestone': return '✅';
      default: return '✨';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'star': return 'text-yellow-400';
      case 'cloud': return 'text-gray-400';
      case 'milestone': return 'text-green-400';
      default: return 'text-gray-300';
    }
  };

  if (loading) {
    return <p className="text-center text-gray-400">A carregar momentos...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-purple-300 mb-4 text-center">Nossa Jornada</h2>

      <form onSubmit={addMoment} className="bg-gray-700 p-6 rounded-2xl shadow-inner space-y-4">
        <h3 className="text-xl font-semibold text-gray-200">Adicionar um Novo Momento</h3>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div>
          <label htmlFor="moment-title" className="block text-gray-300 text-sm font-medium mb-1">
            Título do Momento
          </label>
          <input
            id="moment-title"
            type="text"
            value={newMomentTitle}
            onChange={(e) => setNewMomentTitle(e.target.value)}
            placeholder="Ex: Nosso primeiro encontro, Passei no Detran!"
            className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-y"
            required
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label htmlFor="moment-description" className="block text-gray-300 text-sm font-medium mb-1">
            Descrição (opcional)
          </label>
          <textarea
            id="moment-description"
            value={newMomentDescription}
            onChange={(e) => setNewMomentDescription(e.target.value)}
            placeholder="Detalhes sobre este momento..."
            rows="3"
            className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-y"
            disabled={isSubmitting}
          ></textarea>
        </div>
        <div>
          <label htmlFor="moment-type" className="block text-gray-300 text-sm font-medium mb-1">
            Tipo de Momento
          </label>
          <select
            id="moment-type"
            value={newMomentType}
            onChange={(e) => setNewMomentType(e.target.value)}
            className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            disabled={isSubmitting}
          >
            <option value="star">⭐ Momento de Luz / Conexão</option>
            <option value="cloud">☁️ Desafio / Obstáculo</option>
            <option value="milestone">✅ Conquista / Marco</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-purple-500 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'A adicionar...' : 'Adicionar Momento'}
        </button>
      </form>

      {moments.length === 0 ? (
        <p className="text-center text-gray-400 mt-8">Nenhum momento registado ainda. Que tal adicionar o primeiro?</p>
      ) : (
        <div className="space-y-4 mt-8">
          {moments.map((moment) => (
            <div
              key={moment.id}
              className={`flex flex-col items-start bg-gray-700 p-4 rounded-xl shadow-md ${getTypeColor(moment.type)}`}
            >
              {editingMomentId === moment.id ? (
                // Edit form
                <form onSubmit={updateMoment} className="w-full space-y-3">
                  <input
                    type="text"
                    value={editMomentTitle}
                    onChange={(e) => setEditMomentTitle(e.target.value)}
                    className="w-full p-2 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 outline-none"
                    required
                    disabled={isSubmitting}
                  />
                  <textarea
                    value={editMomentDescription}
                    onChange={(e) => setEditMomentDescription(e.target.value)}
                    rows="2"
                    className="w-full p-2 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 outline-none resize-y"
                    disabled={isSubmitting}
                  ></textarea>
                  <select
                    value={editMomentType}
                    onChange={(e) => setEditMomentType(e.target.value)}
                    className="w-full p-2 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 outline-none"
                    disabled={isSubmitting}
                  >
                    <option value="star">⭐ Momento de Luz / Conexão</option>
                    <option value="cloud">☁️ Desafio / Obstáculo</option>
                    <option value="milestone">✅ Conquista / Marco</option>
                  </select>
                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      type="button"
                      onClick={cancelEditingMoment}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm transition"
                      disabled={isSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm transition"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'A salvar...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              ) : (
                // Display mode
                <>
                  <div className="flex items-start w-full">
                    <span className="text-2xl mr-3">{getIcon(moment.type)}</span>
                    <div className="flex-1">
                      <h4 className="text-xl font-semibold text-gray-100">{moment.title}</h4>
                      {moment.description && (
                        <p className="text-gray-300 text-sm mt-1">{moment.description}</p>
                      )}
                      <p className="text-gray-400 text-xs mt-2">
                        Adicionado por {moment.addedByName || 'Anónimo'} em {formatTimestamp(moment.date)}
                      </p>
                    </div>
                    {isAuthenticated && userId === moment.addedBy && (
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => startEditingMoment(moment)}
                          className="text-blue-400 hover:text-blue-300 transition"
                          title="Editar Momento"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteMoment(moment.id, moment.addedBy)}
                          className="text-red-400 hover:text-red-300 transition"
                          title="Excluir Momento"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Our Journal Component ---
function OurJournal() {
  const { db, userId, userName, isAuthenticated } = useContext(FirebaseContext);
  const [entries, setEntries] = useState([]);
  const [newEntryText, setNewEntryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryText, setEditEntryText] = useState('');

  const journalCollectionRef = collection(db, `artifacts/${appId}/public/data/journal_entries`);

  useEffect(() => {
    // Adiciona as dependências necessárias para o hook useEffect
    // journalCollectionRef pode mudar se appId mudar, e
    if (!db || !isAuthenticated || !journalCollectionRef) {
      setLoading(false);
      return;
    }

    setError(null);
    const q = query(journalCollectionRef, orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEntries(fetchedEntries);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar diário:", err);
      setError("Erro ao carregar diário. Verifique suas permissões.");
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, isAuthenticated, journalCollectionRef, setLoading, setError]); // Dependências corrigidas

  const addEntry = async (e) => {
    e.preventDefault();
    if (!newEntryText.trim() || !isAuthenticated || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await addDoc(journalCollectionRef, {
        text: newEntryText.trim(),
        date: serverTimestamp(),
        addedBy: userId,
        addedByName: userName || 'Anónimo', // Add user's chosen name
      });
      setNewEntryText('');
    } catch (err) {
      console.error("Erro ao adicionar registro:", err);
      setError("Erro ao adicionar registro. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingEntry = (entry) => {
    setEditingEntryId(entry.id);
    setEditEntryText(entry.text);
  };

  const cancelEditingEntry = () => {
    setEditingEntryId(null);
    setEditEntryText('');
  };

  const updateEntry = async (e) => {
    e.preventDefault();
    if (!editEntryText.trim() || !isAuthenticated || isSubmitting || !editingEntryId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const entryDocRef = doc(db, `artifacts/${appId}/public/data/journal_entries`, editingEntryId);
      await updateDoc(entryDocRef, {
        text: editEntryText.trim(),
      });
      cancelEditingEntry();
    } catch (err) {
      console.error("Erro ao atualizar registro:", err);
      setError("Erro ao atualizar registro. Verifique suas permissões ou se você é o criador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteEntry = async (id, addedById) => {
    if (!isAuthenticated || userId !== addedById) {
      setError("Você não tem permissão para excluir este registro.");
      return;
    }
    setError(null);
    if (window.confirm("Tem certeza que deseja excluir este registro?")) { // Use confirm for simplicity, custom modal for production
      try {
        const entryDocRef = doc(db, `artifacts/${appId}/public/data/journal_entries`, id);
        await deleteDoc(entryDocRef);
      } catch (err) {
        console.error("Erro ao excluir registro:", err);
        setError("Erro ao excluir registro. Verifique suas permissões.");
      }
    }
  };


  if (loading) {
    return <p className="text-center text-gray-400">A carregar diário...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-purple-300 mb-4 text-center">Nosso Diário</h2>

      <form onSubmit={addEntry} className="bg-gray-700 p-6 rounded-2xl shadow-inner space-y-4">
        <h3 className="text-xl font-semibold text-gray-200">Adicionar um Registro</h3>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div>
          <label htmlFor="journal-entry" className="block text-gray-300 text-sm font-medium mb-1">
            O que você está sentindo ou o que aconteceu?
          </label>
          <textarea
            id="journal-entry"
            value={newEntryText}
            onChange={(e) => setNewEntryText(e.target.value)}
            placeholder="Ex: Hoje me senti um pouco apático, mas dei um pequeno passo... ou: O teste do Detran me deixou ansioso, mas respirei fundo."
            rows="5"
            className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-y"
            required
            disabled={isSubmitting}
          ></textarea>
        </div>
        <button
          type="submit"
          className="w-full bg-purple-500 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'A registar...' : 'Registar no Diário'}
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-center text-gray-400 mt-8">Nenhum registro no diário ainda. Comece a partilhar!</p>
      ) : (
        <div className="space-y-4 mt-8">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-gray-700 p-4 rounded-xl shadow-md">
              {editingEntryId === entry.id ? (
                // Edit form
                <form onSubmit={updateEntry} className="w-full space-y-3">
                  <textarea
                    value={editEntryText}
                    onChange={(e) => setEditEntryText(e.target.value)}
                    rows="3"
                    className="w-full p-2 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 outline-none resize-y"
                    required
                    disabled={isSubmitting}
                  ></textarea>
                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      type="button"
                      onClick={cancelEditingEntry}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm transition"
                      disabled={isSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm transition"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'A salvar...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              ) : (
                // Display mode
                <>
                  <p className="text-gray-200 text-base">{entry.text}</p>
                  <p className="text-gray-400 text-xs mt-2">
                    Por {entry.addedByName || 'Anónimo'} em {formatTimestamp(entry.date)}
                  </p>
                  {isAuthenticated && userId === entry.addedBy && (
                    <div className="flex justify-end space-x-2 mt-2">
                      <button
                        onClick={() => startEditingEntry(entry)}
                        className="text-blue-400 hover:text-blue-300 transition"
                        title="Editar Registro"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id, entry.addedBy)}
                          className="text-red-400 hover:text-red-300 transition"
                          title="Excluir Registro"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Our Purpose Component ---
  function OurPurpose() {
    const { db, userId, isAuthenticated } = useContext(FirebaseContext);
    const [purposeText, setPurposeText] = useState('');
    const [loading, setLoading] = true;
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const purposeDocRef = doc(db, `artifacts/${appId}/public/data/our_purpose`, 'sharedPurpose');

    useEffect(() => {
      // Adiciona as dependências necessárias para o hook useEffect
      // purposeDocRef pode mudar se appId mudar, e db/isAuthenticated são essenciais para a query.
      if (!db || !isAuthenticated || !purposeDocRef) {
        setLoading(false);
        return;
      }

      setError(null);
      const unsubscribe = onSnapshot(purposeDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setPurposeText(docSnap.data().text || '');
        } else {
          setPurposeText('');
        }
        setLoading(false);
      }, (err) => {
        console.error("Erro ao carregar propósito:", err);
        setError("Erro ao carregar propósito. Verifique suas permissões.");
        setLoading(false);
      });

      return () => unsubscribe();
    }, [db, isAuthenticated, purposeDocRef, setLoading, setError]); // Dependências corrigidas

    const updatePurpose = async (e) => {
      e.preventDefault();
      if (!isAuthenticated || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);
      try {
        await setDoc(purposeDocRef, { text: purposeText.trim(), lastUpdated: serverTimestamp(), updatedBy: userId }, { merge: true });
      }
      // CORREÇÃO: Adicionado tratamento de erro para garantir que o 'finally' sempre seja executado
      catch (err) { 
        console.error("Erro ao atualizar propósito:", err);
        setError("Erro ao atualizar propósito. Tente novamente.");
      } finally {
        setIsSubmitting(false);
      }
    };

    if (loading) {
      return <p className="text-center text-gray-400">A carregar propósito...</p>;
    }

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-purple-300 mb-4 text-center">Nosso Propósito</h2>

        <p className="text-gray-300 text-center mb-6">
          Este é o nosso espaço para definir para onde estamos indo, juntos.
          Quais são nossos sonhos, grandes ou pequenos, para o nosso futuro?
        </p>

        <form onSubmit={updatePurpose} className="bg-gray-700 p-6 rounded-2xl shadow-inner space-y-4">
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          
          <div>
            <label htmlFor="purpose-text" className="block text-gray-300 text-sm font-medium mb-1">
              Escreva sobre nossos objetivos e sonhos partilhados:
            </label>
            <textarea
              id="purpose-text"
              value={purposeText}
              onChange={(e) => setPurposeText(e.target.value)}
              placeholder="Ex: Construir nossa base financeira, planear o nosso próximo encontro, apoiar os estudos um do outro, viajar juntos para X..."
              rows="8"
              className="w-full p-3 rounded-lg bg-gray-900 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-y"
              disabled={isSubmitting}
            ></textarea>
          </div>
          <button
            type="submit"
            className="w-full bg-purple-500 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'A guardar...' : 'Guardar Propósito'}
          </button>
        </form>
      </div>
    );
  }

  // --- Main App Component (now the default export) ---
  // This App component becomes the entry point and renders AuthWrapper
  export default function App() {
    return (
      // The FirebaseContext.Provider should wrap the entire AuthWrapper component
      // to ensure the context value is available to all its children.
      <FirebaseContext.Provider value={null}> 
        <AuthWrapper>
          <AppContent />
        </AuthWrapper>
      </FirebaseContext.Provider>
    );
  }

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Calendar, Wallet, Network, LayoutDashboard, 
  LogOut, Plus, Edit2, Trash2, Search, ChevronLeft, 
  ChevronRight, Camera, Image as ImageIcon, UploadCloud, X, Download, FolderPlus,
  Minus, Maximize, FileText, CheckCircle, Lock, ShieldCheck
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { 
  auth, 
  getColRef, 
  getDocRef, 
  signInAnonymously, 
  signInWithCustomToken, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  handleFirestoreError,
  OperationType
} from './firebase';

import ImageCropperModal from './ImageCropperModal';

// --- DATA SILSILAH AWAL (Mbah Sumadi, Istri 1 & Istri 2 tanpa form "Pasangan") ---
export interface Spouse {
  id: string | number;
  name: string;
  isAlive: boolean;
  photo?: string;
  birthDate?: string;
  deathDate?: string;
  domicile?: string;
  phone?: string;
}

export interface Member {
  id: number;
  name: string;
  isAlive: boolean;
  gender: 'L' | 'P';
  parentId: number | null;
  relationType?: 'child' | 'spouse';
  spouseOfId?: number | null;
  spouse?: string;
  domicile: string;
  phone: string;
  birthDate: string;
  deathDate: string | null;
  photo: string;
  spousePhoto?: string;
  spouseIsAlive?: boolean;
  spouseDomicile?: string;
  spousePhone?: string;
  spouseBirthDate?: string;
  spouseDeathDate?: string;
  spouses?: Spouse[];
}

export const getMemberSpouses = (m: Member, allMembers?: Member[]): Spouse[] => {
  const result: Spouse[] = [];
  const seenNames = new Set<string>();

  if (m.spouses && Array.isArray(m.spouses) && m.spouses.length > 0) {
    m.spouses.forEach(s => {
      if (s.name && s.name.trim() && !seenNames.has(s.name.trim().toLowerCase())) {
        result.push(s);
        seenNames.add(s.name.trim().toLowerCase());
      }
    });
  }

  if (m.spouse && m.spouse.trim() && !seenNames.has(m.spouse.trim().toLowerCase())) {
    result.push({
      id: `legacy-${m.id}`,
      name: m.spouse,
      isAlive: m.spouseIsAlive ?? true,
      photo: m.spousePhoto || '',
      domicile: m.spouseDomicile || '',
      phone: m.spousePhone || '',
      birthDate: m.spouseBirthDate || '',
      deathDate: m.spouseDeathDate || ''
    });
    seenNames.add(m.spouse.trim().toLowerCase());
  }

  // Cek jika ada anggota mandiri yang terhubung sebagai pasangan anggota ini
  if (allMembers && Array.isArray(allMembers)) {
    allMembers.forEach(m2 => {
      if (m2.id !== m.id && (m2.spouseOfId === m.id || (m2.relationType === 'spouse' && m2.parentId === m.id))) {
        if (!seenNames.has(m2.name.trim().toLowerCase())) {
          result.push({
            id: m2.id,
            name: m2.name,
            isAlive: m2.isAlive,
            photo: m2.photo || '',
            domicile: m2.domicile || '',
            phone: m2.phone || '',
            birthDate: m2.birthDate || '',
            deathDate: m2.deathDate || ''
          });
          seenNames.add(m2.name.trim().toLowerCase());
        }
      }
    });
  }

  return result;
};

export interface Agenda {
  id: number;
  date: string;
  title: string;
  location: string;
  desc: string;
}

export interface Transaction {
  id: number;
  date: string;
  type: 'in' | 'out';
  amount: number;
  desc: string;
}

export interface SliderImage {
  id: number;
  url: string;
}

export interface IuranRow {
  id: number;
  name: string;
  amount: number;
}

export interface IuranSession {
  id: number;
  title: string;
  data: IuranRow[];
}

const initialMembers: Member[] = [
  { id: 1, name: "Mbah Sumadi", isAlive: false, gender: "L", parentId: null, spouse: "", domicile: "Yogyakarta", phone: "-", birthDate: "1940-01-01", deathDate: "2010-05-10", photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 2, name: "Mbah Aminah (Istri 1)", isAlive: false, gender: "P", parentId: 1, spouse: "", domicile: "Yogyakarta", phone: "-", birthDate: "1945-03-12", deathDate: "2010-08-20", photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 3, name: "Mbah Yanti (Istri 2)", isAlive: false, gender: "P", parentId: 1, spouse: "", domicile: "Solo", phone: "-", birthDate: "1948-07-22", deathDate: "2018-11-05", photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  
  // Keturunan Istri 1
  { id: 21, name: "Budi Santoso", isAlive: true, gender: "L", parentId: 2, spouse: "Ratna", domicile: "Jakarta", phone: "08123456789", birthDate: "1970-05-15", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Jakarta", spousePhone: "08111", spouseBirthDate: "1972-01-01", spouseDeathDate: "" },
  { id: 22, name: "Ani Sumadi", isAlive: true, gender: "P", parentId: 2, spouse: "Joko", domicile: "Surabaya", phone: "08198765432", birthDate: "1975-08-20", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Surabaya", spousePhone: "08222", spouseBirthDate: "1970-02-02", spouseDeathDate: "" },
  { id: 211, name: "Andi Saputra", isAlive: true, gender: "L", parentId: 21, spouse: "Sari", domicile: "Jakarta", phone: "08111222333", birthDate: "1995-12-01", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Jakarta", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 212, name: "Risa Santoso", isAlive: true, gender: "P", parentId: 21, spouse: "Rudi", domicile: "Bandung", phone: "08555666777", birthDate: "1998-04-10", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Bandung", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 221, name: "Bima", isAlive: true, gender: "L", parentId: 22, spouse: "", domicile: "Surabaya", phone: "-", birthDate: "2000-09-09", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 2111, name: "Zeta (Cicit)", isAlive: true, gender: "P", parentId: 211, spouse: "", domicile: "Jakarta", phone: "-", birthDate: "2022-01-15", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },

  // Keturunan Istri 2
  { id: 31, name: "Tejo Kusumo", isAlive: true, gender: "L", parentId: 3, spouse: "Lina", domicile: "Semarang", phone: "082233445566", birthDate: "1972-11-11", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Semarang", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 32, name: "Siti Aisyah", isAlive: true, gender: "P", parentId: 3, spouse: "Ahmad", domicile: "Yogyakarta", phone: "087788990011", birthDate: "1978-02-25", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Yogyakarta", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 311, name: "Gilang Kusumo", isAlive: true, gender: "L", parentId: 31, spouse: "", domicile: "Semarang", phone: "-", birthDate: "2002-07-07", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 321, name: "Nisa Aisyah", isAlive: true, gender: "P", parentId: 32, spouse: "Hasan", domicile: "Yogyakarta", phone: "-", birthDate: "1999-08-08", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "Yogyakarta", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 3211, name: "Omar (Cicit)", isAlive: true, gender: "L", parentId: 321, spouse: "", domicile: "Yogyakarta", phone: "-", birthDate: "2024-05-20", deathDate: null, photo: "", spousePhoto: "", spouseIsAlive: true, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
];

const initialAgendas: Agenda[] = [
  { id: 1, date: "2026-06-15", title: "Arisan Keluarga", location: "Rumah Pak Budi, Jakarta", desc: "Membahas persiapan Idul Adha" },
  { id: 2, date: "2026-08-17", title: "Kumpul 17an Bani Sumadi", location: "Villa Puncak", desc: "Acara santai dan lomba keluarga" }
];

const initialTransactions: Transaction[] = [
  { id: 1, date: "2026-05-15", type: "in", amount: 500000, desc: "Donasi Budi" },
  { id: 2, date: "2026-05-10", type: "out", amount: 50000, desc: "Biaya admin bank" },
  { id: 3, date: "2026-05-01", type: "in", amount: 9650000, desc: "Sisa Saldo Bulan Lalu" }
];

const initialSliderImages: SliderImage[] = [
  { id: 1, url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" },
  { id: 2, url: "https://images.unsplash.com/photo-1609220136736-443140cffec6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" }
];

const initialIuranSessions: IuranSession[] = [
  {
    id: 1,
    title: "Iuran Halal Bihalal 2026",
    data: [
      { id: 101, name: "Budi Santoso", amount: 150000 },
      { id: 102, name: "Ani Sumadi", amount: 150000 },
      { id: 103, name: "Tejo Kusumo", amount: 150000 },
      { id: 104, name: "Siti Aisyah", amount: 150000 }
    ]
  }
];

// --- HELPER BASE64 ---
const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (res: string) => void) => {
  const file = e.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result as string);
    reader.readAsDataURL(file);
  }
};

// --- POPUP KONFIRMASI HAPUS (KUSTOM) ---
function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
             <Trash2 size={32} />
          </div>
          <h3 className="text-xl font-black text-gray-800 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 font-medium">{message}</p>
        </div>
        <div className="flex border-t border-gray-100 bg-gray-50">
          <button onClick={onCancel} className="flex-1 p-4 text-gray-500 font-bold border-r border-gray-100 hover:bg-gray-100 transition active:scale-95 cursor-pointer">Batal</button>
          <button onClick={onConfirm} className="flex-1 p-4 text-red-600 font-black hover:bg-red-50 transition active:scale-95 cursor-pointer">Hapus Data</button>
        </div>
      </div>
    </div>
  );
}

// --- APP UTAMA ---
export default function BaniSumadiApp() {
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [authRole, setAuthRole] = useState<'anggota' | 'admin'>(() => {
    try {
      return localStorage.getItem('bs_admin_auth') === 'true' ? 'admin' : 'anggota';
    } catch {
      return 'anggota';
    }
  });
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dash' | 'pohon' | 'anggota' | 'agenda' | 'kas' | 'iuran'>('dash');
  
  // TOAST NOTIFICATION STATE
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // State tersinkronisasi Firebase Cloud
  const [members, setMembers] = useState<Member[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sliderImages, setSliderImages] = useState<SliderImage[]>([]);
  const [iuranSessions, setIuranSessions] = useState<IuranSession[]>([]);
  const hasSeeded = useRef(false);

  // Global Toast Function
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Inisialisasi Firebase & Firestore
  useEffect(() => {
    const initFirebase = async () => {
      try {
        if (typeof (window as any).__initial_auth_token !== 'undefined' && (window as any).__initial_auth_token) {
          try {
            await signInWithCustomToken(auth, (window as any).__initial_auth_token);
          } catch (tokenErr) {
            console.warn("Custom token auth skipped:", tokenErr);
          }
        }
      } catch (e) {
        console.warn("Firebase init notice:", e);
      } finally {
        setIsFirebaseReady(true);
      }
    };
    initFirebase();
  }, []);

  // Sync Real-Time Firestore Cloud Database
  useEffect(() => {
    if (!isFirebaseReady) return;

    const seedDatabase = async () => {
      if (hasSeeded.current) return;
      hasSeeded.current = true;

      const refs = [
        { name: 'members', data: initialMembers },
        { name: 'agendas', data: initialAgendas },
        { name: 'transactions', data: initialTransactions },
        { name: 'sliderImages', data: initialSliderImages },
        { name: 'iuranSessions', data: initialIuranSessions }
      ];

      for (const {name, data} of refs) {
        try {
          const colRef = getColRef(name);
          const snap = await getDocs(colRef);
          if (snap.empty) {
            for (const item of data) {
              await setDoc(getDocRef(name, item.id), item);
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, name);
        }
      }
    };
    seedDatabase();

    const unsubscribes = [
      onSnapshot(getColRef('members'), 
        snap => setMembers(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as Member))),
        err => handleFirestoreError(err, OperationType.GET, 'members')
      ),
      onSnapshot(getColRef('agendas'), 
        snap => setAgendas(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as Agenda))),
        err => handleFirestoreError(err, OperationType.GET, 'agendas')
      ),
      onSnapshot(getColRef('transactions'), 
        snap => setTransactions(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as Transaction))),
        err => handleFirestoreError(err, OperationType.GET, 'transactions')
      ),
      onSnapshot(getColRef('sliderImages'), 
        snap => setSliderImages(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as SliderImage))),
        err => handleFirestoreError(err, OperationType.GET, 'sliderImages')
      ),
      onSnapshot(getColRef('iuranSessions'), 
        snap => setIuranSessions(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as IuranSession))),
        err => handleFirestoreError(err, OperationType.GET, 'iuranSessions')
      )
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, [isFirebaseReady]);

  const totalKas = useMemo(() => transactions.reduce((acc, curr) => curr.type === 'in' ? acc + curr.amount : acc - curr.amount, 0), [transactions]);
  const formatRupiah = (number: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  const nextAgenda = [...agendas].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).find(a => new Date(a.date) >= new Date()) || agendas[0];

  if (!isFirebaseReady) return <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center font-bold text-green-700">Menghubungkan Database Firebase...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center font-sans text-gray-800">
      <div className="w-full max-w-md bg-white shadow-xl relative pb-20 flex flex-col min-h-screen overflow-hidden">
        
        {/* GLOBAL TOAST NOTIFICATION */}
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[400] px-5 py-3 rounded-full shadow-2xl font-bold text-xs text-white animate-fade-in flex items-center w-max max-w-[90%] ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <CheckCircle size={18} className="mr-2"/> : <X size={18} className="mr-2"/>}
            {toast.message}
          </div>
        )}

        {/* HEADER */}
        <header className="bg-green-700 text-white p-3.5 sm:p-4 sticky top-0 z-20 flex justify-between items-center shadow-md">
          <div className="flex flex-col min-w-0 pr-2">
             <div className="flex items-center gap-2 flex-wrap">
               <h1 className="text-base sm:text-lg font-black tracking-wide leading-tight">
                 Keluarga Besar KH. SUMADI
               </h1>
               {authRole === 'admin' ? (
                 <span className="bg-amber-400 text-amber-950 font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm shrink-0">
                   <ShieldCheck size={11} /> Admin
                 </span>
               ) : (
                 <span className="bg-green-800/90 text-green-200 font-semibold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                   Anggota
                 </span>
               )}
             </div>
             <span className="text-[10px] font-medium text-green-100 opacity-90 tracking-normal mt-0.5 truncate">
               Menjalin Silaturrahim, Mempererat Persaudaraan
             </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {authRole === 'admin' ? (
              <button 
                onClick={() => {
                  setAuthRole('anggota');
                  try { localStorage.removeItem('bs_admin_auth'); } catch {}
                  showToast('Keluar dari mode Admin (Mode Anggota aktif)', 'success');
                }} 
                className="px-2.5 sm:px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari Admin"
              >
                <LogOut size={14} />
                <span>Keluar Admin</span>
              </button>
            ) : (
              <button 
                onClick={() => setIsAdminLoginOpen(true)} 
                className="px-2.5 sm:px-3 py-1.5 bg-green-600 hover:bg-green-500 border border-green-500 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                title="Masuk sebagai Admin"
              >
                <Lock size={14} />
                <span>Login Admin</span>
              </button>
            )}
          </div>
        </header>

        {/* NAVIGATION TABS */}
        <nav className="flex justify-between px-2 py-3 bg-white border-b border-gray-200 sticky top-[64px] z-20 shadow-sm gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'dash' as const, icon: LayoutDashboard, label: 'Dash' },
            { id: 'pohon' as const, icon: Network, label: 'Pohon' },
            { id: 'anggota' as const, icon: Users, label: 'Anggota' },
            { id: 'agenda' as const, icon: Calendar, label: 'Agenda' },
            { id: 'kas' as const, icon: Wallet, label: 'Kas' },
            { id: 'iuran' as const, icon: FileText, label: 'Iuran' }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center p-2 min-w-[55px] rounded-xl transition-colors cursor-pointer ${activeTab === tab.id ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-500 hover:text-green-600'}`}>
              <tab.icon size={22} className="mb-1" />
              <span className="text-[9px]">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto relative bg-gray-50">
          <div className="p-4 h-full">
             {activeTab === 'dash' && <DashboardTab members={members} totalKas={totalKas} nextAgenda={nextAgenda} formatRupiah={formatRupiah} sliderImages={sliderImages} isAdmin={authRole === 'admin'} showToast={showToast} />}
             {activeTab === 'pohon' && <PohonSilsilahTab members={members} />}
             {activeTab === 'anggota' && <AnggotaTab members={members} isAdmin={authRole === 'admin'} showToast={showToast} />}
             {activeTab === 'agenda' && <AgendaTab agendas={agendas} isAdmin={authRole === 'admin'} showToast={showToast} />}
             {activeTab === 'kas' && <KasTab transactions={transactions} totalKas={totalKas} formatRupiah={formatRupiah} isAdmin={authRole === 'admin'} showToast={showToast} />}
             {activeTab === 'iuran' && <IuranTab iuranSessions={iuranSessions} formatRupiah={formatRupiah} isAdmin={authRole === 'admin'} showToast={showToast} />}
          </div>
        </main>

        {/* MODAL LOGIN ADMIN */}
        {isAdminLoginOpen && (
          <AdminLoginModal 
            onLoginSuccess={() => {
              setAuthRole('admin');
              setIsAdminLoginOpen(false);
              showToast('Selamat datang, Admin! Akses edit & kelola data telah aktif.', 'success');
            }}
            onClose={() => setIsAdminLoginOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// MODAL LOGIN ADMIN (BY FALAH)
// ==========================================
function AdminLoginModal({ onLoginSuccess, onClose }: { onLoginSuccess: () => void; onClose: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username === 'Falah' && password === 'Cahragil85!?!') {
      try { localStorage.setItem('bs_admin_auth', 'true'); } catch {}
      onLoginSuccess();
    } else {
      setError('Username atau Kata kunci Admin salah!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[350] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-green-700 to-emerald-700 p-5 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="font-black text-base">Login Admin</h2>
              <p className="text-[10px] text-green-100">Khusus pengelola untuk mengubah data</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Username Admin</label>
            <input 
              type="text" 
              placeholder="Username" 
              className="w-full border-2 p-3 rounded-xl outline-none focus:border-green-500 font-medium" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              autoFocus
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Kata Kunci Admin</label>
            <input 
              type="password" 
              placeholder="Kata Kunci Admin" 
              className="w-full border-2 p-3 rounded-xl outline-none focus:border-green-500 font-medium" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          {error && <p className="bg-red-50 text-red-600 text-xs text-center py-2.5 rounded-xl font-bold border border-red-200">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-bold text-sm cursor-pointer hover:bg-gray-50">
              Batal
            </button>
            <button type="submit" className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm shadow-md cursor-pointer hover:opacity-95">
              Masuk
            </button>
          </div>
        </form>
        <p className="text-center pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">by Falah</p>
      </div>
    </div>
  );
}

// ==========================================
// TAMPILAN DASHBOARD
// ==========================================
function DashboardTab({ 
  members, 
  totalKas, 
  nextAgenda, 
  formatRupiah, 
  sliderImages, 
  isAdmin, 
  showToast 
}: { 
  members: Member[]; 
  totalKas: number; 
  nextAgenda?: Agenda; 
  formatRupiah: (n: number) => string; 
  sliderImages: SliderImage[]; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [isDeceasedModalOpen, setIsDeceasedModalOpen] = useState(false);

  // MENGHITUNG STATISTIK MENYELURUH (Termasuk Semua Pasangan)
  let totAnggota = 0;
  let totLaki = 0;
  let totPerempuan = 0;
  let totHidup = 0;
  const deceasedMembers: Array<{ name: string; type: string }> = [];
  const deceasedSpouses: Array<{ name: string; type: string }> = [];

  members.forEach(m => {
    totAnggota++;
    if (m.gender === 'L') totLaki++; else totPerempuan++;
    if (m.isAlive) totHidup++; else deceasedMembers.push({ name: m.name, type: 'Anggota' });

    const memberSpouses = getMemberSpouses(m);
    memberSpouses.forEach((sp, idx) => {
      totAnggota++;
      if (m.gender === 'L') totPerempuan++; else totLaki++; // Pasangan gendernya berlawanan
      if (sp.isAlive) totHidup++; else deceasedSpouses.push({ 
        name: sp.name, 
        type: memberSpouses.length > 1 ? `Pasangan ke-${idx + 1}` : 'Pasangan' 
      });
    });
  });

  const allDeceased = [...deceasedMembers, ...deceasedSpouses];

  useEffect(() => {
    if (sliderImages.length > 1 && !fullScreenImage && !isPhotoModalOpen) {
      const timer = setInterval(() => setCurrentSlide(p => (p + 1) % sliderImages.length), 4000);
      return () => clearInterval(timer);
    }
  }, [sliderImages, fullScreenImage, isPhotoModalOpen]);

  return (
    <div className="space-y-5 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-4 text-white shadow-md relative overflow-hidden flex flex-col justify-center">
          <p className="text-[11px] font-semibold mb-0.5 opacity-90">SALDO KAS</p>
          <h2 className="text-xl font-bold break-words relative z-10">{formatRupiah(totalKas)}</h2>
          <Wallet className="absolute -right-3 -bottom-3 opacity-10 w-20 h-20" />
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-md flex flex-col justify-center relative overflow-hidden">
          <p className="text-[11px] font-semibold mb-0.5 opacity-90 truncate relative z-10">{nextAgenda?.title || 'Agenda'}</p>
          {nextAgenda ? (
             <div className="flex items-end relative z-10">
               <h2 className="text-2xl font-bold leading-none mr-1">{new Date(nextAgenda.date).getDate()}</h2>
               <span className="text-sm font-semibold">{new Date(nextAgenda.date).toLocaleString('id-ID', { month: 'short' })}</span>
             </div>
          ) : <span className="text-sm font-medium opacity-80 relative z-10">Kosong</span>}
          <Calendar className="absolute -right-2 -bottom-2 opacity-10 w-16 h-16" />
        </div>
      </div>

      <div className="rounded-3xl overflow-hidden relative h-52 shadow-md bg-gray-200 flex items-center justify-center group">
        {sliderImages.length > 0 ? (
          <>
            {sliderImages.map((img, idx) => (
              <img key={img.id} src={img.url} onClick={() => setFullScreenImage(img.url)} className={`absolute inset-0 w-full h-full object-cover cursor-pointer transition-opacity duration-1000 ${idx === currentSlide ? 'opacity-100' : 'opacity-0'}`} alt="Slide" />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4 text-white pointer-events-none">
              <h3 className="font-bold text-lg leading-tight">Keluarga Besar KH. SUMADI</h3>
              <p className="text-xs opacity-90">Menjalin Silaturrahim, Mempererat Persaudaraan</p>
            </div>
            {sliderImages.length > 1 && (
              <>
                <button onClick={() => setCurrentSlide((p) => (p - 1 + sliderImages.length) % sliderImages.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 p-1.5 rounded-full text-white hover:bg-black/70 transition cursor-pointer"><ChevronLeft size={20}/></button>
                <button onClick={() => setCurrentSlide((p) => (p + 1) % sliderImages.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 p-1.5 rounded-full text-white hover:bg-black/70 transition cursor-pointer"><ChevronRight size={20}/></button>
              </>
            )}
          </>
        ) : <div className="text-gray-400 text-sm flex flex-col items-center"><ImageIcon size={32} className="mb-2 opacity-50"/> Belum ada foto</div>}
      </div>

      {isAdmin && <button onClick={() => setIsPhotoModalOpen(true)} className="w-full bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-2xl flex items-center justify-center text-sm shadow-sm hover:bg-gray-50 cursor-pointer"><Camera size={18} className="mr-2 text-green-600" /> Kelola Foto Dashboard</button>}

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Total Anggota" value={totAnggota} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Laki-laki" value={totLaki} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Perempuan" value={totPerempuan} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Masih Hidup" value={totHidup} color="bg-green-50 border-green-100 text-green-700" />
        
        <div onClick={() => setIsDeceasedModalOpen(true)} className="col-span-2 cursor-pointer active:scale-[0.98] transition-transform">
           <StatCard title="Total Keluarga Meninggal (Klik detail)" value={allDeceased.length} color="bg-gray-800 border-gray-700 text-white shadow-md hover:bg-gray-700" />
        </div>
      </div>

      {isPhotoModalOpen && <ModalKelolaFoto sliderImages={sliderImages} showToast={showToast} onClose={() => setIsPhotoModalOpen(false)} />}
      {fullScreenImage && <FullScreenImage src={fullScreenImage} onClose={() => setFullScreenImage(null)} />}
      {isDeceasedModalOpen && <ModalDaftarMeninggal deceasedList={allDeceased} onClose={() => setIsDeceasedModalOpen(false)} />}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${color}`}>
      <p className="text-xs font-semibold opacity-80 mb-1">{title}</p>
      <h3 className="text-2xl font-black">{value}</h3>
    </div>
  );
}

function ModalDaftarMeninggal({ deceasedList, onClose }: { deceasedList: Array<{ name: string; type: string }>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 animate-fade-in">
       <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
          <div className="bg-gray-800 p-5 text-white flex justify-between items-center">
            <div>
              <h2 className="font-bold text-base">Daftar Keluarga Meninggal</h2>
              <p className="text-[10px] opacity-70">Total: {deceasedList.length} Orang</p>
            </div>
            <button onClick={onClose} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition cursor-pointer"><X size={18}/></button>
          </div>
          <div className="p-2 overflow-y-auto">
            <ul className="divide-y divide-gray-100">
              {deceasedList.map((person, idx) => (
                <li key={idx} className="p-4 flex justify-between items-center hover:bg-gray-50 transition rounded-xl">
                   <span className="font-bold text-gray-800">{person.name}</span>
                   <span className="text-[9px] font-black tracking-widest uppercase bg-gray-100 px-3 py-1.5 rounded-lg text-gray-500 border border-gray-200">{person.type}</span>
                </li>
              ))}
            </ul>
            {deceasedList.length === 0 && <p className="text-center text-gray-500 text-sm font-medium py-10">Tidak ada data keluarga yang wafat.</p>}
          </div>
       </div>
    </div>
  );
}

function FullScreenImage({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-6 right-6 text-white hover:bg-white/20 p-2 rounded-full transition cursor-pointer z-10"><X size={24} /></button>
      <img src={src} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain animate-fade-in" alt="Full" />
    </div>
  );
}

function ModalKelolaFoto({ sliderImages, showToast, onClose }: { sliderImages: SliderImage[]; showToast: (m: string, t?: 'success' | 'error') => void; onClose: () => void }) {
  const [newImage, setNewImage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImage) return;
    try {
      const id = Date.now();
      await setDoc(getDocRef('sliderImages', id), { id, url: newImage });
      setNewImage('');
      if (fileRef.current) fileRef.current.value = '';
      showToast('Foto berhasil disimpan ke Cloud Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'sliderImages');
      showToast('Gagal mengunggah foto', 'error'); 
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDoc(getDocRef('sliderImages', id));
      showToast('Foto berhasil dihapus dari Cloud Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'sliderImages');
      showToast('Gagal menghapus foto', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-green-700 p-4 text-white flex justify-between items-center"><h2 className="font-bold text-sm">Kelola Foto Dashboard</h2><button onClick={onClose} className="cursor-pointer"><X size={20}/></button></div>
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center text-gray-400 relative">
               <UploadCloud size={32} className="mb-2 text-green-500" />
               <p className="text-xs font-bold">Pilih gambar</p>
               <input type="file" accept="image/*" ref={fileRef} onChange={(e) => handleImageUpload(e, setNewImage)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
            {newImage && <img src={newImage} className="w-full h-32 object-cover rounded-xl border" alt="Preview" />}
            <button type="submit" disabled={!newImage} className="bg-green-600 disabled:bg-gray-200 text-white p-3.5 rounded-xl font-bold text-sm shadow-md cursor-pointer disabled:cursor-not-allowed">Simpan Foto ke Firebase</button>
          </form>
          <hr className="border-gray-100" />
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase">Daftar Foto ({sliderImages.length})</p>
            <div className="grid grid-cols-2 gap-3">
              {sliderImages.map((img) => (
                <div key={img.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video">
                  <img src={img.url} className="w-full h-full object-cover" alt="Slide" />
                  <button onClick={() => handleDelete(img.id)} className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-full shadow hover:bg-red-600 cursor-pointer" title="Hapus"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// POHON SILSILAH TAB
// ==========================================
function PanZoomWrapper({ 
  children, 
  zoom, 
  setZoom, 
  position, 
  setPosition 
}: { 
  children: React.ReactNode; 
  zoom: number; 
  setZoom: React.Dispatch<React.SetStateAction<number>>; 
  position: { x: number; y: number }; 
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPinchDist = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        dragStart.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
      } else if (e.touches.length === 2) {
        isDragging.current = false;
        initialPinchDist.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); 
      if (e.touches.length === 1 && isDragging.current) {
        setPosition({ x: e.touches[0].clientX - dragStart.current.x, y: e.touches[0].clientY - dragStart.current.y });
      } else if (e.touches.length === 2 && initialPinchDist.current) {
        const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const delta = currentDist - initialPinchDist.current;
        setZoom(prev => Math.min(Math.max(0.3, prev + delta * 0.005), 2.5));
        initialPinchDist.current = currentDist; 
      }
    };

    const handleTouchEnd = () => { isDragging.current = false; initialPinchDist.current = null; };
    const handleWheel = (e: WheelEvent) => { e.preventDefault(); setZoom(prev => Math.min(Math.max(0.3, prev - e.deltaY * 0.002), 2.5)); };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [position, setPosition, setZoom]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 bg-[#1A4331] cursor-grab active:cursor-grabbing touch-none overflow-hidden"
      onMouseDown={(e) => { isDragging.current = true; dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y }; }}
      onMouseMove={(e) => { if(isDragging.current) setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }}
      onMouseUp={() => isDragging.current = false} 
      onMouseLeave={() => isDragging.current = false}
    >
       <div style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`, transformOrigin: 'top center' }} className="w-full flex justify-center origin-top transition-transform duration-75 ease-out pt-24 pb-40">
          {children}
       </div>
    </div>
  );
}

interface TreeNodeData extends Member {
  children: TreeNodeData[];
}

interface ProfileData {
  name: string;
  isAlive: boolean;
  gender: 'L' | 'P';
  photo: string;
  birthDate: string;
  deathDate: string | null;
  domicile: string;
  phone: string;
  spouse: string;
  parentName: string;
}

// ==========================================
// TAMPILAN POHON SILSILAH
// ==========================================
function PersonBox({ 
  name, 
  gender, 
  isAlive, 
  photo, 
  label, 
  onClick 
}: { 
  name: string; 
  gender: 'L' | 'P'; 
  isAlive: boolean; 
  photo?: string; 
  label?: string; 
  onClick: (e: React.MouseEvent) => void; 
}) {
  const isMale = gender === 'L';
  return (
    <div 
      className={`relative flex flex-col items-center cursor-pointer p-2.5 rounded-2xl shadow-md transition-all duration-150 hover:scale-105 hover:shadow-xl w-[92px] sm:w-[98px] select-none border-2 flex-shrink-0 backdrop-blur-sm ${
        isMale 
          ? 'bg-gradient-to-b from-blue-50/95 to-white border-blue-400 text-blue-950' 
          : 'bg-gradient-to-b from-pink-50/95 to-white border-pink-400 text-pink-950'
      }`}
      onClick={onClick}
      title={`Klik untuk melihat detail profil ${name}`}
    >
      {/* Label / Badge (e.g. Kepala Keluarga, Istri 1, Suami, dll.) */}
      {label && (
        <span className={`text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full mb-1 border ${
          isMale 
            ? 'bg-blue-100 text-blue-800 border-blue-200' 
            : 'bg-pink-100 text-pink-800 border-pink-200'
        }`}>
          {label}
        </span>
      )}

      {/* Avatar */}
      <div className="relative mb-1">
        {!isAlive && (
          <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-[7.5px] font-black px-1 py-0.2 rounded-md shadow-xs z-20">
            ALM
          </span>
        )}
        <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-sm overflow-hidden flex-shrink-0 ${
          isMale 
            ? 'bg-blue-100/60 text-blue-500 border-blue-300' 
            : 'bg-pink-100/60 text-pink-500 border-pink-300'
        }`}>
          {photo ? (
            <img src={photo} className="w-full h-full object-cover" alt={name} />
          ) : (
            <Users size={20} />
          )}
        </div>
      </div>

      {/* Name */}
      <p className="font-bold text-[10.5px] text-center leading-tight line-clamp-2 w-full break-words">
        {name}
      </p>
    </div>
  );
}

function MarriageConnector({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center relative px-1 sm:px-2 z-10 self-center select-none flex-shrink-0">
      {/* Garis Horizontal Sejajar */}
      <div className="w-8 sm:w-12 h-[3.5px] bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500 rounded-full shadow-sm"></div>
      
      {/* Badge Ikon Cincin Pernikahan di tengah garis sejajar */}
      <div className="absolute -top-3.5 flex flex-col items-center pointer-events-none">
        <span 
          className="bg-amber-100 text-amber-900 text-[10px] w-5 h-5 rounded-full border border-amber-300 shadow-sm flex items-center justify-center leading-none" 
          title="Pasangan (Garis Sejajar)"
        >
          💍
        </span>
        {label && (
          <span className="text-[7.5px] font-black text-amber-900 bg-amber-50/95 px-1 py-0.2 rounded border border-amber-200 mt-0.5 whitespace-nowrap shadow-2xs">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function PohonSilsilahTab({ members }: { members: Member[] }) {
  const treeData = useMemo(() => {
    const buildTree = (parentId: number | null = null): TreeNodeData[] => 
      members.filter(m => m.parentId === parentId).map(m => ({ ...m, children: buildTree(m.id) }));
    return buildTree();
  }, [members]);

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [expandAll, setExpandAll] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);

  useEffect(() => { setZoom(1); setPosition({ x: 0, y: 0 }); }, []);

  const handleProfileClick = (node: Member, isSpouse: boolean, spouseObj?: Spouse) => {
      if (!isSpouse) {
          const spouseNames = getMemberSpouses(node, members).map(s => s.name).filter(Boolean).join(', ');
          setSelectedProfile({ 
            name: node.name, 
            isAlive: node.isAlive, 
            gender: node.gender, 
            photo: node.photo, 
            birthDate: node.birthDate, 
            deathDate: node.deathDate, 
            domicile: node.domicile, 
            phone: node.phone, 
            spouse: spouseNames || '-', 
            parentName: members.find(m => m.id === node.parentId)?.name || '-' 
          });
      } else if (spouseObj) {
          setSelectedProfile({ 
            name: spouseObj.name, 
            isAlive: spouseObj.isAlive, 
            gender: node.gender === 'L' ? 'P' : 'L', 
            photo: spouseObj.photo || '', 
            birthDate: spouseObj.birthDate || '', 
            deathDate: spouseObj.deathDate || '', 
            domicile: spouseObj.domicile || '', 
            phone: spouseObj.phone || '', 
            spouse: node.name, 
            parentName: '-' 
          });
      } else {
          setSelectedProfile({ 
            name: node.spouse || '', 
            isAlive: node.spouseIsAlive ?? true, 
            gender: node.gender === 'L' ? 'P' : 'L', 
            photo: node.spousePhoto || '', 
            birthDate: node.spouseBirthDate || '', 
            deathDate: node.spouseDeathDate || '', 
            domicile: node.spouseDomicile || '', 
            phone: node.spousePhone || '', 
            spouse: node.name, 
            parentName: '-' 
          });
      }
  };

  return (
    <div className="flex flex-col h-[75vh] relative rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-[#1A4331] -mx-4 -mt-4">
      
      {/* HEADER & LEGENDA ATURAN GARIS SILSILAH */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none w-[92%] max-w-sm">
        <div className="bg-white/95 backdrop-blur px-5 py-1.5 rounded-full shadow-lg text-center border border-emerald-100">
          <h2 className="text-xs sm:text-sm font-black text-emerald-900 tracking-wide">Pohon Silsilah Keluarga</h2>
        </div>
        <div className="bg-emerald-950/85 backdrop-blur px-3.5 py-1 rounded-full shadow-md flex items-center justify-center gap-2 sm:gap-3 text-[9px] font-bold text-white border border-emerald-700/60">
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-3.5 h-[2.5px] bg-amber-400 inline-block rounded-full"></span>
            <span>Garis Sejajar = Pasangan 💍</span>
          </span>
          <span className="text-emerald-500">|</span>
          <span className="flex items-center gap-1 text-emerald-200">
            <span className="w-[2.5px] h-3 bg-emerald-400 inline-block rounded-full"></span>
            <span>Garis ke Bawah = Keturunan</span>
          </span>
        </div>
      </div>

      {/* KONTROL ZOOM & VIEW */}
      <div className="absolute left-4 top-20 flex flex-col gap-3 z-10">
        <button onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white shadow-lg flex items-center justify-center transition active:scale-95 cursor-pointer" title="Zoom In"><Plus size={22}/></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white shadow-lg flex items-center justify-center transition active:scale-95 cursor-pointer" title="Zoom Out"><Minus size={22}/></button>
        <button onClick={() => { setZoom(1); setPosition({x:0, y:0}); }} className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white shadow-lg flex items-center justify-center transition active:scale-95 cursor-pointer" title="Reset View"><Maximize size={20}/></button>
        <button onClick={() => setExpandAll(!expandAll)} className={`w-12 h-12 backdrop-blur-md border rounded-full shadow-lg flex items-center justify-center transition active:scale-95 cursor-pointer ${expandAll ? 'bg-emerald-500/80 border-emerald-400 text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`} title="Buka/Tutup Cabang"><Network size={20}/></button>
      </div>

      <PanZoomWrapper zoom={zoom} setZoom={setZoom} position={position} setPosition={setPosition}>
         {treeData.map(node => {
            // DETEKSI LOGIKA SPESIAL: Puncak Root (Mbah Sumadi, Istri 1 & Istri 2)
            // Ketiganya terhubung SEJAJAR horizontal dengan garis pernikahan, dan garis keturunan turun KE BAWAH
            if (!node.parentId && node.children && node.children.length >= 2) {
               const wife1 = node.children[0];
               const wife2 = node.children[1];

               return (
                 <div key={node.id} className="relative flex justify-center items-start">
                    
                    {/* CABANG ISTRI 1 (KIRI) - Keturunan Istri 1 Turun ke Bawah */}
                    <div className="relative flex flex-col items-center">
                        <TreeNode 
                          node={wife1} 
                          members={members}
                          onOpenProfile={handleProfileClick} 
                          isRoot={true} 
                          globalExpandAll={expandAll} 
                          hideSpouse={true} 
                          customLabel="Istri 1" 
                        />
                    </div>

                    {/* GARIS SEJAJAR: ISTRI 1 KE KH. SUMADI */}
                    <div className="self-start mt-8 sm:mt-10 flex items-center justify-center px-1">
                        <div className="w-6 sm:w-12 h-[3.5px] bg-gradient-to-r from-emerald-400 via-amber-400 to-emerald-400 rounded-full"></div>
                        <span className="bg-amber-100 text-amber-900 text-[10px] w-5 h-5 rounded-full border border-amber-300 shadow-sm flex items-center justify-center mx-1">💍</span>
                        <div className="w-6 sm:w-12 h-[3.5px] bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full"></div>
                    </div>

                    {/* KH. SUMADI (TENGAH) - SEJAJAR DENGAN KEDUA ISTRI */}
                    <div className="relative flex flex-col items-center z-10 px-2 sm:px-4">
                        <PersonBox 
                           name={node.name} 
                           gender={node.gender} 
                           isAlive={node.isAlive} 
                           photo={node.photo} 
                           label="Kepala Keluarga"
                           onClick={(e) => { e.stopPropagation(); handleProfileClick(node, false); }} 
                        />
                    </div>

                    {/* GARIS SEJAJAR: KH. SUMADI KE ISTRI 2 */}
                    <div className="self-start mt-8 sm:mt-10 flex items-center justify-center px-1">
                        <div className="w-6 sm:w-12 h-[3.5px] bg-gradient-to-r from-emerald-400 via-amber-400 to-emerald-400 rounded-full"></div>
                        <span className="bg-amber-100 text-amber-900 text-[10px] w-5 h-5 rounded-full border border-amber-300 shadow-sm flex items-center justify-center mx-1">💍</span>
                        <div className="w-6 sm:w-12 h-[3.5px] bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full"></div>
                    </div>

                    {/* CABANG ISTRI 2 (KANAN) - Keturunan Istri 2 Turun ke Bawah */}
                    <div className="relative flex flex-col items-center">
                        <TreeNode 
                          node={wife2} 
                          members={members}
                          onOpenProfile={handleProfileClick} 
                          isRoot={true} 
                          globalExpandAll={expandAll} 
                          hideSpouse={true} 
                          customLabel="Istri 2" 
                        />
                    </div>
                 </div>
               );
            }

            // Fallback node biasa
            return (
              <TreeNode 
                key={node.id} 
                node={node} 
                members={members}
                onOpenProfile={handleProfileClick} 
                isRoot={true} 
                globalExpandAll={expandAll} 
              />
            );
         })}
         {treeData.length === 0 && <p className="text-white/50 font-medium mt-10">Belum ada struktur silsilah.</p>}
      </PanZoomWrapper>

      {selectedProfile && <ProfilePopupCard profile={selectedProfile} onClose={() => setSelectedProfile(null)} />}
    </div>
  );
}

function TreeNode({ 
  node, 
  members,
  onOpenProfile, 
  isRoot, 
  globalExpandAll, 
  hideSpouse = false,
  customLabel
}: { 
  node: TreeNodeData; 
  members?: Member[];
  onOpenProfile: (n: Member, isSpouse: boolean, spouseObj?: Spouse) => void; 
  isRoot: boolean; 
  globalExpandAll: boolean; 
  hideSpouse?: boolean;
  customLabel?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const spouses = getMemberSpouses(node, members);

  useEffect(() => { setIsExpanded(globalExpandAll); }, [globalExpandAll]);

  return (
    <div className="flex flex-col items-center relative">
      
      {/* GARIS KE BAWAH: Masuk ke atas kartu anak dari orang tua di atas */}
      {!isRoot && (
        <div className="w-[2.5px] h-6 bg-emerald-500 mb-0 flex-shrink-0"></div>
      )}

      {/* UNIT PASANGAN (SEJAJAR HORIZONTAL) */}
      <div className="relative flex items-center justify-center z-10">
        
        {/* KARTU ANGGOTA UTAMA */}
        <PersonBox 
          name={node.name} 
          gender={node.gender} 
          isAlive={node.isAlive} 
          photo={node.photo} 
          label={customLabel || (isRoot ? 'Puncak Silsilah' : undefined)}
          onClick={(e) => { e.stopPropagation(); onOpenProfile(node, false); }} 
        />

        {/* DAFTAR PASANGAN TERHUBUNG SEJAJAR SECARA HORIZONTAL */}
        {!hideSpouse && spouses.map((sp, sIdx) => {
          const spouseLabel = spouses.length > 1 
            ? (node.gender === 'L' ? `Istri ${sIdx + 1}` : `Suami ${sIdx + 1}`) 
            : 'Pasangan';

          return (
            <React.Fragment key={sp.id || sIdx}>
              {/* GARIS SEJAJAR HORIZONTAL ANTARA ANGGOTA DAN PASANGANNYA */}
              <MarriageConnector label={spouseLabel} />

              {/* KARTU PASANGAN YANG SEJAJAR */}
              <PersonBox 
                name={sp.name} 
                gender={node.gender === 'L' ? 'P' : 'L'} 
                isAlive={sp.isAlive} 
                photo={sp.photo} 
                label={spouseLabel}
                onClick={(e) => { e.stopPropagation(); onOpenProfile(node, true, sp); }} 
              />
            </React.Fragment>
          );
        })}

        {/* Tombol Expand/Collapse Keturunan di bawah pasangan */}
        {hasChildren && (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} 
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-md text-white flex items-center justify-center z-30 hover:bg-emerald-700 transition font-black active:scale-95 cursor-pointer"
            title={isExpanded ? 'Sembunyikan Keturunan' : 'Tampilkan Keturunan'}
          >
            {isExpanded ? <Minus size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
          </button>
        )}
      </div>

      {/* GARIS KETURUNAN: KE BAWAH DARI PASANGAN KE ANAK-ANAK */}
      {hasChildren && isExpanded && (
        <div className="relative flex flex-col items-center mt-3 pt-4 w-full">
           {/* Garis vertikal lurus ke bawah dari orang tua */}
           <div className="absolute top-0 left-1/2 w-[2.5px] h-4 bg-emerald-500 -translate-x-1/2"></div>
           
           {/* Cabang horizontal menghubungkan anak-anak di bawahnya */}
           <div className="flex justify-center items-start">
             {node.children.map((child, index) => {
                const isFirst = index === 0;
                const isLast = index === node.children.length - 1;
                const isOnly = node.children.length === 1;

                return (
                  <div key={child.id} className="relative flex flex-col items-center px-2 sm:px-4">
                     {/* Garis pembagi horizontal di atas deretan anak */}
                     {!isOnly && (
                       <>
                         {isFirst && <div className="absolute top-0 right-0 w-1/2 h-[2.5px] bg-emerald-500"></div>}
                         {isLast && <div className="absolute top-0 left-0 w-1/2 h-[2.5px] bg-emerald-500"></div>}
                         {!isFirst && !isLast && <div className="absolute top-0 left-0 w-full h-[2.5px] bg-emerald-500"></div>}
                       </>
                     )}
                     <TreeNode 
                       node={child} 
                       members={members}
                       onOpenProfile={onOpenProfile} 
                       isRoot={false} 
                       globalExpandAll={globalExpandAll} 
                     />
                  </div>
                );
             })}
           </div>
        </div>
      )}
    </div>
  );
}

function ProfilePopupCard({ profile, onClose }: { profile: ProfileData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden relative flex flex-col" onClick={e => e.stopPropagation()}>
        <button className="absolute top-3 right-3 bg-black/50 text-white p-2 rounded-full z-10 hover:bg-black/70 transition cursor-pointer" onClick={onClose}><X size={18}/></button>
        
        <div className={`h-48 relative flex items-center justify-center ${profile.gender === 'L' ? 'bg-blue-50' : 'bg-pink-50'}`}>
          {profile.photo ? <img src={profile.photo} className="w-full h-full object-cover" alt={profile.name} /> : <Users size={70} className="text-gray-300"/>}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent"></div>
        </div>
        
        <div className="px-6 pb-8 pt-2 relative z-10 -mt-8">
          <div className="flex justify-between items-end mb-4">
            <div>
               <h2 className="text-2xl font-black text-gray-800 leading-tight">{profile.name}</h2>
               <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">{profile.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
            </div>
            <span className={`px-3 py-1 text-[10px] font-black rounded-lg shadow-sm border ${profile.isAlive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>{profile.isAlive ? 'MASIH HIDUP' : 'MENINGGAL'}</span>
          </div>

          <div className="space-y-3 text-xs bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <div className="flex justify-between border-b border-gray-200 pb-2"><span className="text-gray-500 font-semibold">Lahir</span><span className="font-bold text-gray-800">{profile.birthDate || '-'}</span></div>
            {!profile.isAlive && <div className="flex justify-between border-b border-gray-200 pb-2"><span className="text-red-400 font-semibold">Wafat</span><span className="font-bold text-red-600">{profile.deathDate || '-'}</span></div>}
            <div className="flex justify-between border-b border-gray-200 pb-2"><span className="text-gray-500 font-semibold">Domisili</span><span className="font-bold text-gray-800 text-right w-1/2 break-words">{profile.domicile || '-'}</span></div>
            <div className="flex justify-between border-b border-gray-200 pb-2"><span className="text-gray-500 font-semibold">No HP</span><span className="font-bold text-gray-800">{profile.phone || '-'}</span></div>
            <div className="flex justify-between border-b border-gray-200 pb-2"><span className="text-gray-500 font-semibold">Pasangan</span><span className="font-bold text-gray-800">{profile.spouse || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-semibold">Orang Tua</span><span className="font-bold text-gray-800">{profile.parentName || '-'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAMPILAN ANGGOTA
// ==========================================
function AnggotaTab({ members, isAdmin, showToast }: { members: Member[]; isAdmin: boolean; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Member | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const filtered = members.filter(m => {
    const q = searchTerm.toLowerCase();
    const matchSelf = m.name.toLowerCase().includes(q) || (m.domicile && m.domicile.toLowerCase().includes(q));
    const spouses = getMemberSpouses(m);
    const matchSpouse = spouses.some(s => s.name.toLowerCase().includes(q) || (s.domicile && s.domicile.toLowerCase().includes(q)));
    return matchSelf || matchSpouse;
  });

  const openProfile = (member: Member, isSpouse: boolean, spouseObj?: Spouse) => {
    if (!isSpouse) {
      const spouseNames = getMemberSpouses(member).map(s => s.name).filter(Boolean).join(', ');
      setSelectedProfile({ 
        name: member.name, 
        isAlive: member.isAlive, 
        gender: member.gender, 
        photo: member.photo, 
        birthDate: member.birthDate, 
        deathDate: member.deathDate, 
        domicile: member.domicile, 
        phone: member.phone, 
        spouse: spouseNames || '-', 
        parentName: members.find(m => m.id === member.parentId)?.name || '-' 
      });
    } else if (spouseObj) {
      setSelectedProfile({ 
        name: spouseObj.name, 
        isAlive: spouseObj.isAlive, 
        gender: member.gender === 'L' ? 'P' : 'L', 
        photo: spouseObj.photo || '', 
        birthDate: spouseObj.birthDate || '', 
        deathDate: spouseObj.deathDate || '', 
        domicile: spouseObj.domicile || '', 
        phone: spouseObj.phone || '', 
        spouse: member.name, 
        parentName: '-' 
      });
    } else {
      setSelectedProfile({ 
        name: member.spouse || '', 
        isAlive: member.spouseIsAlive ?? true, 
        gender: member.gender === 'L' ? 'P' : 'L', 
        photo: member.spousePhoto || '', 
        birthDate: member.spouseBirthDate || '', 
        deathDate: member.spouseDeathDate || '', 
        domicile: member.spouseDomicile || '', 
        phone: member.spousePhone || '', 
        spouse: member.name, 
        parentName: '-' 
      });
    }
  };

  const executeDelete = async (id: number) => {
    try {
      await deleteDoc(getDocRef('members', id));
      members.forEach(async (m) => {
          if (m.parentId === id) await setDoc(getDocRef('members', m.id), { ...m, parentId: null });
      });
      setItemToDelete(null);
      showToast('Data Anggota berhasil dihapus dari Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'members');
      showToast('Gagal menghapus data di Firebase', 'error'); 
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-gray-800">Daftar Anggota</h2>
      </div>
      {isAdmin && (
        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }} 
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl shadow-md transition flex justify-center cursor-pointer items-center"
        >
          <Plus size={20} className="mr-2"/> Tambah Anggota
        </button>
      )}
      
      <div className="relative">
        <Search className="absolute left-3 top-3.5 text-gray-400" size={20} />
        <input 
          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 outline-none focus:border-green-500 font-medium bg-white" 
          placeholder="Cari nama anggota atau pasangan..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
        />
      </div>
      
      <div className="space-y-4">
        {filtered.map(member => {
          const memberSpouses = getMemberSpouses(member);

          return (
            <div key={member.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 transition hover:shadow-md">
              <div className="flex gap-4 items-start relative z-10">
                <div 
                  className={`w-16 h-16 rounded-full border-2 flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-85 transition shadow-sm ${member.gender === 'L' ? 'border-blue-200 bg-blue-50 text-blue-500' : 'border-pink-200 bg-pink-50 text-pink-500'}`} 
                  onClick={() => openProfile(member, false)}
                  title="Lihat profil lengkap"
                >
                  {member.photo ? <img src={member.photo} className="w-full h-full object-cover" alt={member.name} /> : <Users size={30} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                     <h3 
                       className="font-bold text-lg text-gray-800 truncate pr-2 cursor-pointer hover:text-green-700" 
                       onClick={() => openProfile(member, false)}
                     >
                       {member.name}
                     </h3>
                     {isAdmin && (
                       <div className="flex gap-1.5 flex-shrink-0">
                         <button 
                           onClick={() => { setEditingItem(member); setIsModalOpen(true); }} 
                           className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg cursor-pointer transition"
                           title="Edit Anggota"
                         >
                           <Edit2 size={14}/>
                         </button>
                         <button 
                           onClick={() => setItemToDelete(member.id)} 
                           className="text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg cursor-pointer transition"
                           title="Hapus Anggota"
                         >
                           <Trash2 size={14}/>
                         </button>
                       </div>
                     )}
                  </div>
                  <div className="mt-1 mb-2 flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${member.isAlive ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>
                      {member.isAlive ? 'HIDUP' : 'ALM'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {member.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 space-y-1">
                    <p className="truncate">Ortu: <span className="font-semibold text-gray-800">{members.find(m => m.id === member.parentId)?.name || '-'}</span></p>
                    <p className="break-words">Domisili: <span className="font-semibold text-gray-800">{member.domicile || '-'}</span></p>
                    {member.phone && member.phone !== '-' && (
                      <p className="break-words">No HP: <span className="font-semibold text-gray-800">{member.phone}</span></p>
                    )}
                  </div>
                </div>
              </div>

              {/* SEMUA PASANGAN ANGGOTA (BISA > 1 PASANGAN) */}
              {memberSpouses.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-gray-100 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 px-1">
                    <span>Pasangan ({memberSpouses.length}):</span>
                    {memberSpouses.length > 1 && (
                      <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        {memberSpouses.length} Pasangan
                      </span>
                    )}
                  </div>

                  {memberSpouses.map((sp, sIdx) => (
                    <div key={sp.id || sIdx} className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-150 flex gap-3 items-center">
                      <div 
                        className={`w-11 h-11 rounded-full border-2 flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition shadow-sm ${member.gender === 'L' ? 'border-pink-200 bg-pink-50 text-pink-500' : 'border-blue-200 bg-blue-50 text-blue-500'}`} 
                        onClick={() => openProfile(member, true, sp)}
                        title="Klik untuk melihat profil pasangan"
                      >
                         {sp.photo ? <img src={sp.photo} className="w-full h-full object-cover" alt={sp.name} /> : <Users size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p 
                            className="font-bold text-sm text-gray-800 truncate cursor-pointer hover:text-green-700" 
                            onClick={() => openProfile(member, true, sp)}
                          >
                            {sp.name}
                          </p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border ${sp.isAlive ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>
                            {sp.isAlive ? 'HIDUP' : 'ALM'}
                          </span>
                          {memberSpouses.length > 1 && (
                            <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-1.5 py-0.2 rounded">
                              {member.gender === 'L' ? `Istri ${sIdx + 1}` : `Suami ${sIdx + 1}`}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-3 mt-0.5">
                          {sp.domicile && <span className="truncate">📍 {sp.domicile}</span>}
                          {sp.phone && sp.phone !== '-' && <span className="truncate">📞 {sp.phone}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">Tidak ada data.</p>}
      </div>

      {isModalOpen && <ModalFormAnggota member={editingItem} members={members} showToast={showToast} onClose={() => setIsModalOpen(false)} />}
      {selectedProfile && <ProfilePopupCard profile={selectedProfile} onClose={() => setSelectedProfile(null)} />}
      {itemToDelete !== null && <ConfirmModal title="Hapus Anggota" message="Yakin ingin menghapus anggota ini? Silsilah akan otomatis tersesuaikan dengan aman." onCancel={() => setItemToDelete(null)} onConfirm={() => executeDelete(itemToDelete)} />}
    </div>
  );
}

function ModalFormAnggota({ 
  member, 
  members, 
  showToast, 
  onClose 
}: { 
  member: Member | null; 
  members: Member[]; 
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void;
}) {
  const [formData, setFormData] = useState<Partial<Member>>(() => {
    if (member) {
      return {
        ...member,
        relationType: member.relationType || (member.name?.toLowerCase().includes('istri') || member.name?.toLowerCase().includes('suami') ? 'spouse' : 'child')
      };
    }
    return { 
      name: '', 
      isAlive: true, 
      gender: 'L', 
      parentId: null, 
      relationType: 'child',
      spouseOfId: null,
      spouse: '', 
      domicile: '', 
      phone: '', 
      birthDate: '', 
      deathDate: '', 
      photo: '', 
      spousePhoto: '', 
      spouseIsAlive: true, 
      spouseDomicile: '', 
      spousePhone: '', 
      spouseBirthDate: '', 
      spouseDeathDate: '' 
    };
  });

  // State untuk multi-pasangan
  const [spousesList, setSpousesList] = useState<Spouse[]>(() => {
    if (member) {
      const sp = getMemberSpouses(member);
      if (sp.length > 0) {
        return sp.map(s => ({ ...s }));
      }
    }
    return [];
  });

  // State untuk modal crop gambar
  const [cropperModal, setCropperModal] = useState<{
    imageSrc: string;
    target: 'member' | 'spouse';
    spouseIndex?: number;
    title: string;
  } | null>(null);

  const memberFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Handler pilih foto anggota utama -> picu cropping modal
  const handleMemberPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropperModal({
          imageSrc: reader.result as string,
          target: 'member',
          title: 'Sesuaikan & Potong Foto Anggota'
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Handler pilih foto pasangan -> picu cropping modal
  const handleSpousePhotoFile = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropperModal({
          imageSrc: reader.result as string,
          target: 'spouse',
          spouseIndex: index,
          title: `Sesuaikan & Potong Foto Pasangan ${spousesList.length > 1 ? `#${index + 1}` : ''}`
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Hasil potong foto dari ImageCropperModal
  const handleApplyCrop = (croppedBase64: string) => {
    if (!cropperModal) return;
    if (cropperModal.target === 'member') {
      setFormData(prev => ({ ...prev, photo: croppedBase64 }));
    } else if (cropperModal.target === 'spouse' && cropperModal.spouseIndex !== undefined) {
      const idx = cropperModal.spouseIndex;
      setSpousesList(prev => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], photo: croppedBase64 };
        return copy;
      });
    }
    setCropperModal(null);
  };

  // Manajemen daftar pasangan
  const handleAddSpouse = () => {
    const newSpouse: Spouse = {
      id: `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      isAlive: true,
      photo: '',
      birthDate: '',
      deathDate: '',
      domicile: '',
      phone: ''
    };
    setSpousesList(prev => [...prev, newSpouse]);
  };

  const handleRemoveSpouse = (index: number) => {
    setSpousesList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSpouseChange = (index: number, field: keyof Spouse, value: any) => {
    setSpousesList(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = member ? member.id : Date.now();
      
      // Bersihkan data pasangan yang diinput
      const cleanSpouses = spousesList
        .filter(s => s.name && s.name.trim() !== '')
        .map(s => ({
          ...s,
          name: s.name.trim(),
          isAlive: s.isAlive ?? true,
          photo: s.photo || '',
          birthDate: s.birthDate || '',
          deathDate: !s.isAlive ? (s.deathDate || '') : '',
          domicile: s.domicile || '',
          phone: s.phone || ''
        }));

      const primarySpouse = cleanSpouses[0];
      const relationType = formData.relationType === 'spouse' ? 'spouse' : 'child';
      const spouseOfId = relationType === 'spouse' ? (formData.parentId ? Number(formData.parentId) : null) : null;

      const payload: Member = {
        ...formData as any,
        id, 
        parentId: formData.parentId ? Number(formData.parentId) : null,
        relationType,
        spouseOfId,
        spouses: cleanSpouses,
        // Backward compatibility dengan data pasangan tunggal lama
        spouse: primarySpouse ? primarySpouse.name : '',
        spousePhoto: primarySpouse ? (primarySpouse.photo || '') : '',
        spouseIsAlive: primarySpouse ? (primarySpouse.isAlive ?? true) : true,
        spouseDomicile: primarySpouse ? (primarySpouse.domicile || '') : '',
        spousePhone: primarySpouse ? (primarySpouse.phone || '') : '',
        spouseBirthDate: primarySpouse ? (primarySpouse.birthDate || '') : '',
        spouseDeathDate: primarySpouse ? (primarySpouse.deathDate || '') : ''
      };

      await setDoc(getDocRef('members', id), payload);
      showToast('Data Anggota & Pasangan berhasil disimpan di Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'members');
      showToast('Gagal menyimpan data ke Firebase', 'error'); 
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl relative">
          
          {/* HEADER MODAL */}
          <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-20 shadow-xs">
            <h2 className="font-bold text-green-700 text-sm">
              {member ? 'Edit Anggota Keluarga' : 'Tambah Anggota Keluarga'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full cursor-pointer transition">
              <X size={20}/>
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4">
            
            {/* FOTO ANGGOTA DENGAN FITUR CROP */}
            <div className="flex flex-col items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
               <div className="relative w-24 h-24 rounded-full bg-white border-2 border-dashed border-green-400 flex items-center justify-center overflow-hidden mb-2 shadow-sm group">
                  {formData.photo ? (
                    <img src={formData.photo} className="w-full h-full object-cover" alt="Foto Anggota" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <Camera size={26} className="text-green-600 mb-0.5"/>
                      <span className="text-[9px] font-semibold">Pilih Foto</span>
                    </div>
                  )}
                  <input 
                    ref={memberFileInputRef}
                    type="file" 
                    accept="image/*" 
                    onChange={handleMemberPhotoFile} 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    title="Pilih gambar untuk dipotong"
                  />
               </div>

               <div className="flex items-center gap-2">
                 <button 
                   type="button" 
                   onClick={() => memberFileInputRef.current?.click()}
                   className="text-xs bg-green-50 text-green-700 font-bold px-3 py-1.5 rounded-xl border border-green-200 hover:bg-green-100 transition cursor-pointer flex items-center gap-1"
                 >
                   <Camera size={13} />
                   <span>{formData.photo ? 'Ganti & Potong Foto' : 'Unggah & Potong Foto'}</span>
                 </button>
                 {formData.photo && (
                   <button 
                     type="button" 
                     onClick={() => setFormData(prev => ({ ...prev, photo: '' }))} 
                     className="text-xs text-red-600 font-bold hover:bg-red-50 px-2 py-1.5 rounded-xl transition cursor-pointer"
                   >
                     Hapus
                   </button>
                 )}
               </div>
               <p className="text-[10px] text-gray-400 mt-1">Format foto otomatis dicrop lingkaran rapi</p>
            </div>

            {/* NAMA LENGKAP */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nama Lengkap *</label>
              <input 
                name="name" 
                value={formData.name || ''} 
                onChange={handleChange} 
                required 
                placeholder="Contoh: Ahmad Sumadi"
                className="w-full border-2 p-3 rounded-xl outline-none focus:border-green-500 font-medium" 
              />
            </div>

            {/* GENDER & STATUS */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Jenis Kelamin</label>
                <select 
                  name="gender" 
                  value={formData.gender || 'L'} 
                  onChange={handleChange} 
                  className="w-full border-2 p-3 rounded-xl bg-white font-medium outline-none focus:border-green-500"
                >
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Status Kehidupan</label>
                <select 
                  name="isAlive" 
                  value={formData.isAlive?.toString() ?? 'true'} 
                  onChange={(e) => setFormData(prev => ({ ...prev, isAlive: e.target.value === 'true' }))} 
                  className="w-full border-2 p-3 rounded-xl bg-white font-medium outline-none focus:border-green-500"
                >
                  <option value="true">Masih Hidup</option>
                  <option value="false">Meninggal (Alm)</option>
                </select>
              </div>
            </div>

            {/* TANGGAL LAHIR & WAFAT */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tanggal Lahir</label>
                <input 
                  type="date" 
                  name="birthDate" 
                  value={formData.birthDate || ''} 
                  onChange={handleChange} 
                  className="w-full border-2 p-3 rounded-xl text-xs font-medium outline-none focus:border-green-500" 
                />
              </div>
              {!formData.isAlive && (
                <div>
                  <label className="block text-xs font-bold text-red-500 mb-1">Tanggal Wafat</label>
                  <input 
                    type="date" 
                    name="deathDate" 
                    value={formData.deathDate || ''} 
                    onChange={handleChange} 
                    className="w-full border-2 border-red-200 p-3 rounded-xl text-xs font-medium text-red-600 outline-none focus:border-red-400" 
                  />
                </div>
              )}
            </div>

            {/* HUBUNGAN SILSILAH: PASANGAN (SEJAJAR) ATAU ANAK/KETURUNAN (KE BAWAH) */}
            <div className="bg-emerald-50/60 p-3.5 rounded-2xl border-2 border-emerald-200 space-y-3">
              <div>
                <label className="block text-xs font-black text-emerald-950 mb-1.5 uppercase tracking-wide">
                  Hubungan dalam Pohon Silsilah *
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition ${formData.relationType !== 'spouse' ? 'bg-white border-green-600 text-green-900 shadow-xs' : 'bg-white/50 border-gray-200 text-gray-500 hover:bg-white'}`}>
                    <input 
                      type="radio" 
                      name="relationType" 
                      checked={formData.relationType !== 'spouse'} 
                      onChange={() => setFormData(prev => ({ ...prev, relationType: 'child' }))}
                      className="accent-green-600"
                    />
                    <div className="flex flex-col">
                      <span className="font-black text-[11px]">Anak / Keturunan</span>
                      <span className="text-[9px] font-normal text-emerald-700">Garis silsilah ke bawah (┃)</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition ${formData.relationType === 'spouse' ? 'bg-white border-amber-600 text-amber-950 shadow-xs' : 'bg-white/50 border-gray-200 text-gray-500 hover:bg-white'}`}>
                    <input 
                      type="radio" 
                      name="relationType" 
                      checked={formData.relationType === 'spouse'} 
                      onChange={() => setFormData(prev => ({ ...prev, relationType: 'spouse' }))}
                      className="accent-amber-600"
                    />
                    <div className="flex flex-col">
                      <span className="font-black text-[11px]">Pasangan (Istri/Suami)</span>
                      <span className="text-[9px] font-normal text-amber-800">Garis silsilah sejajar (━ 💍 ━)</span>
                    </div>
                  </label>
                </div>
              </div>

              {formData.relationType === 'spouse' ? (
                <div>
                  <label className="block text-xs font-bold text-amber-950 mb-1">
                    Pasangan dari Anggota: *
                  </label>
                  <select 
                    name="parentId" 
                    value={formData.parentId ?? ''} 
                    onChange={handleChange} 
                    required
                    className="w-full border-2 border-amber-300 p-3 rounded-xl bg-white text-sm font-medium outline-none focus:border-amber-500"
                  >
                    <option value="">-- Pilih Pasangannya (Terhubung Sejajar) --</option>
                    {members.filter(m => m.id !== formData.id).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.domicile ? `(${m.domicile})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-amber-900 mt-1 font-medium flex items-center gap-1">
                    <span>✨</span>
                    <span>Pada menu pohon silsilah, kartu anggota ini akan terhubung <strong>sejajar horizontal (━ 💍 ━)</strong> di samping pasangannya.</span>
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-green-950 mb-1">
                    Orang Tua (Garis Keturunan ke Bawah):
                  </label>
                  <select 
                    name="parentId" 
                    value={formData.parentId ?? ''} 
                    onChange={handleChange} 
                    className="w-full border-2 border-green-300 p-3 rounded-xl bg-white text-sm font-medium outline-none focus:border-green-500"
                  >
                    <option value="">-- Puncak Silsilah / Generasi Pertama (Kosong) --</option>
                    {members.filter(m => m.id !== formData.id).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.domicile ? `(${m.domicile})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-emerald-800 mt-1 font-medium flex items-center gap-1">
                    <span>✨</span>
                    <span>Pada menu pohon silsilah, kartu anggota ini adalah keturunan, garis silsilah akan turun <strong>vertikal ke bawah (┃)</strong> dari orang tuanya.</span>
                  </p>
                </div>
              )}
            </div>

            {/* DOMISILI & NO HP */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Domisili (Kota)</label>
                <input 
                  name="domicile" 
                  placeholder="Contoh: Yogyakarta"
                  value={formData.domicile || ''} 
                  onChange={handleChange} 
                  className="w-full border-2 p-3 rounded-xl font-medium outline-none focus:border-green-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">No HP / WhatsApp</label>
                <input 
                  name="phone" 
                  placeholder="08xxxxxxxxxx"
                  value={formData.phone || ''} 
                  onChange={handleChange} 
                  className="w-full border-2 p-3 rounded-xl font-medium outline-none focus:border-green-500" 
                />
              </div>
            </div>
            
            {/* ======================================================== */}
            {/* SEKSI PASANGAN DENGAN FITUR MULTI-PASANGAN & CROP FOTO */}
            {/* ======================================================== */}
            <div className="pt-2 border-t border-gray-150">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                    Data Pasangan (Istri / Suami)
                  </h3>
                  <p className="text-[10px] text-gray-500">
                    Bisa tambah lebih dari 1 pasangan, otomatis tampil di pohon silsilah
                  </p>
                </div>
                {spousesList.length > 0 && (
                  <button 
                    type="button" 
                    onClick={handleAddSpouse}
                    className="text-[11px] font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Plus size={13} />
                    <span>Tambah Pasangan</span>
                  </button>
                )}
              </div>

              {spousesList.length === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-2 font-medium">Anggota ini belum menambahkan data pasangan.</p>
                  <button 
                    type="button"
                    onClick={handleAddSpouse}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>+ Tambah Pasangan</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {spousesList.map((spouse, sIdx) => {
                    const spouseLabel = formData.gender === 'L' ? `Istri ke-${sIdx + 1}` : `Suami ke-${sIdx + 1}`;

                    return (
                      <div key={spouse.id || sIdx} className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-4 space-y-3 relative shadow-xs">
                        
                        {/* HEADER PASANGAN */}
                        <div className="flex justify-between items-center pb-2 border-b border-emerald-100">
                          <span className="font-black text-xs text-emerald-900 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300">
                            {spousesList.length > 1 ? spouseLabel : 'Pasangan'}
                          </span>
                          <button 
                            type="button"
                            onClick={() => handleRemoveSpouse(sIdx)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-lg transition cursor-pointer text-xs font-bold flex items-center gap-1"
                            title="Hapus data pasangan ini"
                          >
                            <Trash2 size={14} />
                            <span>Hapus</span>
                          </button>
                        </div>

                        {/* FOTO PASANGAN DENGAN CROP */}
                        <div className="flex items-center gap-3 bg-white/80 p-3 rounded-xl border border-emerald-100">
                          <div className="relative w-14 h-14 rounded-full border-2 border-emerald-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                            {spouse.photo ? (
                              <img src={spouse.photo} className="w-full h-full object-cover" alt="Spouse" />
                            ) : (
                              <Camera size={18} className="text-emerald-500"/>
                            )}
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => handleSpousePhotoFile(e, sIdx)} 
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                              title="Pilih dan potong foto pasangan"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-emerald-950 mb-1">Foto Pasangan (Crop Lingkaran)</p>
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition cursor-pointer inline-block border border-emerald-200">
                                <span>{spouse.photo ? 'Ganti & Crop' : 'Pilih & Crop'}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => handleSpousePhotoFile(e, sIdx)} 
                                  className="hidden" 
                                />
                              </label>
                              {spouse.photo && (
                                <button 
                                  type="button" 
                                  onClick={() => handleSpouseChange(sIdx, 'photo', '')} 
                                  className="text-[10px] text-red-500 font-semibold hover:underline cursor-pointer"
                                >
                                  Hapus Foto
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* NAMA PASANGAN */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1">
                            Nama Pasangan *
                          </label>
                          <input 
                            placeholder="Nama lengkap pasangan..." 
                            value={spouse.name || ''} 
                            onChange={(e) => handleSpouseChange(sIdx, 'name', e.target.value)} 
                            required
                            className="w-full border-2 border-emerald-200 p-2.5 rounded-xl text-sm font-medium bg-white outline-none focus:border-green-500" 
                          />
                        </div>

                        {/* STATUS HIDUP & NO HP */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-1">Status Kehidupan</label>
                            <select 
                              value={spouse.isAlive?.toString() ?? 'true'} 
                              onChange={(e) => handleSpouseChange(sIdx, 'isAlive', e.target.value === 'true')} 
                              className="w-full border border-emerald-200 p-2 rounded-xl text-xs bg-white font-medium outline-none focus:border-green-500"
                            >
                              <option value="true">Masih Hidup</option>
                              <option value="false">Meninggal (Alm)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-1">No HP Pasangan</label>
                            <input 
                              placeholder="08xxxxxxxxxx" 
                              value={spouse.phone || ''} 
                              onChange={(e) => handleSpouseChange(sIdx, 'phone', e.target.value)} 
                              className="w-full border border-emerald-200 p-2 rounded-xl text-xs bg-white font-medium outline-none focus:border-green-500" 
                            />
                          </div>
                        </div>

                        {/* TANGGAL LAHIR & TANGGAL WAFAT */}
                        <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="block text-[10px] font-bold text-gray-600 mb-1">Tanggal Lahir</label>
                             <input 
                               type="date" 
                               value={spouse.birthDate || ''} 
                               onChange={(e) => handleSpouseChange(sIdx, 'birthDate', e.target.value)} 
                               className="w-full border border-emerald-200 p-2 rounded-xl text-xs bg-white font-medium outline-none focus:border-green-500" 
                             />
                           </div>
                           {!spouse.isAlive && (
                             <div>
                               <label className="block text-[10px] font-bold text-red-500 mb-1">Tanggal Wafat</label>
                               <input 
                                 type="date" 
                                 value={spouse.deathDate || ''} 
                                 onChange={(e) => handleSpouseChange(sIdx, 'deathDate', e.target.value)} 
                                 className="w-full border border-red-200 p-2 rounded-xl text-xs bg-white font-medium text-red-600 outline-none focus:border-red-400" 
                               />
                             </div>
                           )}
                        </div>

                        {/* DOMISILI PASANGAN */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 mb-1">Domisili Pasangan</label>
                          <input 
                            placeholder="Kota domisili pasangan..." 
                            value={spouse.domicile || ''} 
                            onChange={(e) => handleSpouseChange(sIdx, 'domicile', e.target.value)} 
                            className="w-full border border-emerald-200 p-2 rounded-xl text-xs bg-white font-medium outline-none focus:border-green-500" 
                          />
                        </div>

                      </div>
                    );
                  })}

                  {/* TOMBOL TAMBAH PASANGAN LAINNYA */}
                  <button 
                    type="button"
                    onClick={handleAddSpouse}
                    className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-dashed border-emerald-300 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>+ Tambah Pasangan Lagi ({formData.gender === 'L' ? 'Istri Lainnya' : 'Suami Lainnya'})</span>
                  </button>
                </div>
              )}
            </div>

            {/* TOMBOL AKSI SIMPAN */}
            <div className="flex gap-3 pt-3 sticky bottom-0 bg-white pb-2 z-10 border-t border-gray-100">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 py-3.5 border-2 rounded-xl font-bold text-gray-500 cursor-pointer hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button 
                type="submit" 
                className="flex-1 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold shadow-md cursor-pointer transition active:scale-98"
              >
                Simpan Data
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* POPUP CROPPER MODAL */}
      {cropperModal && (
        <ImageCropperModal
          imageSrc={cropperModal.imageSrc}
          title={cropperModal.title}
          onCrop={handleApplyCrop}
          onCancel={() => setCropperModal(null)}
        />
      )}
    </>
  );
}

// ==========================================
// TAMPILAN AGENDA, KAS, IURAN
// ==========================================
function AgendaTab({ agendas, isAdmin, showToast }: { agendas: Agenda[]; isAdmin: boolean; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Agenda | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const executeDelete = async (id: number) => {
    try {
      await deleteDoc(getDocRef('agendas', id));
      setItemToDelete(null);
      showToast('Agenda berhasil dihapus dari Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'agendas');
      showToast('Gagal menghapus agenda', 'error'); 
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-bold text-gray-800">Agenda Keluarga</h2></div>
      {isAdmin && <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl shadow-md transition flex justify-center cursor-pointer"><Plus size={20} className="mr-2" /> Tambah Agenda</button>}
      <div className="space-y-3">
        {[...agendas].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(a => (
          <div key={a.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-4 items-start">
            <div className="bg-green-50 border border-green-100 p-2.5 rounded-xl text-center min-w-[64px] h-fit">
              <p className="text-[10px] font-black text-green-700 uppercase">{new Date(a.date).toLocaleDateString('id-ID', { month: 'short' })}</p>
              <p className="text-2xl font-black text-green-800 my-0.5">{new Date(a.date).getDate()}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-800 text-base mb-1 truncate pr-2">{a.title}</h3>
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setEditingItem(a); setIsModalOpen(true); }} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg cursor-pointer"><Edit2 size={14}/></button>
                    <button onClick={() => setItemToDelete(a.id)} className="text-red-500 bg-red-50 p-1.5 rounded-lg cursor-pointer"><Trash2 size={14}/></button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mb-2">📍 {a.location}</p>
              <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 break-words">{a.desc}</p>
            </div>
          </div>
        ))}
        {agendas.length === 0 && <p className="text-center text-gray-400 py-10 text-sm font-medium">Belum ada agenda keluarga tercatat.</p>}
      </div>
      {isModalOpen && <ModalFormAgenda agenda={editingItem} showToast={showToast} onClose={() => setIsModalOpen(false)} />}
      {itemToDelete !== null && <ConfirmModal title="Hapus Agenda" message="Apakah Anda yakin ingin menghapus catatan agenda keluarga ini?" onCancel={() => setItemToDelete(null)} onConfirm={() => executeDelete(itemToDelete)} />}
    </div>
  );
}

function ModalFormAgenda({ agenda, showToast, onClose }: { agenda: Agenda | null; showToast: (m: string, t?: 'success' | 'error') => void; onClose: () => void }) {
  const [formData, setFormData] = useState<Partial<Agenda>>(agenda || { date: '', title: '', location: '', desc: '' });
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = agenda ? agenda.id : Date.now();
      await setDoc(getDocRef('agendas', id), { ...formData, id });
      showToast('Agenda berhasil disimpan di Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'agendas');
      showToast('Gagal menyimpan agenda ke Firebase', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-green-700 p-4 text-white font-bold text-sm">{agenda ? 'Edit Agenda' : 'Tambah Agenda'}</div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <input placeholder="Judul Acara" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-500" value={formData.title || ''} onChange={e=>setFormData({...formData, title: e.target.value})} />
          <input type="date" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-500" value={formData.date || ''} onChange={e=>setFormData({...formData, date: e.target.value})} />
          <input placeholder="Lokasi" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-500" value={formData.location || ''} onChange={e=>setFormData({...formData, location: e.target.value})} />
          <textarea placeholder="Keterangan" className="w-full border-2 p-3 rounded-xl text-sm resize-none outline-none focus:border-green-500" rows={3} value={formData.desc || ''} onChange={e=>setFormData({...formData, desc: e.target.value})} />
          <div className="flex gap-3"><button type="button" onClick={onClose} className="flex-1 py-3 border-2 rounded-xl text-sm font-bold text-gray-500 cursor-pointer">Batal</button><button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md cursor-pointer">Simpan</button></div>
        </form>
      </div>
    </div>
  );
}

function KasTab({ transactions, totalKas, formatRupiah, isAdmin, showToast }: { transactions: Transaction[]; totalKas: number; formatRupiah: (n: number) => string; isAdmin: boolean; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const handleDownloadJPEG = () => {
    const target = document.getElementById('kas-download-area');
    if (!target) return;
    setIsDownloading(true);
    const capture = () => {
      const h2c = (window as any).html2canvas;
      if (h2c) {
        h2c(target, { backgroundColor: '#ffffff', scale: 2 }).then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a');
          link.download = `Laporan_Kas.jpg`;
          link.href = canvas.toDataURL('image/jpeg');
          link.click();
          setIsDownloading(false);
        }).catch(() => setIsDownloading(false));
      } else {
        setIsDownloading(false);
      }
    };
    if (!(window as any).html2canvas) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = capture;
      document.body.appendChild(script);
    } else capture();
  };

  const executeDelete = async (id: number) => {
    try {
      await deleteDoc(getDocRef('transactions', id));
      setItemToDelete(null);
      showToast('Transaksi berhasil dihapus dari Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
      showToast('Gagal menghapus data di Firebase', 'error'); 
    }
  };

  return (
    <div className="space-y-4 pb-6">
       <div className="flex justify-between items-center mb-2">
         <h2 className="text-xl font-bold text-gray-800">Kas Keluarga</h2>
         <button onClick={handleDownloadJPEG} disabled={isDownloading} className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold flex items-center text-[11px] cursor-pointer disabled:opacity-50"><Download size={14} className="mr-1.5"/> {isDownloading ? 'Menyimpan...' : 'Unduh JPEG'}</button>
       </div>

      <div id="kas-download-area" className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-green-600 p-6 text-white relative overflow-hidden">
          <p className="text-[11px] font-semibold mb-1 opacity-90 tracking-wide uppercase">Total Saldo Kas</p>
          <h2 className="text-3xl font-black break-words relative z-10">{formatRupiah(totalKas)}</h2>
          <Wallet className="absolute -right-4 -bottom-4 opacity-20 w-36 h-36" />
        </div>
        <div className="px-5 py-3 bg-gray-50 border-b font-bold text-xs text-gray-500 uppercase">Riwayat Transaksi</div>
        <div className="divide-y">
          {transactions.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map(t => (
            <div key={t.id} className="p-5 flex justify-between items-center">
              <div className="flex-1 pr-4">
                <p className="font-bold text-sm text-gray-800 truncate">{t.desc}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{new Date(t.date).toLocaleDateString('id-ID')}</p>
              </div>
              <div className="text-right flex items-center">
                <div className="mr-3">
                  <p className={`font-bold text-[13px] ${t.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>{t.type === 'in' ? '+' : '-'}{formatRupiah(t.amount)}</p>
                </div>
                {isAdmin && !isDownloading && (
                  <div className="flex gap-1 border-l pl-3">
                    <button onClick={() => {setEditingItem(t); setIsModalOpen(true);}} className="text-blue-500 bg-white border p-1.5 rounded-lg cursor-pointer"><Edit2 size={14}/></button>
                    <button onClick={() => setItemToDelete(t.id)} className="text-red-500 bg-white border p-1.5 rounded-lg cursor-pointer"><Trash2 size={14}/></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {transactions.length === 0 && <p className="p-8 text-center text-gray-400 text-xs font-medium">Belum ada riwayat keuangan.</p>}
        </div>
        <div className="py-2.5 text-center bg-gray-50 border-t"><p className="text-[8px] text-gray-400 uppercase font-black tracking-widest">Keluarga Besar KH. SUMADI &bull; by Falah</p></div>
      </div>
      {isAdmin && !isDownloading && <button onClick={() => {setEditingItem(null); setIsModalOpen(true);}} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center shadow-md hover:bg-green-700 transition mt-4 cursor-pointer"><Plus size={18} className="mr-2"/> Tambah Transaksi</button>}
      
      {isModalOpen && <ModalFormKas item={editingItem} showToast={showToast} onClose={() => setIsModalOpen(false)} />}
      {itemToDelete !== null && <ConfirmModal title="Hapus Riwayat Kas" message="Yakin menghapus catatan transaksi ini? Total uang kas akan terhitung ulang di Firebase." onCancel={() => setItemToDelete(null)} onConfirm={() => executeDelete(itemToDelete)} />}
    </div>
  );
}

function ModalFormKas({ item, showToast, onClose }: { item: Transaction | null; showToast: (m: string, t?: 'success' | 'error') => void; onClose: () => void }) {
  const [formData, setFormData] = useState<Partial<Transaction>>(item || { date: new Date().toISOString().split('T')[0], type: 'in', amount: 0, desc: '' });
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = item ? item.id : Date.now();
      await setDoc(getDocRef('transactions', id), { ...formData, id, amount: Number(formData.amount) });
      showToast('Transaksi berhasil disimpan di Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'transactions');
      showToast('Gagal menyimpan ke Firebase', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-green-700 p-4 text-white font-bold text-sm">{item ? 'Edit Transaksi Kas' : 'Catat Keuangan'}</div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="flex bg-gray-100 rounded-xl p-1.5 border shadow-inner">
            <button type="button" onClick={() => setFormData({...formData, type: 'in'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${formData.type === 'in' ? 'bg-white text-green-600 shadow-md' : 'text-gray-500'}`}>Pemasukan (+)</button>
            <button type="button" onClick={() => setFormData({...formData, type: 'out'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${formData.type === 'out' ? 'bg-white text-red-600 shadow-md' : 'text-gray-500'}`}>Pengeluaran (-)</button>
          </div>
          <input type="date" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-500" value={formData.date || ''} onChange={e=>setFormData({...formData, date:e.target.value})} />
          <input type="number" placeholder="Nominal (Rp)" required className="w-full border-2 p-3 rounded-xl text-xl font-black outline-none focus:border-green-500" value={formData.amount || ''} onChange={e=>setFormData({...formData, amount: Number(e.target.value)})} />
          <input placeholder="Keterangan Transaksi" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-500" value={formData.desc || ''} onChange={e=>setFormData({...formData, desc:e.target.value})} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 text-gray-600 rounded-xl text-sm font-bold cursor-pointer">Batal</button>
            <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md cursor-pointer">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IuranTab({ iuranSessions, formatRupiah, isAdmin, showToast }: { iuranSessions: IuranSession[]; formatRupiah: (n: number) => string; isAdmin: boolean; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const sortedSessions = [...iuranSessions].sort((a,b) => b.id - a.id);
  const [activeSid, setActiveSid] = useState<number | null>(null);
  
  useEffect(() => { if (!activeSid && sortedSessions.length > 0) setActiveSid(sortedSessions[0].id); }, [sortedSessions, activeSid]);

  const activeSession = iuranSessions.find(s => s.id === activeSid) || null;
  const total = activeSession?.data.reduce((a, b) => a + b.amount, 0) || 0;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewSessOpen, setIsNewSessOpen] = useState(false);
  const [isEditSessOpen, setIsEditSessOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IuranRow | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const handleDownload = () => {
    const el = document.getElementById('iuran-area');
    if(!el) return;
    setIsDownloading(true);
    const trigger = () => {
      const h2c = (window as any).html2canvas;
      if (h2c) {
        h2c(el, { scale: 2, backgroundColor: '#ffffff' }).then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a');
          link.download = `Data_Iuran_${activeSession?.title?.substring(0,10) || 'Keluarga'}.jpg`;
          link.href = canvas.toDataURL('image/jpeg');
          link.click();
          setIsDownloading(false);
        }).catch(() => setIsDownloading(false));
      } else {
        setIsDownloading(false);
      }
    };
    if (!(window as any).html2canvas) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = trigger;
      document.body.appendChild(script);
    } else trigger();
  };

  const executeDeleteSession = async (id: number) => {
     try {
       await deleteDoc(getDocRef('iuranSessions', id));
       setActiveSid(null);
       setSessionToDelete(null);
       showToast('Lembar data berhasil dihapus dari Firebase', 'success');
     } catch (err) { 
       handleFirestoreError(err, OperationType.DELETE, 'iuranSessions');
       showToast('Gagal menghapus lembar di Firebase', 'error'); 
     }
  };

  const executeDeleteItem = async (rowId: number) => {
     if (!activeSession) return;
     try {
       const newData = activeSession.data.filter(x => x.id !== rowId);
       await setDoc(getDocRef('iuranSessions', activeSession.id), { ...activeSession, data: newData });
       setItemToDelete(null);
       showToast('Baris data berhasil dihapus di Firebase', 'success');
     } catch (err) { 
       handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
       showToast('Gagal menghapus baris data', 'error'); 
     }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex justify-between items-center mb-2">
         <h2 className="text-xl font-bold text-gray-800">Data Iuran</h2>
         {activeSession && <button onClick={handleDownload} disabled={isDownloading} className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold flex items-center text-[11px] shadow-sm cursor-pointer disabled:opacity-50"><Download size={14} className="mr-1.5"/> {isDownloading ? '...' : 'Unduh JPEG'}</button>}
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pilih Lembar Data Iuran:</p>
        {iuranSessions.length > 0 ? (
           <div className="flex items-center gap-2">
             <select className="flex-1 border-2 p-3 rounded-xl text-sm font-bold bg-gray-50 outline-none truncate" value={activeSid || ''} onChange={e => setActiveSid(Number(e.target.value))}>
               {sortedSessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
             </select>
             {isAdmin && activeSession && (
                <div className="flex gap-1.5 border-l pl-2">
                   <button onClick={() => setIsEditSessOpen(true)} className="p-3 bg-blue-50 text-blue-600 rounded-xl cursor-pointer" title="Edit Nama Lembar"><Edit2 size={16}/></button>
                   <button onClick={() => setSessionToDelete(activeSid)} className="p-3 bg-red-50 text-red-600 rounded-xl cursor-pointer" title="Hapus Lembar"><Trash2 size={16}/></button>
                </div>
             )}
           </div>
        ) : <p className="text-xs text-gray-400 italic text-center py-4">Belum ada lembar data.</p>}
        {isAdmin && <button onClick={() => setIsNewSessOpen(true)} className="w-full text-blue-600 bg-blue-50 text-sm font-bold py-3.5 rounded-xl border border-blue-100 flex items-center justify-center gap-2 cursor-pointer hover:bg-blue-100 transition"><FolderPlus size={18}/> Buat Lembar Baru</button>}
      </div>

      {isAdmin && activeSession && !isDownloading && <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center shadow-md cursor-pointer hover:bg-green-700 transition"><Plus size={20} className="mr-2" /> Tambah Baris Anggota</button>}

      {activeSession && (
         <div id="iuran-area" className="bg-white rounded-2xl shadow-sm border overflow-hidden mt-6">
           <div className="bg-green-700 p-5 text-white text-center">
             <h3 className="font-black text-lg uppercase tracking-widest mb-1.5">REKAP IURAN KELUARGA</h3>
             <div className="inline-block bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm border border-white/30">{activeSession.title}</div>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-gray-700">
               <thead className="bg-gray-100 border-b text-xs uppercase text-gray-500">
                 <tr>
                   <th className="p-3 text-center w-12 font-black border-r">No</th>
                   <th className="p-3 text-left font-black border-r">Nama Anggota</th>
                   <th className="p-3 text-right font-black border-r">Nominal</th>
                   {isAdmin && !isDownloading && <th className="p-3 text-center font-black">Aksi</th>}
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {activeSession.data.map((x, i) => (
                   <tr key={x.id} className="hover:bg-gray-50">
                     <td className="p-3 text-center font-medium border-r text-gray-500">{i + 1}</td>
                     <td className="p-3 font-bold border-r text-gray-800">{x.name}</td>
                     <td className="p-3 text-right font-black text-green-700 border-r">{formatRupiah(x.amount)}</td>
                     {isAdmin && !isDownloading && (
                       <td className="p-3 text-center">
                         <div className="flex justify-center gap-1.5">
                            <button onClick={() => {setEditingItem(x); setIsModalOpen(true);}} className="text-blue-500 bg-white border p-1 rounded-md cursor-pointer"><Edit2 size={13}/></button>
                            <button onClick={() => setItemToDelete(x.id)} className="text-red-500 bg-white border p-1 rounded-md cursor-pointer"><Trash2 size={13}/></button>
                         </div>
                       </td>
                     )}
                   </tr>
                 ))}
                 {activeSession.data.length === 0 && <tr><td colSpan={isAdmin && !isDownloading ? 4 : 3} className="p-8 text-center text-gray-400 italic">Data kosong.</td></tr>}
               </tbody>
               <tfoot className="bg-green-50 border-t-2 border-green-600">
                 <tr>
                   <td colSpan={2} className="p-4 font-black text-right text-gray-800 border-r border-green-200">TOTAL KESELURUHAN :</td>
                   <td className="p-4 font-black text-right text-green-800 text-lg border-r border-green-200">{formatRupiah(total)}</td>
                   {isAdmin && !isDownloading && <td></td>}
                 </tr>
               </tfoot>
             </table>
           </div>
           <div className="py-2.5 text-center bg-gray-50 border-t"><p className="text-[8px] text-gray-400 uppercase font-black tracking-widest">Keluarga Besar KH. SUMADI &bull; by Falah</p></div>
         </div>
      )}
      
      {isModalOpen && activeSession && <ModalFormIuranItem item={editingItem} activeSession={activeSession} showToast={showToast} onClose={() => setIsModalOpen(false)} />}
      
      {isNewSessOpen && <ModalSess title="" label="Buat Lembar Data Baru" onClose={() => setIsNewSessOpen(false)} onSave={async (t) => { 
        try {
          const n = { id: Date.now(), title: t, data: [] }; 
          await setDoc(getDocRef('iuranSessions', n.id), n); 
          setActiveSid(n.id); 
          setIsNewSessOpen(false); 
          showToast('Lembar baru berhasil disimpan di Firebase', 'success'); 
        } catch (err) { 
          handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
          showToast('Gagal membuat lembar', 'error'); 
        }
      }} />}
      
      {isEditSessOpen && (
        <ModalSess title={activeSession?.title || ''} label="Edit Nama Lembar" onClose={() => setIsEditSessOpen(false)} onSave={async (t) => { 
          if (!activeSession) return;
          try {
            await setDoc(getDocRef('iuranSessions', activeSession.id), {...activeSession, title: t}); 
            setIsEditSessOpen(false); 
            showToast('Nama lembar berhasil diubah di Firebase', 'success'); 
          } catch (err) { 
            handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
            showToast('Gagal mengubah nama', 'error'); 
          }
        }} />
      )}
      
      {sessionToDelete !== null && <ConfirmModal title="Hapus Lembar Iuran" message="Yakin menghapus seluruh lembar data ini dari Firebase? Semua isinya akan hilang permanen." onCancel={() => setSessionToDelete(null)} onConfirm={() => executeDeleteSession(sessionToDelete)} />}
      {itemToDelete !== null && <ConfirmModal title="Hapus Data" message="Hapus baris iuran anggota ini?" onCancel={() => setItemToDelete(null)} onConfirm={() => executeDeleteItem(itemToDelete)} />}
    </div>
  );
}

function ModalFormIuranItem({ item, activeSession, showToast, onClose }: { item: IuranRow | null; activeSession: IuranSession; showToast: (m: string, t?: 'success' | 'error') => void; onClose: () => void }) {
  const [formData, setFormData] = useState<{ name: string; amount: string | number }>(item ? { name: item.name, amount: item.amount } : { name: '', amount: '' });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: IuranRow = { id: item ? item.id : Date.now(), name: formData.name, amount: Number(formData.amount) };
      let newData: IuranRow[];
      if (item) newData = activeSession.data.map(x => x.id === item.id ? payload : x);
      else newData = [...activeSession.data, payload];
      
      await setDoc(getDocRef('iuranSessions', activeSession.id), { ...activeSession, data: newData });
      showToast('Data iuran berhasil disimpan di Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
      showToast('Gagal menyimpan iuran', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-green-700 p-4 text-white font-bold text-sm">{item ? 'Edit Baris Iuran' : 'Catat Iuran Baru'}</div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <input placeholder="Nama Anggota" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-green-600 font-bold" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} autoFocus />
          <input type="number" placeholder="Nominal (Rp)" required className="w-full border-2 p-3 rounded-xl text-xl font-black text-green-700 outline-none focus:border-green-600" value={formData.amount} onChange={e=>setFormData({...formData, amount: e.target.value})} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 text-gray-600 rounded-xl font-bold cursor-pointer">Batal</button>
            <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-md cursor-pointer">Simpan Data</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalSess({ title, label, onClose, onSave }: { title: string; label: string; onClose: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState(title || '');
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-blue-600 p-4 text-white font-bold text-sm flex items-center"><FolderPlus size={18} className="mr-2"/> {label}</div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(t); }} className="p-5 space-y-4">
          <input placeholder="Misal: Data iuran bapak santoso" required className="w-full border-2 p-3 rounded-xl text-sm outline-none focus:border-blue-600 font-bold" value={t} onChange={e=>setT(e.target.value)} autoFocus />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 text-gray-600 rounded-xl font-bold cursor-pointer">Batal</button>
            <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md cursor-pointer">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
}

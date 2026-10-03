import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Calendar, Wallet, Network, LayoutDashboard, 
  LogOut, Plus, Edit2, Trash2, Search, ChevronLeft, 
  ChevronRight, Camera, Image as ImageIcon, UploadCloud, X, Download, FolderPlus,
  Minus, Maximize, FileText, CheckCircle, Lock, ShieldCheck,
  ArrowUp, ArrowDown, GripVertical, MapPin, Infinity as InfinityIcon, Phone,
  TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, Layers,
  Clock, ChevronDown, Check, Sparkles, Filter,
  Bell, BellRing, Volume2, VolumeX
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { 
  auth, 
  getColRef, 
  getDocRef, 
  signInAnonymously, 
  signInWithCustomToken, 
  getDocs, 
  getDoc,
  setDoc, 
  deleteDoc, 
  onSnapshot,
  handleFirestoreError,
  OperationType,
  cleanFirestoreData
} from './firebase';

import ImageCropperModal from './ImageCropperModal';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineIndicator } from './OfflineIndicator';
import { SplashScreen } from './SplashScreen';
import { toBlob, toJpeg } from 'html-to-image';
import {
  playNotificationChime,
  startAlarmLoop,
  stopAlarmSound,
  isAlarmPlaying,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  isAlarmSoundEnabled,
  setAlarmSoundEnabled,
  getAgendaTargetTimestamp,
  syncAgendasToServiceWorker,
  triggerAgendaAlarm,
  testAlarmSoundAndNotification,
  unlockAudioContext
} from './audioNotification';

// Helper unduh langsung file JPEG ke memori / folder unduhan perangkat (Android, iOS, dan Desktop)
export async function exportElementAsJPEG(
  elementId: string, 
  filename: string, 
  showToast?: (m: string, t?: 'success' | 'error') => void
): Promise<boolean> {
  const target = document.getElementById(elementId);
  if (!target) {
    showToast?.('Area data tidak ditemukan', 'error');
    return false;
  }

  const safeFilename = filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? filename : `${filename}.jpg`;

  try {
    const pixelRatio = typeof window !== 'undefined' && window.devicePixelRatio && window.devicePixelRatio > 1 
      ? Math.min(window.devicePixelRatio, 2) 
      : 2;

    const options = {
      quality: 0.95,
      backgroundColor: '#ffffff',
      pixelRatio: pixelRatio,
      cacheBust: true,
      style: {
        transform: 'none',
        margin: '0'
      }
    };

    // 1. Coba metode toBlob untuk unduhan langsung via Blob Object URL
    let blob: Blob | null = null;
    try {
      blob = await toBlob(target, options);
    } catch (blobErr) {
      console.warn('toBlob error, attempting toJpeg fallback:', blobErr);
    }

    if (blob) {
      // Langsung download file JPEG ke folder Download perangkat
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.download = safeFilename;
      a.href = blobUrl;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(blobUrl);
      }, 2000);
      showToast?.('File JPEG berhasil diunduh ke perangkat', 'success');
      return true;
    }

    // 2. Fallback jika toBlob tidak menghasilkan blob: gunakan toJpeg (dataUrl) dan langsung unduh
    const dataUrl = await toJpeg(target, options);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.download = safeFilename;
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
    }, 1000);
    showToast?.('File JPEG berhasil diunduh ke perangkat', 'success');
    return true;
  } catch (err: any) {
    console.error('Export JPEG error:', err);
    showToast?.('Gagal memproses gambar JPEG: ' + (err?.message || 'terjadi kendala'), 'error');
    return false;
  }
}

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
  motherId?: number | null;
  branch?: 'istri1' | 'istri2';
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
  parentSpouseName?: string;
  spouseIndex?: number;
  order?: number;
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
      // Pastikan m2 bukan anak (anak tidak boleh dianggap pasangan)
      if (m2.relationType === 'child') return;

      const isSpouseOfThis = 
        m2.id !== m.id && 
        (
          m2.spouseOfId === m.id || 
          (m2.relationType === 'spouse' && (m2.spouseOfId === m.id || m2.parentId === m.id)) ||
          // Deteksi istri KH. Sumadi
          (m.id === 1 && (m2.id === 2 || m2.id === 3 || m2.name?.toLowerCase().includes('istri')))
        );

      if (isSpouseOfThis) {
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

  // Mbah Munasikah adalah Istri 1 (Pertama), Mbah Masripah adalah Istri 2 (Kedua)
  if (m.id === 1) {
    result.sort((a, b) => {
      const aIsMunasikah = a.name.toLowerCase().includes('munasikah');
      const bIsMunasikah = b.name.toLowerCase().includes('munasikah');
      if (aIsMunasikah && !bIsMunasikah) return -1;
      if (!aIsMunasikah && bIsMunasikah) return 1;
      return 0;
    });
  }

  return result;
};

export const getMemberBranch = (member: Member, allMembers: Member[]): 'istri1' | 'istri2' => {
  if (member.name?.toLowerCase().includes('munasikah')) return 'istri1';
  if (member.name?.toLowerCase().includes('masripah')) return 'istri2';

  if (member.branch === 'istri1') return 'istri1';
  if (member.branch === 'istri2') return 'istri2';

  const munasikah = allMembers.find(m => m.name.toLowerCase().includes('munasikah'));
  const masripah = allMembers.find(m => m.name.toLowerCase().includes('masripah'));

  if (munasikah && (member.parentId === munasikah.id || member.motherId === munasikah.id)) return 'istri1';
  if (masripah && (member.parentId === masripah.id || member.motherId === masripah.id)) return 'istri2';

  if (member.parentId) {
    const parent = allMembers.find(m => m.id === member.parentId);
    if (parent) return getMemberBranch(parent, allMembers);
  }
  if (member.motherId) {
    const mother = allMembers.find(m => m.id === member.motherId);
    if (mother) return getMemberBranch(mother, allMembers);
  }
  return 'istri1';
};

export const getMemberParentName = (member: Member, allMembers: Member[]): string => {
  if (member.id === 1) return 'Pemuncak Silsilah (Akar Utama)';
  
  const munasikah = allMembers.find(m => m.name.toLowerCase().includes('munasikah'));
  const masripah = allMembers.find(m => m.name.toLowerCase().includes('masripah'));

  if (munasikah && member.id === munasikah.id) return '-';
  if (masripah && member.id === masripah.id) return '-';
  if (member.id === 2 || member.id === 3) return '-';

  // Keturunan Langsung Mbah KH Sumadi & Mbah Munasikah (Istri 1 / Istri Pertama)
  const isDirectMunasikahChild = 
    (munasikah && member.parentId === munasikah.id) ||
    member.parentId === 2 ||
    (member.parentId === 1 && (member.branch === 'istri1' || (munasikah && member.motherId === munasikah.id))) ||
    (!member.parentId && member.branch === 'istri1');

  // Keturunan Langsung Mbah KH Sumadi & Mbah Masripah (Istri 2 / Istri Kedua)
  const isDirectMasripahChild = 
    (masripah && member.parentId === masripah.id) ||
    member.parentId === 3 ||
    (member.parentId === 1 && (member.branch === 'istri2' || (masripah && member.motherId === masripah.id))) ||
    (!member.parentId && member.branch === 'istri2');

  if (isDirectMunasikahChild) {
    return `Mbah KH. Sumadi & ${munasikah ? munasikah.name : 'Mbah Munasikah (Istri 1)'}`;
  }
  if (isDirectMasripahChild) {
    return `Mbah KH. Sumadi & ${masripah ? masripah.name : 'Mbah Masripah (Istri 2)'}`;
  }

  if (member.parentId) {
    const parent = allMembers.find(m => m.id === member.parentId);
    if (parent) {
      if (member.parentSpouseName) {
        return `${parent.name} & ${member.parentSpouseName}`;
      }
      const spouses = getMemberSpouses(parent, allMembers);
      if (member.spouseIndex !== undefined && member.spouseIndex !== null && spouses[member.spouseIndex]) {
        return `${parent.name} & ${spouses[member.spouseIndex].name}`;
      }
      if (spouses.length > 0) {
        return `${parent.name} & ${spouses[0].name}`;
      }
      const spouse = allMembers.find(s => s.id === parent.spouseOfId || (s.parentId === parent.id && s.relationType === 'spouse')) || (parent.spouse ? { name: parent.spouse } : null);
      return spouse ? `${parent.name} & ${spouse.name}` : parent.name;
    }
  }
  return '-';
};

// =========================================================================
// PERHITUNGAN GENERASI ANGGOTA SILSILAH KELUARGA BANI KH. SUMADI
// Generasi 1: Mbah KH. Sumadi dan kedua istrinya (Mbah Munasikah & Mbah Masripah)
// Generasi 2: Anak-anak dari Generasi 1
// Generasi 3: Anak-anak dari Generasi 2 (Cucu)
// Generasi 4: Anak-anak dari Generasi 3 (Cicit), dan seterusnya
// =========================================================================
export function getMemberGeneration(m: Member, allMembers: Member[]): number {
  const memberMap = new Map<number, Member>();
  allMembers.forEach(mem => memberMap.set(mem.id, mem));

  const isGen1 = (item: Member): boolean => {
    if (item.id === 1 || item.id === 2 || item.id === 3) return true;
    const nameLower = (item.name || '').toLowerCase();
    if (nameLower.includes('sumadi') && !item.parentId) return true;
    if (nameLower.includes('munasikah') || nameLower.includes('masripah')) return true;
    if (item.spouseOfId === 1) return true;
    if (item.relationType === 'spouse' && (item.parentId === 1 || item.spouseOfId === 1)) return true;
    return false;
  };

  const memo = new Map<number, number>();

  const compute = (cur: Member, visited: Set<number>): number => {
    if (isGen1(cur)) return 1;
    if (memo.has(cur.id)) return memo.get(cur.id)!;
    if (visited.has(cur.id)) return 2; // hindari siklus tak terbatas
    visited.add(cur.id);

    // Jika record ini adalah entitas pasangan dari anggota lain (relationType spouse)
    if (cur.relationType === 'spouse' && cur.spouseOfId && cur.spouseOfId !== cur.id) {
      const spouseMember = memberMap.get(cur.spouseOfId);
      if (spouseMember) {
        const gen = compute(spouseMember, visited);
        memo.set(cur.id, gen);
        return gen;
      }
    }

    // Periksa parentId (ayah / orang tua utama)
    if (cur.parentId) {
      // Jika orang tua adalah Pemuncak Silsilah (Mbah Sumadi / Istri 1 / Istri 2)
      if (cur.parentId === 1 || cur.parentId === 2 || cur.parentId === 3) {
        memo.set(cur.id, 2);
        return 2;
      }
      const parent = memberMap.get(cur.parentId);
      if (parent) {
        const parentGen = compute(parent, visited);
        const curGen = parentGen + 1;
        memo.set(cur.id, curGen);
        return curGen;
      }
    }

    // Periksa motherId (ibu)
    if (cur.motherId) {
      if (cur.motherId === 2 || cur.motherId === 3) {
        memo.set(cur.id, 2);
        return 2;
      }
      const mother = memberMap.get(cur.motherId);
      if (mother) {
        const motherGen = compute(mother, visited);
        const curGen = motherGen + 1;
        memo.set(cur.id, curGen);
        return curGen;
      }
    }

    // Anggota dengan cabang istri1 atau istri2 langsung tanpa parentId terspesifikasi
    if (cur.branch === 'istri1' || cur.branch === 'istri2') {
      memo.set(cur.id, 2);
      return 2;
    }

    memo.set(cur.id, 2);
    return 2;
  };

  return compute(m, new Set<number>());
}

export function getGenerationLabel(gen: number): { 
  title: string; 
  subtitle: string; 
  badge: string; 
  icon: string;
  dotColor: string;
} {
  switch (gen) {
    case 1:
      return { 
        title: 'Generasi 1', 
        subtitle: 'Mbah KH. Sumadi & Kedua Istri', 
        badge: 'bg-amber-100 text-amber-900 border-amber-300',
        dotColor: 'bg-amber-500',
        icon: '👑' 
      };
    case 2:
      return { 
        title: 'Generasi 2', 
        subtitle: 'Anak', 
        badge: 'bg-blue-100 text-blue-900 border-blue-300',
        dotColor: 'bg-blue-500',
        icon: '🌿' 
      };
    case 3:
      return { 
        title: 'Generasi 3', 
        subtitle: 'Cucu', 
        badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        dotColor: 'bg-emerald-500',
        icon: '🍃' 
      };
    case 4:
      return { 
        title: 'Generasi 4', 
        subtitle: 'Cicit', 
        badge: 'bg-purple-100 text-purple-900 border-purple-300',
        dotColor: 'bg-purple-500',
        icon: '🌱' 
      };
    case 5:
      return { 
        title: 'Generasi 5', 
        subtitle: 'Piut / Canggah', 
        badge: 'bg-rose-100 text-rose-900 border-rose-300',
        dotColor: 'bg-rose-500',
        icon: '🌸' 
      };
    case 6:
      return { 
        title: 'Generasi 6', 
        subtitle: 'Wareng', 
        badge: 'bg-teal-100 text-teal-900 border-teal-300',
        dotColor: 'bg-teal-500',
        icon: '✨' 
      };
    default:
      return { 
        title: `Generasi ${gen}`, 
        subtitle: `Keturunan Generasi ke-${gen}`, 
        badge: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        dotColor: 'bg-indigo-500',
        icon: '⭐' 
      };
  }
}

export interface Agenda {
  id: number;
  date: string;
  time?: string;
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
  title?: string;
  subtitle?: string;
  description?: string;
}

export interface KasSession {
  id: number;
  title: string;
  transactions: Transaction[];
}

export function extractKasSessionSortKey(session: KasSession): {
  reuniNumber: number | null;
  maxYear: number | null;
  maxTransactionTime: number;
  createdId: number;
} {
  const title = (session.title || '').trim().toLowerCase();
  
  let reuniNumber: number | null = null;
  
  // 1. Cek nomor reuni format: "reuni ke 9", "reuni ke-9", "kas reuni 9", "ke-9", "ke 9"
  const reuniNumMatch = title.match(/(?:reuni|pertemuan|acara|kas)\s*(?:ke|ke-)?\s*(\d+)/i) ||
                        title.match(/\bke-?\s*(\d+)\b/i);
  if (reuniNumMatch && reuniNumMatch[1]) {
    const num = parseInt(reuniNumMatch[1], 10);
    if (!isNaN(num) && num < 1900) {
      reuniNumber = num;
    }
  }

  // Cek angka romawi (misal: "ke-IX", "ke VIII", "reuni IX", "ke-X", dll)
  if (reuniNumber === null) {
    const romanMatch = title.match(/\b(?:ke-?\s*)?(x{0,3}(?:ix|iv|v?i{0,3}))\b/i);
    if (romanMatch && romanMatch[1] && romanMatch[1].length > 0) {
      const romanMap: Record<string, number> = {
        'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
        'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10,
        'xi': 11, 'xii': 12, 'xiii': 13, 'xiv': 14, 'xv': 15,
        'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20
      };
      const rVal = romanMap[romanMatch[1].toLowerCase()];
      if (rVal) reuniNumber = rVal;
    }
  }

  // Jika belum ketemu nomor reuni eksplisit, cari angka 1-3 digit yang bukan tahun
  if (reuniNumber === null) {
    const genericNum = title.match(/\b(\d{1,3})\b/);
    if (genericNum && genericNum[1]) {
      const g = parseInt(genericNum[1], 10);
      if (!isNaN(g)) reuniNumber = g;
    }
  }

  // 2. Cek Tahun dalam judul (misal: 2026, 2025)
  let maxYear: number | null = null;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch && yearMatch[1]) {
    maxYear = parseInt(yearMatch[1], 10);
  }

  // 3. Cek tanggal transaksi terbaru di dalam lembar kas
  let maxTransactionTime = 0;
  if (session.transactions && session.transactions.length > 0) {
    for (const t of session.transactions) {
      if (t.date) {
        const time = new Date(t.date).getTime();
        if (!isNaN(time) && time > maxTransactionTime) {
          maxTransactionTime = time;
        }
      }
    }
  }

  return {
    reuniNumber,
    maxYear,
    maxTransactionTime,
    createdId: typeof session.id === 'number' ? session.id : 0
  };
}

export function compareKasSessionsDescending(a: KasSession, b: KasSession): number {
  const keyA = extractKasSessionSortKey(a);
  const keyB = extractKasSessionSortKey(b);

  // 1. Prioritaskan nomor reuni (misal: Reuni ke 9 lebih baru / terakhir daripada Reuni ke 8)
  if (keyA.reuniNumber !== null && keyB.reuniNumber !== null) {
    if (keyA.reuniNumber !== keyB.reuniNumber) {
      return keyB.reuniNumber - keyA.reuniNumber;
    }
  } else if (keyA.reuniNumber !== null && keyB.reuniNumber === null) {
    return -1;
  } else if (keyA.reuniNumber === null && keyB.reuniNumber !== null) {
    return 1;
  }

  // 2. Bandingkan Tahun di judul jika ada
  if (keyA.maxYear !== null && keyB.maxYear !== null) {
    if (keyA.maxYear !== keyB.maxYear) {
      return keyB.maxYear - keyA.maxYear;
    }
  } else if (keyA.maxYear !== null && keyB.maxYear === null) {
    return -1;
  } else if (keyA.maxYear === null && keyB.maxYear !== null) {
    return 1;
  }

  // 3. Bandingkan tanggal transaksi terbaru
  if (keyA.maxTransactionTime !== keyB.maxTransactionTime && keyA.maxTransactionTime > 0 && keyB.maxTransactionTime > 0) {
    return keyB.maxTransactionTime - keyA.maxTransactionTime;
  }

  // 4. Fallback ke ID
  return keyB.createdId - keyA.createdId;
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

export function extractIuranSessionSortKey(session: IuranSession): {
  reuniNumber: number | null;
  maxYear: number | null;
  createdId: number;
} {
  const title = (session.title || '').trim().toLowerCase();
  let reuniNumber: number | null = null;
  const match = title.match(/(?:reuni|pertemuan|iuran|kas)\s*(?:ke|ke-)?\s*(\d+)/i) ||
                title.match(/\bke-?\s*(\d+)\b/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num < 1900) reuniNumber = num;
  }
  let maxYear: number | null = null;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch && yearMatch[1]) {
    maxYear = parseInt(yearMatch[1], 10);
  }
  return { reuniNumber, maxYear, createdId: typeof session.id === 'number' ? session.id : 0 };
}

export function compareIuranSessionsDescending(a: IuranSession, b: IuranSession): number {
  const keyA = extractIuranSessionSortKey(a);
  const keyB = extractIuranSessionSortKey(b);
  if (keyA.reuniNumber !== null && keyB.reuniNumber !== null) {
    if (keyA.reuniNumber !== keyB.reuniNumber) return keyB.reuniNumber - keyA.reuniNumber;
  } else if (keyA.reuniNumber !== null && keyB.reuniNumber === null) return -1;
  else if (keyA.reuniNumber === null && keyB.reuniNumber !== null) return 1;

  if (keyA.maxYear !== null && keyB.maxYear !== null) {
    if (keyA.maxYear !== keyB.maxYear) return keyB.maxYear - keyA.maxYear;
  } else if (keyA.maxYear !== null && keyB.maxYear === null) return -1;
  else if (keyA.maxYear === null && keyB.maxYear !== null) return 1;

  return keyB.createdId - keyA.createdId;
}

const rawInitialMembers: Member[] = [
  { id: 1, name: "Mbah KH. Sumadi", isAlive: false, gender: "L", parentId: null, spouse: "", domicile: "Pondok Pesantren", phone: "-", birthDate: "1935-01-01", deathDate: "2005-05-10", photo: "", spousePhoto: "", spouseIsAlive: false, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "" },
  { id: 2, name: "Mbah Munasikah (Istri 1)", isAlive: false, gender: "P", parentId: null, relationType: 'spouse', spouseOfId: 1, spouse: "", domicile: "Pondok Pesantren", phone: "-", birthDate: "1938-03-12", deathDate: "2010-08-20", photo: "", spousePhoto: "", spouseIsAlive: false, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "", branch: "istri1" },
  { id: 3, name: "Mbah Masripah (Istri 2)", isAlive: false, gender: "P", parentId: null, relationType: 'spouse', spouseOfId: 1, spouse: "", domicile: "Pondok Pesantren", phone: "-", birthDate: "1942-07-22", deathDate: "2015-11-05", photo: "", spousePhoto: "", spouseIsAlive: false, spouseDomicile: "", spousePhone: "", spouseBirthDate: "", spouseDeathDate: "", branch: "istri2" }
];

const initialMembers: Member[] = rawInitialMembers.map((m, idx) => ({ ...m, order: idx }));

const initialAgendas: Agenda[] = [
  { id: 1, date: "2026-11-15", time: "08:00", title: "Reuni Akbar & Silaturrahim Bani KH. Sumadi ke-10", location: "Kediaman Utama Keluarga, Tuban / Lamongan", desc: "Pertemuan akbar seluruh keturunan dan keluarga besar Bani KH. Sumadi" },
  { id: 2, date: "2026-12-25", time: "09:00", title: "Pengajian & Doa Bersama Akhir Tahun", location: "Pondok Pesantren", desc: "Khataman Al-Qur'an dan doa bersama untuk masyayikh" }
];

const initialTransactions: Transaction[] = [
  { id: 1, date: "2026-05-15", type: "in", amount: 500000, desc: "Donasi Budi" },
  { id: 2, date: "2026-05-10", type: "out", amount: 50000, desc: "Biaya admin bank" },
  { id: 3, date: "2026-05-01", type: "in", amount: 9650000, desc: "Sisa Saldo Bulan Lalu" }
];

const initialKasSessions: KasSession[] = [
  {
    id: 1,
    title: "Kas Utama Keluarga",
    transactions: initialTransactions
  }
];

const initialSliderImages: SliderImage[] = [
  { 
    id: 1, 
    url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Keluarga Besar KH. SUMADI",
    subtitle: "Menjalin Silaturrahim, Mempererat Persaudaraan"
  },
  { 
    id: 2, 
    url: "https://images.unsplash.com/photo-1609220136736-443140cffec6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Kebersamaan Bani Sumadi",
    subtitle: "Guyub Rukun Saklawase Menjaga Amanah Keluarga"
  }
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
  const [treeFocusTarget, setTreeFocusTarget] = useState<{ memberId?: number; spouseName?: string; name?: string; timestamp?: number } | null>(null);
  
  // TOAST NOTIFICATION STATE
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // State tersinkronisasi Firebase Cloud (dengan data awal agar langsung bisa diakses offline)
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [agendas, setAgendas] = useState<Agenda[]>(initialAgendas);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [kasSessions, setKasSessions] = useState<KasSession[]>(initialKasSessions);
  const [sliderImages, setSliderImages] = useState<SliderImage[]>(initialSliderImages);
  const [iuranSessions, setIuranSessions] = useState<IuranSession[]>(initialIuranSessions);
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
        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch (anonErr) {
            console.warn("Anonymous auth notice:", anonErr);
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

  // Mutator Instan State (Optimistic Updates agar perubahan admin langsung tampil tanpa perlu refresh)
  const handleUpdateMember = (updated: Member) => {
    setMembers(prev => {
      const exists = prev.some(m => m.id === updated.id);
      const next = exists ? prev.map(m => m.id === updated.id ? updated : m) : [...prev, updated];
      return next.sort((a, b) => {
        const ordA = typeof a.order === 'number' ? a.order : a.id;
        const ordB = typeof b.order === 'number' ? b.order : b.id;
        return ordA - ordB;
      });
    });
  };

  const handleDeleteMember = (id: number) => {
    setMembers(prev => prev.filter(m => m.id !== id).map(m => m.parentId === id ? { ...m, parentId: null } : m));
  };

  const handleReorderMembers = (newMembers: Member[]) => {
    setMembers(newMembers);
  };

  const handleUpdateAgenda = (updated: Agenda) => {
    setAgendas(prev => {
      const exists = prev.some(a => a.id === updated.id);
      return exists ? prev.map(a => a.id === updated.id ? updated : a) : [...prev, updated];
    });
  };

  const handleDeleteAgenda = (id: number) => {
    setAgendas(prev => prev.filter(a => a.id !== id));
  };

  const handleUpdateKasSession = (updated: KasSession) => {
    setKasSessions(prev => {
      const exists = prev.some(s => s.id === updated.id);
      return exists ? prev.map(s => s.id === updated.id ? updated : s) : [updated, ...prev];
    });
  };

  const handleDeleteKasSession = (id: number) => {
    setKasSessions(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateIuranSession = (updated: IuranSession) => {
    setIuranSessions(prev => {
      const exists = prev.some(s => s.id === updated.id);
      return exists ? prev.map(s => s.id === updated.id ? updated : s) : [updated, ...prev];
    });
  };

  const handleDeleteIuranSession = (id: number) => {
    setIuranSessions(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateSliderImages = (images: SliderImage[]) => {
    setSliderImages(images);
  };

  // Sync Real-Time Firestore Cloud Database
  useEffect(() => {
    if (!isFirebaseReady) return;

    const seedDatabase = async () => {
      if (hasSeeded.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      hasSeeded.current = true;

      const refs = [
        { name: 'members', data: initialMembers },
        { name: 'agendas', data: initialAgendas },
        { name: 'transactions', data: initialTransactions },
        { name: 'kasSessions', data: initialKasSessions },
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
        snap => {
          const list = snap.docs.map(d => ({...d.data(), id: Number(d.id)} as Member));
          list.sort((a, b) => {
            const ordA = typeof a.order === 'number' ? a.order : a.id;
            const ordB = typeof b.order === 'number' ? b.order : b.id;
            return ordA - ordB;
          });
          setMembers(list);
        },
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
      onSnapshot(getColRef('kasSessions'), 
        snap => setKasSessions(snap.docs.map(d => ({...d.data(), id: Number(d.id)} as KasSession))),
        err => handleFirestoreError(err, OperationType.GET, 'kasSessions')
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

  const latestKasSession = useMemo(() => {
    if (kasSessions.length === 0) return null;
    return [...kasSessions].sort(compareKasSessionsDescending)[0];
  }, [kasSessions]);

  const totalKas = useMemo(() => {
    if (latestKasSession) {
      const currentTx = latestKasSession.transactions || [];
      const totalIn = currentTx.filter(t => t.type === 'in').reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      const totalOut = currentTx.filter(t => t.type === 'out').reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      return totalIn - totalOut;
    }
    return transactions.reduce((acc, curr) => curr.type === 'in' ? acc + Number(curr.amount || 0) : acc - Number(curr.amount || 0), 0);
  }, [latestKasSession, transactions]);
  const formatRupiah = (number: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);

  const nextAgenda = useMemo(() => {
    if (agendas.length === 0) return null;
    const nowTime = Date.now();
    const sorted = [...agendas].sort((a, b) => getAgendaTargetTimestamp(a) - getAgendaTargetTimestamp(b));
    // Cari agenda terdekat yang belum lewat atau sedang berlangsung (toleransi rentang 18 jam)
    const upcoming = sorted.find(a => getAgendaTargetTimestamp(a) + (18 * 60 * 60 * 1000) > nowTime);
    return upcoming || sorted[sorted.length - 1] || null;
  }, [agendas]);

  // State untuk agenda yang alarm suaranya sedang berdering aktif
  const [ringingAgenda, setRingingAgenda] = useState<Agenda | null>(null);

  // 1. Sinkronisasi otomatis daftar agenda ke Service Worker PWA
  // Memastikan notifikasi dan bunyi alarm berbunyi tepat waktu meskipun aplikasi sedang ditutup
  useEffect(() => {
    if (agendas.length > 0) {
      syncAgendasToServiceWorker(agendas);
    }
  }, [agendas]);

  // 2. Tangkap parameter URL (?alarm=1) dan pesan Service Worker saat dibuka dari notifikasi latar belakang
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('alarm') === '1') {
      const agendaId = Number(params.get('agendaId'));
      const target = agendas.find(a => a.id === agendaId) || nextAgenda;
      if (target) {
        setRingingAgenda(target);
        if (isAlarmSoundEnabled()) {
          startAlarmLoop();
        }
      }
    }

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRIGGER_ALARM_SOUND') {
        const agendaId = event.data.agendaId;
        const target = agendas.find(a => a.id === agendaId) || nextAgenda;
        if (target) {
          setRingingAgenda(target);
          if (isAlarmSoundEnabled()) {
            startAlarmLoop();
          }
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [agendas, nextAgenda]);

  // 3. Loop pemeriksaan hitungan mundur tiba saat tab terbuka / di latar belakang
  useEffect(() => {
    const checkAllAgendasDue = () => {
      const now = Date.now();
      for (const a of agendas) {
        const targetTime = getAgendaTargetTimestamp(a);
        if (targetTime > 0) {
          const diff = now - targetTime;
          // Jika waktu telah tiba dalam 1 jam terakhir dan belum pernah dibunyikan
          if (diff >= 0 && diff < 60 * 60 * 1000) {
            triggerAgendaAlarm(a, () => {
              setRingingAgenda(a);
            });
          }
        }
      }
    };

    const timer = setInterval(checkAllAgendasDue, 2000);
    return () => clearInterval(timer);
  }, [agendas]);

  const handleStopGlobalAlarm = () => {
    stopAlarmSound();
    setRingingAgenda(null);
  };

  if (!isFirebaseReady) return <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center font-bold text-green-700">Menghubungkan Database Firebase...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center font-sans text-gray-800">
      {/* LOGO PEMBUKA / OPENING SPLASH SCREEN */}
      <SplashScreen minDisplayTimeMs={1700} />

      <div className="w-full max-w-md bg-white shadow-xl relative pb-20 flex flex-col min-h-screen overflow-hidden">
        
        {/* GLOBAL TOAST NOTIFICATION */}
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[400] px-5 py-3 rounded-full shadow-2xl font-bold text-xs text-white animate-fade-in flex items-center w-max max-w-[90%] ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <CheckCircle size={18} className="mr-2"/> : <X size={18} className="mr-2"/>}
            {toast.message}
          </div>
        )}

        {/* MODAL / BANNER GLOBAL KETIKA ALARM AGENDA BERBUNYI */}
        {ringingAgenda && (
          <div className="fixed inset-x-0 top-3 z-[450] px-3 pointer-events-none flex justify-center animate-bounce-short">
            <div className="w-full max-w-sm bg-gradient-to-r from-red-600 via-rose-700 to-amber-600 text-white rounded-3xl p-4 shadow-2xl border-2 border-amber-300 pointer-events-auto">
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 animate-pulse text-2xl">
                    🔔
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-200 block truncate">
                      Waktunya Acara Telah Tiba!
                    </span>
                    <h4 className="font-black text-sm text-white truncate">
                      {ringingAgenda.title}
                    </h4>
                    <p className="text-[11px] text-amber-100/90 font-medium truncate">
                      {ringingAgenda.location ? `📍 ${ringingAgenda.location}` : 'Acara keluarga dimulai sekarang'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleStopGlobalAlarm}
                  className="p-1 rounded-xl bg-white/20 hover:bg-white/30 text-white cursor-pointer transition flex-shrink-0"
                  title="Tutup Notifikasi Alarm"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/20 flex gap-2">
                <button
                  onClick={handleStopGlobalAlarm}
                  className="flex-1 py-2 px-3 bg-white text-red-700 hover:bg-amber-100 rounded-xl text-xs font-black shadow cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  <VolumeX size={14} /> Matikan Alarm
                </button>
                <button
                  onClick={() => {
                    handleStopGlobalAlarm();
                    setActiveTab('agenda');
                  }}
                  className="py-2 px-3 bg-red-950/40 hover:bg-red-950/60 text-white border border-white/30 rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1"
                >
                  <Calendar size={13} /> Buka Agenda
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HEADER */}
        <header className="bg-green-700 text-white p-3 sm:p-3.5 sticky top-0 z-20 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
             <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full p-0.5 bg-gradient-to-tr from-amber-400 to-yellow-300 shadow-md shrink-0 flex items-center justify-center overflow-hidden">
               <img 
                 src="/logo.jpg" 
                 alt="Logo Bani Sumadi" 
                 referrerPolicy="no-referrer"
                 className="w-full h-full object-cover rounded-full"
               />
             </div>
             <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-sm sm:text-base font-black tracking-wide leading-tight truncate">
                    Keluarga Besar KH. SUMADI
                  </h1>
                  {authRole === 'admin' ? (
                    <span className="bg-amber-400 text-amber-950 font-black text-[8.5px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm shrink-0">
                      <ShieldCheck size={11} /> Admin
                    </span>
                  ) : (
                    <span className="bg-green-800/90 text-green-200 font-semibold text-[8.5px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      Anggota
                    </span>
                  )}
                </div>
                <span className="text-[9.5px] font-medium text-green-100 opacity-90 tracking-normal mt-0.5 truncate">
                  Menjalin Silaturrahim, Mempererat Persaudaraan
                </span>
             </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />
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
             {activeTab === 'dash' && (
               <DashboardTab 
                 members={members} 
                 totalKas={totalKas} 
                 latestKasTitle={latestKasSession?.title} 
                 nextAgenda={nextAgenda} 
                 formatRupiah={formatRupiah} 
                 sliderImages={sliderImages} 
                 isAdmin={authRole === 'admin'} 
                 showToast={showToast} 
                 onNavigateTab={setActiveTab} 
                 onUpdateSliderImages={handleUpdateSliderImages}
                 ringingAgenda={ringingAgenda}
                 onTriggerAlarm={(ag) => setRingingAgenda(ag)}
                 onStopAlarm={handleStopGlobalAlarm}
               />
             )}
             {activeTab === 'pohon' && <PohonSilsilahTab members={members} showToast={showToast} onNavigateTab={setActiveTab} focusTarget={treeFocusTarget} onClearFocus={() => setTreeFocusTarget(null)} />}
             {activeTab === 'anggota' && (
               <AnggotaTab 
                 members={members} 
                 isAdmin={authRole === 'admin'} 
                 showToast={showToast} 
                 onNavigateTab={setActiveTab} 
                 onFocusInTree={(target) => { setTreeFocusTarget({ ...target, timestamp: Date.now() }); setActiveTab('pohon'); }} 
                 onUpdateMember={handleUpdateMember}
                 onDeleteMember={handleDeleteMember}
                 onReorderMembers={handleReorderMembers}
               />
             )}
             {activeTab === 'agenda' && (
               <AgendaTab 
                 agendas={agendas} 
                 isAdmin={authRole === 'admin'} 
                 showToast={showToast} 
                 onUpdateAgenda={handleUpdateAgenda}
                 onDeleteAgenda={handleDeleteAgenda}
               />
             )}
             {activeTab === 'kas' && (
               <KasTab 
                 kasSessions={kasSessions} 
                 legacyTransactions={transactions} 
                 totalKas={totalKas} 
                 formatRupiah={formatRupiah} 
                 isAdmin={authRole === 'admin'} 
                 showToast={showToast} 
                 onUpdateKasSession={handleUpdateKasSession}
                 onDeleteKasSession={handleDeleteKasSession}
               />
             )}
             {activeTab === 'iuran' && (
               <IuranTab 
                 iuranSessions={iuranSessions} 
                 members={members}
                 formatRupiah={formatRupiah} 
                 isAdmin={authRole === 'admin'} 
                 showToast={showToast} 
                 onUpdateIuranSession={handleUpdateIuranSession}
                 onDeleteIuranSession={handleDeleteIuranSession}
               />
             )}
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

        {/* OFFLINE STATUS NOTIFICATION */}
        <OfflineIndicator />
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
// HITUNGAN MUNDUR AGENDA TERDEKAT
// ==========================================
function calculateTimeLeft(dateStr: string, timeStr?: string) {
  const now = new Date();
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  let hours = 8;
  let minutes = 0;
  if (timeStr && timeStr.includes(':')) {
    const tParts = timeStr.split(':');
    hours = parseInt(tParts[0], 10) || 8;
    minutes = parseInt(tParts[1], 10) || 0;
  }

  const target = new Date(year, month, day, hours, minutes, 0, 0);
  const diffMs = target.getTime() - now.getTime();

  // Acara sedang berlangsung jika telah tiba jam mulai hingga 18 jam ke depan
  const isPastWithinEventWindow = diffMs <= 0 && diffMs > -(18 * 60 * 60 * 1000);
  const isPassed = diffMs <= -(18 * 60 * 60 * 1000);

  if (isPastWithinEventWindow) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isToday: true,
      isDueNow: true,
      isPassed: false,
      totalSecondsLeft: 0,
      diffMs,
      target
    };
  }

  if (isPassed) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isToday: false,
      isDueNow: false,
      isPassed: true,
      totalSecondsLeft: 0,
      diffMs,
      target
    };
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const secondsLeft = Math.floor((diffMs % (1000 * 60)) / 1000);

  return {
    days,
    hours: hoursLeft,
    minutes: minutesLeft,
    seconds: secondsLeft,
    isToday: false,
    isDueNow: false,
    isPassed: false,
    totalSecondsLeft: Math.floor(diffMs / 1000),
    diffMs,
    target
  };
}

function AgendaCountdownCard({ 
  agenda, 
  onNavigateTab,
  onTriggerAlarm,
  isAlarmActive,
  onStopAlarm
}: { 
  agenda: Agenda; 
  onNavigateTab?: (tab: 'dash' | 'pohon' | 'anggota' | 'agenda' | 'kas' | 'iuran') => void; 
  onTriggerAlarm?: (agenda: Agenda) => void;
  isAlarmActive?: boolean;
  onStopAlarm?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(agenda.date, agenda.time));
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => isAlarmSoundEnabled());
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermissionStatus());
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  useEffect(() => {
    const updateCountdown = () => {
      const current = calculateTimeLeft(agenda.date, agenda.time);
      setTimeLeft(current);
      // Jika waktu hitungan mundur telah tiba (00:00:00 atau saat ini jatuh tempo)
      if (current.isDueNow) {
        triggerAgendaAlarm(agenda, () => {
          onTriggerAlarm?.(agenda);
        });
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [agenda.date, agenda.time, agenda.id]);

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isSoundEnabled;
    setIsSoundEnabled(next);
    setAlarmSoundEnabled(next);
    if (!next) {
      stopAlarmSound();
      onStopAlarm?.();
    }
  };

  const handleTestSound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTestingSound(true);
    setTestFeedback('Membunyikan...');
    try {
      const res = await testAlarmSoundAndNotification();
      setNotifPermission(getNotificationPermissionStatus());
      setTestFeedback(res.permitted ? 'Suara & Notif Aktif! 🔔' : 'Suara Berbunyi! 🔊');
      setTimeout(() => setTestFeedback(null), 3000);
    } catch {
      setTestFeedback('Selesai');
      setTimeout(() => setTestFeedback(null), 2000);
    } finally {
      setIsTestingSound(false);
    }
  };

  const handleRequestNotif = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? 'granted' : 'denied');
  };

  return (
    <div 
      onClick={() => onNavigateTab?.('agenda')}
      className="bg-gradient-to-br from-emerald-950 via-teal-900 to-indigo-950 rounded-3xl p-4 sm:p-5 text-white shadow-lg border border-emerald-500/30 relative overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-300 group"
      title="Klik untuk membuka menu Agenda Keluarga"
    >
      <div className="absolute -right-10 -top-10 w-44 h-44 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/25 transition-all duration-500"></div>
      <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-blue-500/15 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <Clock size={13} className="text-emerald-400" />
              Hitungan Mundur Agenda Terdekat
            </span>
          </div>
          <span className="text-[10px] bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition">
            Lihat Detail <ChevronRight size={12} />
          </span>
        </div>

        {/* BANNER JIKA ALARM SEDANG BERBUNYI SAAT INI */}
        {isAlarmActive && (
          <div className="bg-red-600/90 border-2 border-amber-300 text-white p-3 rounded-2xl animate-pulse flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-bounce">🔔</span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-200">Waktunya Acara Telah Tiba!</p>
                <p className="text-[11px] font-semibold text-white">Alarm suara sedang berdering otomatis</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                stopAlarmSound();
                onStopAlarm?.();
              }}
              className="bg-white text-red-700 hover:bg-amber-100 font-black text-xs px-3 py-1.5 rounded-xl shadow cursor-pointer transition flex items-center gap-1 flex-shrink-0"
            >
              <VolumeX size={14} /> Matikan Alarm
            </button>
          </div>
        )}

        <div>
          <h3 className="font-black text-base sm:text-lg text-white drop-shadow-xs line-clamp-1 group-hover:text-emerald-200 transition-colors">
            {agenda.title}
          </h3>
          <div className="text-xs text-emerald-100/80 flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 font-medium">
              <Calendar size={13} className="text-emerald-300" />
              {new Date(agenda.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1 font-semibold text-amber-300 bg-black/30 px-2 py-0.5 rounded-lg border border-amber-400/20">
              <Clock size={12} className="text-amber-400" />
              {agenda.time ? `${agenda.time} WIB` : '08:00 WIB'}
            </span>
            {agenda.location && (
              <span className="flex items-center gap-1 truncate font-medium">
                <MapPin size={13} className="text-emerald-300" />
                {agenda.location}
              </span>
            )}
          </div>
        </div>

        {timeLeft.isToday ? (
          <div className="bg-emerald-500/25 border border-emerald-400/50 rounded-2xl py-3 px-4 text-center">
            <p className="text-sm sm:text-base font-black text-emerald-200 animate-pulse flex items-center justify-center gap-2">
              <span>🎉</span>
              <span>Waktunya Acara Telah Tiba & Sedang Berlangsung!</span>
            </p>
          </div>
        ) : timeLeft.isPassed ? (
          <div className="bg-white/10 rounded-2xl p-3 text-center border border-white/10">
            <p className="text-xs font-semibold text-gray-200">Agenda ini telah terlaksana.</p>
            <p className="text-[11px] text-emerald-300 font-bold mt-1">Klik untuk menjadwalkan agenda reuni / pertemuan berikutnya →</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 pt-0.5">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 text-center border border-white/15 shadow-inner">
              <div className="text-xl sm:text-2xl font-black text-white leading-none font-mono">
                {String(timeLeft.days).padStart(2, '0')}
              </div>
              <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-300 mt-1">
                Hari
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 text-center border border-white/15 shadow-inner">
              <div className="text-xl sm:text-2xl font-black text-white leading-none font-mono">
                {String(timeLeft.hours).padStart(2, '0')}
              </div>
              <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-300 mt-1">
                Jam
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 text-center border border-white/15 shadow-inner">
              <div className="text-xl sm:text-2xl font-black text-white leading-none font-mono">
                {String(timeLeft.minutes).padStart(2, '0')}
              </div>
              <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-300 mt-1">
                Menit
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 text-center border border-white/15 shadow-inner">
              <div className="text-xl sm:text-2xl font-black text-amber-300 leading-none font-mono">
                {String(timeLeft.seconds).padStart(2, '0')}
              </div>
              <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-amber-300 mt-1">
                Detik
              </div>
            </div>
          </div>
        )}

        {/* KONTROL PENGINGAT SUARA & NOTIFIKASI OTOMATIS */}
        <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSound}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold transition cursor-pointer ${
                isSoundEnabled 
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30' 
                  : 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/10'
              }`}
              title="Klik untuk menyalakan atau mematikan alarm suara otomatis"
            >
              {isSoundEnabled ? <Volume2 size={13} className="text-emerald-400" /> : <VolumeX size={13} className="text-gray-400" />}
              <span>Alarm Suara: {isSoundEnabled ? 'Aktif' : 'Mati'}</span>
            </button>

            <button
              onClick={handleTestSound}
              disabled={isTestingSound}
              className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 px-2.5 py-1 rounded-xl font-bold transition cursor-pointer"
              title="Uji coba suara lonceng alarm dan notifikasi sistem sekarang"
            >
              <BellRing size={12} className={isTestingSound ? "animate-bounce text-amber-300" : "text-amber-300"} />
              <span>{testFeedback || 'Tes Suara'}</span>
            </button>
          </div>

          {notifPermission !== 'granted' ? (
            <button
              onClick={handleRequestNotif}
              className="flex items-center gap-1 text-[10px] text-amber-300 font-semibold bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-400/20 cursor-pointer transition"
              title="Aktifkan izin agar alarm dapat berbunyi saat aplikasi ditutup"
            >
              <Bell size={11} />
              <span>Aktifkan Izin Latar Belakang</span>
            </button>
          ) : (
            <span className="text-[10px] text-emerald-300/80 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              Otomatis berbunyi meski app ditutup
            </span>
          )}
        </div>
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
  latestKasTitle,
  nextAgenda, 
  formatRupiah, 
  sliderImages, 
  isAdmin, 
  showToast,
  onNavigateTab,
  onUpdateSliderImages,
  ringingAgenda,
  onTriggerAlarm,
  onStopAlarm
}: { 
  members: Member[]; 
  totalKas: number; 
  latestKasTitle?: string;
  nextAgenda?: Agenda | null; 
  formatRupiah: (n: number) => string; 
  sliderImages: SliderImage[]; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
  onNavigateTab?: (tab: 'dash' | 'pohon' | 'anggota' | 'agenda' | 'kas' | 'iuran') => void;
  onUpdateSliderImages?: (images: SliderImage[]) => void;
  ringingAgenda?: Agenda | null;
  onTriggerAlarm?: (agenda: Agenda) => void;
  onStopAlarm?: () => void;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [fullScreenIndex, setFullScreenIndex] = useState<number | null>(null);
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
    if (sliderImages.length > 1 && fullScreenIndex === null && !isPhotoModalOpen) {
      const timer = setInterval(() => setCurrentSlide(p => (p + 1) % sliderImages.length), 4500);
      return () => clearInterval(timer);
    }
  }, [sliderImages, fullScreenIndex, isPhotoModalOpen]);

  return (
    <div className="space-y-5 pb-6">
      {/* PWA INSTALL BANNER */}
      <PWAInstallButton variant="banner" />

      {/* KARTU INTERAKTIF: SALDO KAS & AGENDA */}
      <div className="grid grid-cols-2 gap-3">
        {/* CARD SALDO KAS (INTERAKTIF -> KLIK MENUJU TAB KAS) */}
        <div 
          onClick={() => onNavigateTab?.('kas')}
          className="group bg-gradient-to-br from-green-600 via-emerald-700 to-green-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl relative overflow-hidden flex flex-col justify-between cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border border-green-500/30"
          title="Klik untuk membuka menu Kas Keuangan"
        >
          <div className="flex justify-between items-start z-10">
            <p className="text-[11px] font-bold tracking-wider opacity-90 uppercase">SALDO KAS</p>
            <span className="text-[9px] bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 group-hover:bg-white/30 transition">
              Lihat <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="my-1 z-10">
            <h2 className="text-xl font-black break-words leading-tight">{formatRupiah(totalKas)}</h2>
            <p className="text-[9px] text-green-100/85 font-medium mt-0.5 truncate" title={latestKasTitle ? `Saldo terbaru • ${latestKasTitle}` : 'Buka buku kas & transaksi'}>
              {latestKasTitle ? `• ${latestKasTitle}` : 'Buka buku kas & transaksi'}
            </p>
          </div>
          <Wallet className="absolute -right-3 -bottom-3 opacity-15 w-20 h-20 group-hover:scale-110 group-hover:opacity-25 transition-all duration-300 pointer-events-none" />
        </div>

        {/* CARD AGENDA (INTERAKTIF -> KLIK MENUJU TAB AGENDA) */}
        <div 
          onClick={() => onNavigateTab?.('agenda')}
          className="group bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl flex flex-col justify-between relative overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border border-blue-400/30"
          title="Klik untuk membuka menu Agenda"
        >
          <div className="flex justify-between items-start z-10">
            <p className="text-[11px] font-bold tracking-wider opacity-90 uppercase truncate max-w-[90px]">
              {nextAgenda ? 'AGENDA DEKAT' : 'AGENDA'}
            </p>
            <span className="text-[9px] bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 group-hover:bg-white/30 transition">
              Lihat <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="my-1 z-10">
            {nextAgenda ? (
              <>
                <div className="flex items-baseline">
                  <h2 className="text-2xl font-black leading-none mr-1.5">{new Date(nextAgenda.date).getDate()}</h2>
                  <span className="text-xs font-bold uppercase">{new Date(nextAgenda.date).toLocaleString('id-ID', { month: 'short', year: 'numeric' })}</span>
                </div>
                <p className="text-[10px] font-semibold text-blue-100 truncate mt-0.5">{nextAgenda.title}</p>
              </>
            ) : (
              <>
                <span className="text-sm font-bold opacity-90">Belum ada agenda</span>
                <p className="text-[9px] text-blue-100/70 font-medium">Klik untuk tambah agenda</p>
              </>
            )}
          </div>
          <Calendar className="absolute -right-2 -bottom-2 opacity-15 w-18 h-18 group-hover:scale-110 group-hover:opacity-25 transition-all duration-300 pointer-events-none" />
        </div>
      </div>

      {/* FITUR HITUNGAN MUNDUR DARI AGENDA TERDEKAT */}
      {nextAgenda ? (
        <AgendaCountdownCard 
          agenda={nextAgenda} 
          onNavigateTab={onNavigateTab}
          onTriggerAlarm={onTriggerAlarm}
          isAlarmActive={ringingAgenda?.id === nextAgenda.id}
          onStopAlarm={onStopAlarm}
        />
      ) : (
        <div 
          onClick={() => onNavigateTab?.('agenda')}
          className="bg-gradient-to-br from-emerald-950 via-teal-900 to-indigo-950 rounded-3xl p-4 sm:p-5 text-white shadow-lg border border-emerald-500/30 relative overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-300 group"
          title="Klik untuk membuka menu Agenda Keluarga"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <Clock size={13} className="text-emerald-400" />
                Hitungan Mundur Agenda Terdekat
              </span>
            </div>
            <span className="text-[10px] bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition">
              Kelola Agenda <ChevronRight size={12} />
            </span>
          </div>
          <p className="text-sm font-bold text-gray-200">Belum ada agenda keluarga terdekat yang dijadwalkan.</p>
          <p className="text-xs text-emerald-200/70 mt-1">Klik di sini untuk melihat kalender atau menambahkan agenda pertemuan/reuni baru.</p>
        </div>
      )}

      {/* SLIDER FOTO DASHBOARD DENGAN CLICK TO ENLARGE YANG AKURAT */}
      <div className="rounded-3xl overflow-hidden relative h-56 sm:h-64 shadow-md bg-gray-900 flex items-center justify-center group">
        {sliderImages.length > 0 ? (
          <>
            {sliderImages.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => setFullScreenIndex(idx)}
                className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${
                  idx === currentSlide 
                    ? 'opacity-100 z-10 pointer-events-auto cursor-pointer' 
                    : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <img 
                  src={img.url} 
                  className="w-full h-full object-cover select-none" 
                  alt={img.title || "Slide"} 
                />
              </div>
            ))}

            {/* OVERLAY TULISAN/KETERANGAN PADA SLIDE AKTIF */}
            <div 
              onClick={() => setFullScreenIndex(currentSlide)}
              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent flex flex-col justify-end p-4 text-white z-20 pointer-events-auto cursor-pointer"
            >
              <div className="flex justify-between items-end gap-2">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="font-bold text-base sm:text-lg leading-snug drop-shadow-md truncate">
                    {sliderImages[currentSlide]?.title || 'Keluarga Besar KH. SUMADI'}
                  </h3>
                  <p className="text-xs text-gray-200 opacity-90 drop-shadow-xs line-clamp-2 mt-0.5">
                    {sliderImages[currentSlide]?.subtitle || sliderImages[currentSlide]?.description || 'Menjalin Silaturrahim, Mempererat Persaudaraan'}
                  </p>
                </div>
                <span className="text-[10px] bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-full font-bold flex-shrink-0 flex items-center gap-1 border border-white/20 shadow-xs">
                  Perbesar <Maximize size={10} />
                </span>
              </div>
            </div>

            {/* TOMBOL PREV / NEXT */}
            {sliderImages.length > 1 && (
              <>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setCurrentSlide((p) => (p - 1 + sliderImages.length) % sliderImages.length); 
                  }} 
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 backdrop-blur-xs p-2 rounded-full text-white transition z-30 cursor-pointer shadow-md"
                  title="Foto Sebelumnya"
                >
                  <ChevronLeft size={20}/>
                </button>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setCurrentSlide((p) => (p + 1) % sliderImages.length); 
                  }} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 backdrop-blur-xs p-2 rounded-full text-white transition z-30 cursor-pointer shadow-md"
                  title="Foto Selanjutnya"
                >
                  <ChevronRight size={20}/>
                </button>

                {/* INDIKATOR NOMOR & DOTS */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-30 bg-black/50 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/10">
                  <span className="text-[10px] font-bold text-white mr-0.5">{currentSlide + 1}/{sliderImages.length}</span>
                  {sliderImages.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      onClick={(e) => { e.stopPropagation(); setCurrentSlide(dotIdx); }}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${dotIdx === currentSlide ? 'bg-white w-4' : 'bg-white/40 w-1.5 hover:bg-white/70'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="text-gray-400 text-sm flex flex-col items-center">
            <ImageIcon size={36} className="mb-2 opacity-50"/> 
            <span>Belum ada foto dashboard</span>
          </div>
        )}
      </div>

      {isAdmin && (
        <button 
          onClick={() => setIsPhotoModalOpen(true)} 
          className="w-full bg-white border border-gray-200 hover:border-green-400 text-gray-700 hover:text-green-700 font-bold py-3 rounded-2xl flex items-center justify-center text-sm shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <Camera size={18} className="mr-2 text-green-600" /> 
          Kelola Foto & Tulisan Dashboard
        </button>
      )}

      {/* STATISTIK ANGGOTA KELUARGA */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Total Anggota" value={totAnggota} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Laki-laki" value={totLaki} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Perempuan" value={totPerempuan} color="bg-white border-gray-100 text-gray-800" />
        <StatCard title="Masih Hidup" value={totHidup} color="bg-green-50 border-green-100 text-green-700" />
        
        <div onClick={() => setIsDeceasedModalOpen(true)} className="col-span-2 cursor-pointer active:scale-[0.98] transition-transform">
           <StatCard title="Total Keluarga Meninggal (Klik detail)" value={allDeceased.length} color="bg-gray-800 border-gray-700 text-white shadow-md hover:bg-gray-700" />
        </div>
      </div>

      {/* MODAL KELOLA FOTO & TULISAN */}
      {isPhotoModalOpen && (
        <ModalKelolaFoto 
          sliderImages={sliderImages} 
          showToast={showToast} 
          onClose={() => setIsPhotoModalOpen(false)} 
          onUpdateSliderImages={onUpdateSliderImages}
        />
      )}

      {/* MODAL FULLSCREEN IMAGE DENGAN NAVIGASI SLIDE & KETERANGAN */}
      {fullScreenIndex !== null && sliderImages[fullScreenIndex] && (
        <FullScreenImage 
          images={sliderImages} 
          initialIndex={fullScreenIndex} 
          onClose={() => setFullScreenIndex(null)} 
        />
      )}

      {isDeceasedModalOpen && (
        <ModalDaftarMeninggal 
          deceasedList={allDeceased} 
          onClose={() => setIsDeceasedModalOpen(false)} 
        />
      )}
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

function FullScreenImage({ 
  images, 
  initialIndex, 
  onClose 
}: { 
  images: SliderImage[]; 
  initialIndex: number; 
  onClose: () => void; 
}) {
  const [index, setIndex] = useState(initialIndex);
  const current = images[index] || images[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) {
        setIndex((p) => (p - 1 + images.length) % images.length);
      }
      if (e.key === 'ArrowRight' && images.length > 1) {
        setIndex((p) => (p + 1) % images.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-between p-4 animate-fade-in" onClick={onClose}>
      {/* HEADER ATAS */}
      <div className="w-full flex justify-between items-center z-10 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-white/80 text-xs font-bold bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          Foto {index + 1} dari {images.length}
        </div>
        <button 
          onClick={onClose} 
          className="text-white hover:bg-white/20 p-2 rounded-full transition cursor-pointer bg-white/10 backdrop-blur-md border border-white/10"
        >
          <X size={20} />
        </button>
      </div>

      {/* GAMBAR TENGAH */}
      <div className="relative flex-1 flex items-center justify-center w-full max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <img 
          src={current.url} 
          className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-fade-in select-none" 
          alt={current.title || "Full"} 
        />

        {/* TOMBOL PREV / NEXT */}
        {images.length > 1 && (
          <>
            <button 
              onClick={() => setIndex((p) => (p - 1 + images.length) % images.length)} 
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 p-3 rounded-full text-white transition cursor-pointer shadow-lg border border-white/20"
              title="Sebelumnya"
            >
              <ChevronLeft size={24}/>
            </button>
            <button 
              onClick={() => setIndex((p) => (p + 1) % images.length)} 
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 p-3 rounded-full text-white transition cursor-pointer shadow-lg border border-white/20"
              title="Selanjutnya"
            >
              <ChevronRight size={24}/>
            </button>
          </>
        )}
      </div>

      {/* FOOTER KETERANGAN TULISAN DI BAWAH */}
      <div className="w-full max-w-xl text-center text-white bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 mt-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-base text-green-300">
          {current.title || 'Keluarga Besar KH. SUMADI'}
        </h3>
        <p className="text-xs text-gray-200 mt-1">
          {current.subtitle || current.description || 'Menjalin Silaturrahim, Mempererat Persaudaraan'}
        </p>
      </div>
    </div>
  );
}

// ==========================================
// MODAL KELOLA FOTO & TULISAN DASHBOARD
// ==========================================
function ModalKelolaFoto({ 
  sliderImages, 
  showToast, 
  onClose,
  onUpdateSliderImages
}: { 
  sliderImages: SliderImage[]; 
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void; 
  onUpdateSliderImages?: (images: SliderImage[]) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'add' | 'edit'>('list');
  
  // State Tambah Baru
  const [newImage, setNewImage] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // State Edit Foto
  const [editingPhoto, setEditingPhoto] = useState<SliderImage | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImage) {
      showToast('Pilih gambar terlebih dahulu', 'error');
      return;
    }
    try {
      const id = Date.now();
      const payload: SliderImage = { 
        id, 
        url: newImage,
        title: newTitle.trim() || undefined,
        subtitle: newSubtitle.trim() || undefined
      };
      onUpdateSliderImages?.([...sliderImages, payload]);
      await setDoc(getDocRef('sliderImages', id), cleanFirestoreData(payload));
      setNewImage('');
      setNewTitle('');
      setNewSubtitle('');
      if (fileRef.current) fileRef.current.value = '';
      showToast('Foto & keterangan berhasil ditambahkan ke Firebase', 'success');
      setActiveSubTab('list');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'sliderImages');
      showToast('Gagal mengunggah foto', 'error'); 
    }
  };

  const handleStartEdit = (img: SliderImage) => {
    setEditingPhoto({ ...img });
    setActiveSubTab('edit');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhoto || !editingPhoto.url) {
      showToast('Foto tidak boleh kosong', 'error');
      return;
    }
    try {
      const payload: SliderImage = {
        id: editingPhoto.id,
        url: editingPhoto.url,
        title: editingPhoto.title?.trim() || undefined,
        subtitle: (editingPhoto.subtitle || editingPhoto.description)?.trim() || undefined
      };
      onUpdateSliderImages?.(sliderImages.map(img => img.id === payload.id ? { ...img, ...payload } : img));
      await setDoc(getDocRef('sliderImages', editingPhoto.id), cleanFirestoreData(payload), { merge: true });
      showToast('Foto & tulisan berhasil diperbarui di Firebase', 'success');
      setEditingPhoto(null);
      setActiveSubTab('list');
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'sliderImages');
      showToast('Gagal memperbarui data foto', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Yakin ingin menghapus foto slide ini?')) return;
    try {
      onUpdateSliderImages?.(sliderImages.filter(img => img.id !== id));
      await deleteDoc(getDocRef('sliderImages', id));
      showToast('Foto berhasil dihapus dari Cloud Firebase', 'success');
      if (editingPhoto?.id === id) {
        setEditingPhoto(null);
        setActiveSubTab('list');
      }
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'sliderImages');
      showToast('Gagal menghapus foto', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-700 to-emerald-700 p-4 text-white flex justify-between items-center">
          <div>
            <h2 className="font-bold text-sm">Kelola Foto & Tulisan Slide Dashboard</h2>
            <p className="text-[10px] text-green-100">Tambah, edit judul/keterangan, dan atur foto slide</p>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition cursor-pointer">
            <X size={18}/>
          </button>
        </div>

        {/* TAB BUTTONS */}
        <div className="flex border-b bg-gray-50 p-1.5 gap-1.5">
          <button
            onClick={() => setActiveSubTab('list')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeSubTab === 'list' ? 'bg-white text-green-700 shadow-xs border border-gray-200' : 'text-gray-600 hover:text-green-600'
            }`}
          >
            <ImageIcon size={14} /> Daftar Foto ({sliderImages.length})
          </button>
          <button
            onClick={() => { setEditingPhoto(null); setActiveSubTab('add'); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeSubTab === 'add' ? 'bg-white text-green-700 shadow-xs border border-gray-200' : 'text-gray-600 hover:text-green-600'
            }`}
          >
            <Plus size={14} /> Tambah Foto Baru
          </button>
          {activeSubTab === 'edit' && editingPhoto && (
            <button
              className="flex-1 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 shadow-xs flex items-center justify-center gap-1.5"
            >
              <Edit2 size={14} /> Sedang Edit
            </button>
          )}
        </div>

        {/* CONTENT */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: FORM TAMBAH FOTO BARU */}
          {activeSubTab === 'add' && (
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 hover:border-green-500 rounded-2xl p-6 flex flex-col items-center text-gray-400 relative transition bg-gray-50/50">
                <UploadCloud size={36} className="mb-2 text-green-600" />
                <p className="text-xs font-bold text-gray-700">Pilih / Unggah Gambar Slide</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Format JPG, PNG, WEBP</p>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileRef} 
                  onChange={(e) => handleImageUpload(e, setNewImage)} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  required
                />
              </div>

              {newImage && (
                <div className="relative rounded-2xl overflow-hidden border shadow-sm aspect-video bg-black/5">
                  <img src={newImage} className="w-full h-full object-cover" alt="Preview" />
                  <button 
                    type="button" 
                    onClick={() => { setNewImage(''); if (fileRef.current) fileRef.current.value = ''; }}
                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Judul / Nama Acara (Opsional)</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Halal Bihalal Idul Fitri 2026" 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)} 
                  className="w-full border p-2.5 rounded-xl text-xs outline-none focus:border-green-600 font-medium" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Keterangan / Tulisan (Opsional)</label>
                <textarea 
                  placeholder="Contoh: Silaturrahim Bani Sumadi di kediaman Mbah KH. Sumadi" 
                  value={newSubtitle} 
                  onChange={(e) => setNewSubtitle(e.target.value)} 
                  rows={2}
                  className="w-full border p-2.5 rounded-xl text-xs outline-none focus:border-green-600 font-medium resize-none" 
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  type="button" 
                  onClick={() => setActiveSubTab('list')} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-xs hover:bg-gray-200 transition cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={!newImage} 
                  className="flex-1 bg-green-600 disabled:bg-gray-200 text-white py-3 rounded-xl font-bold text-xs shadow-md hover:bg-green-700 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Simpan Foto ke Firebase
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: FORM EDIT FOTO & TULISAN */}
          {activeSubTab === 'edit' && editingPhoto && (
            <form onSubmit={handleSaveEdit} className="space-y-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Edit2 size={14} /> Edit Tulisan & Gambar Foto
                </span>
                <button 
                  type="button" 
                  onClick={() => { setEditingPhoto(null); setActiveSubTab('list'); }} 
                  className="text-gray-400 hover:text-gray-600 text-xs font-semibold cursor-pointer"
                >
                  Tutup Edit
                </button>
              </div>

              {/* PREVIEW & GANTI GAMBAR */}
              <div className="relative rounded-2xl overflow-hidden border shadow-sm aspect-video bg-black/10">
                <img src={editingPhoto.url} className="w-full h-full object-cover" alt="Preview Edit" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <label className="bg-white text-gray-800 px-3 py-1.5 rounded-xl font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5">
                    <UploadCloud size={14} className="text-green-600" /> Ganti Gambar
                    <input 
                      type="file" 
                      accept="image/*" 
                      ref={editFileRef} 
                      onChange={(e) => handleImageUpload(e, (url) => setEditingPhoto({ ...editingPhoto, url }))} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Judul / Nama Acara</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Reuni Keluarga Besar" 
                  value={editingPhoto.title || ''} 
                  onChange={(e) => setEditingPhoto({ ...editingPhoto, title: e.target.value })} 
                  className="w-full border bg-white p-2.5 rounded-xl text-xs outline-none focus:border-amber-600 font-medium" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Keterangan / Tulisan</label>
                <textarea 
                  placeholder="Contoh: Menjalin Silaturrahim dan Kebersamaan..." 
                  value={editingPhoto.subtitle || editingPhoto.description || ''} 
                  onChange={(e) => setEditingPhoto({ ...editingPhoto, subtitle: e.target.value, description: e.target.value })} 
                  rows={2}
                  className="w-full border bg-white p-2.5 rounded-xl text-xs outline-none focus:border-amber-600 font-medium resize-none" 
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  type="button" 
                  onClick={() => { setEditingPhoto(null); setActiveSubTab('list'); }} 
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-xs hover:bg-gray-300 transition cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold text-xs shadow-md hover:bg-amber-700 transition cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: DAFTAR SEMUA FOTO */}
          {activeSubTab === 'list' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-[11px] font-bold text-gray-500 uppercase">
                  Daftar Foto Slide ({sliderImages.length})
                </p>
                <button 
                  onClick={() => setActiveSubTab('add')} 
                  className="text-xs text-green-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Plus size={14} /> Tambah Foto
                </button>
              </div>

              {sliderImages.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <ImageIcon size={36} className="mx-auto mb-2 opacity-50"/>
                  <p className="text-xs font-medium">Belum ada foto yang diunggah.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sliderImages.map((img, idx) => (
                    <div 
                      key={img.id} 
                      className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 bg-white hover:border-green-300 shadow-xs transition"
                    >
                      {/* THUMBNAIL */}
                      <div className="w-24 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border">
                        <img src={img.url} className="w-full h-full object-cover" alt={img.title || "Slide"} />
                      </div>

                      {/* TEXT INFO */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold bg-green-100 text-green-800 px-1.5 py-0.2 rounded-md">
                            #{idx + 1}
                          </span>
                          <h4 className="font-bold text-xs text-gray-800 truncate">
                            {img.title || 'Keluarga Besar KH. SUMADI'}
                          </h4>
                        </div>
                        <p className="text-[10.5px] text-gray-500 line-clamp-1 mt-0.5">
                          {img.subtitle || img.description || 'Menjalin Silaturrahim, Mempererat Persaudaraan'}
                        </p>
                      </div>

                      {/* ACTIONS: EDIT & DELETE */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button 
                          onClick={() => handleStartEdit(img)} 
                          className="p-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl transition cursor-pointer border border-amber-200" 
                          title="Edit Foto & Tulisan"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(img.id)} 
                          className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition cursor-pointer border border-red-200" 
                          title="Hapus Foto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// BACKGROUND ORNAMEN ISLAMIC MODERN CERAH (POHON SILSILAH)
// ==========================================
function IslamicTreeBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* 1. Warna Dasar Cerah Alabaster & Marble Pearl Nuance */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#FCFAF6] via-[#F8F4EA] to-[#F1E9D8]" />

      {/* 2. Pencahayaan Gradasi Lembut Emas & Zamrud Modern (Ambient Glow) */}
      <div 
        className="absolute inset-0 opacity-70"
        style={{
          background: 'radial-gradient(ellipse at 50% 12%, rgba(217, 148, 26, 0.14) 0%, rgba(16, 185, 129, 0.07) 38%, rgba(245, 158, 11, 0.02) 70%, transparent 85%)'
        }}
      />

      {/* 3. Motif Pola Geometris Girih & Arabesque Tessellation Bintang 8 Modern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.28]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="islamic-modern-girih-pattern" width="100" height="100" patternUnits="userSpaceOnUse">
            {/* Latar Belakang Subtle Poligon Interlace */}
            <rect width="100" height="100" fill="none" />
            
            {/* Bintang 8 Sudut Islami Pusat (Khatam Sulayman) */}
            <path
              d="M50 15 L57 33 L75 25 L67 43 L85 50 L67 57 L75 75 L57 67 L50 85 L43 67 L25 75 L33 57 L15 50 L33 43 L25 25 L43 33 Z"
              fill="rgba(217, 148, 26, 0.035)"
              stroke="#B8860B"
              strokeWidth="0.85"
              strokeLinejoin="round"
            />
            {/* Oktagon Geometris Dalam dengan Aksen Zamrud */}
            <polygon
              points="50,29 60,34 65,45 60,56 50,61 40,56 35,45 40,34"
              fill="rgba(16, 149, 102, 0.03)"
              stroke="#0D9488"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Titik Pusat Bintang Berkilau */}
            <circle cx="50" cy="50" r="3.5" fill="none" stroke="#D97706" strokeWidth="0.75" />
            <circle cx="50" cy="50" r="1" fill="#B48232" />

            {/* Bintang Sudut Luar (Untuk Kesinambungan Tiling Mulus) */}
            {/* Sudut Kiri-Atas (0,0) */}
            <path
              d="M0 15 L7 17 L15 0 L17 7 L35 0 L27 18 L45 25 L27 32 L35 50 L17 43 L15 50 L7 33 L0 35 L0 15"
              fill="none"
              stroke="#B8860B"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Sudut Kanan-Atas (100,0) */}
            <path
              d="M100 15 L93 17 L85 0 L83 7 L65 0 L73 18 L55 25 L73 32 L65 50 L83 43 L85 50 L93 33 L100 35 L100 15"
              fill="none"
              stroke="#B8860B"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Sudut Kiri-Bawah (0,100) */}
            <path
              d="M0 85 L7 83 L15 100 L17 93 L35 100 L27 82 L45 75 L27 68 L35 50 L17 57 L15 50 L7 67 L0 65 L0 85"
              fill="none"
              stroke="#B8860B"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Sudut Kanan-Bawah (100,100) */}
            <path
              d="M100 85 L93 83 L85 100 L83 93 L65 100 L73 82 L55 75 L73 68 L65 50 L83 57 L85 50 L93 67 L100 65 L100 85"
              fill="none"
              stroke="#B8860B"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />

            {/* Garis Arabesque Geometris Diagonal Halus */}
            <line x1="0" y1="0" x2="100" y2="100" stroke="#C59B27" strokeWidth="0.4" strokeDasharray="4 4" opacity="0.4" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="#C59B27" strokeWidth="0.4" strokeDasharray="4 4" opacity="0.4" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="#B8860B" strokeWidth="0.4" strokeDasharray="3 3" opacity="0.3" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#B8860B" strokeWidth="0.4" strokeDasharray="3 3" opacity="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#islamic-modern-girih-pattern)" />
      </svg>

      {/* 4. Siluet Lengkung Kubah / Mihrab Islamic Modern di Puncak */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] max-w-full h-32 opacity-25 pointer-events-none">
        <svg viewBox="0 0 700 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Kubah Mahkota Halus */}
          <path 
            d="M50 0 C150 0 240 70 350 70 C460 70 550 0 650 0" 
            stroke="#B8860B" 
            strokeWidth="1.5" 
            strokeDasharray="4 4"
            fill="none" 
          />
          <path 
            d="M100 0 C200 0 270 50 350 50 C430 50 500 0 600 0" 
            stroke="#0D9488" 
            strokeWidth="1" 
            fill="none" 
          />
          {/* Medallion Bintang 8 Puncak */}
          <g transform="translate(350, 50)">
            <circle cx="0" cy="0" r="16" fill="rgba(217, 148, 26, 0.08)" stroke="#B8860B" strokeWidth="1" />
            <path d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" fill="#D97706" opacity="0.8" />
          </g>
        </svg>
      </div>

      {/* 5. Ornamen Sudut Arabesque Modern Mewah & Elegan */}
      {/* Sudut Kiri Atas */}
      <div className="absolute top-2 left-2 w-28 h-28 opacity-35 pointer-events-none">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0 L90 0 C55 0 35 20 35 55 C35 90 20 90 0 90 L0 0 Z" fill="rgba(217, 148, 26, 0.06)" />
          <path d="M4 4 L78 4 C50 4 32 20 32 50 C32 78 20 78 4 78 Z" stroke="#B8860B" strokeWidth="1.2" fill="none" />
          <path d="M10 10 L50 10 C35 10 24 20 24 35 C24 50 15 50 10 50 Z" stroke="#0D9488" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          {/* Mini Star Accents */}
          <circle cx="20" cy="20" r="3.5" fill="none" stroke="#B8860B" strokeWidth="1" />
          <polygon points="20,17 21.5,19.5 24,20 21.5,20.5 20,23 18.5,20.5 16,20 18.5,19.5" fill="#D97706" />
        </svg>
      </div>

      {/* Sudut Kanan Atas */}
      <div className="absolute top-2 right-2 w-28 h-28 opacity-35 pointer-events-none scale-x-[-1]">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0 L90 0 C55 0 35 20 35 55 C35 90 20 90 0 90 L0 0 Z" fill="rgba(217, 148, 26, 0.06)" />
          <path d="M4 4 L78 4 C50 4 32 20 32 50 C32 78 20 78 4 78 Z" stroke="#B8860B" strokeWidth="1.2" fill="none" />
          <path d="M10 10 L50 10 C35 10 24 20 24 35 C24 50 15 50 10 50 Z" stroke="#0D9488" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <circle cx="20" cy="20" r="3.5" fill="none" stroke="#B8860B" strokeWidth="1" />
          <polygon points="20,17 21.5,19.5 24,20 21.5,20.5 20,23 18.5,20.5 16,20 18.5,19.5" fill="#D97706" />
        </svg>
      </div>

      {/* Sudut Kiri Bawah */}
      <div className="absolute bottom-2 left-2 w-28 h-28 opacity-35 pointer-events-none scale-y-[-1]">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0 L90 0 C55 0 35 20 35 55 C35 90 20 90 0 90 L0 0 Z" fill="rgba(217, 148, 26, 0.06)" />
          <path d="M4 4 L78 4 C50 4 32 20 32 50 C32 78 20 78 4 78 Z" stroke="#B8860B" strokeWidth="1.2" fill="none" />
          <path d="M10 10 L50 10 C35 10 24 20 24 35 C24 50 15 50 10 50 Z" stroke="#0D9488" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <circle cx="20" cy="20" r="3.5" fill="none" stroke="#B8860B" strokeWidth="1" />
          <polygon points="20,17 21.5,19.5 24,20 21.5,20.5 20,23 18.5,20.5 16,20 18.5,19.5" fill="#D97706" />
        </svg>
      </div>

      {/* Sudut Kanan Bawah */}
      <div className="absolute bottom-2 right-2 w-28 h-28 opacity-35 pointer-events-none scale-[-1]">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0 L90 0 C55 0 35 20 35 55 C35 90 20 90 0 90 L0 0 Z" fill="rgba(217, 148, 26, 0.06)" />
          <path d="M4 4 L78 4 C50 4 32 20 32 50 C32 78 20 78 4 78 Z" stroke="#B8860B" strokeWidth="1.2" fill="none" />
          <path d="M10 10 L50 10 C35 10 24 20 24 35 C24 50 15 50 10 50 Z" stroke="#0D9488" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <circle cx="20" cy="20" r="3.5" fill="none" stroke="#B8860B" strokeWidth="1" />
          <polygon points="20,17 21.5,19.5 24,20 21.5,20.5 20,23 18.5,20.5 16,20 18.5,19.5" fill="#D97706" />
        </svg>
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
  setPosition,
  containerRef: externalContainerRef,
  contentRef: externalContentRef,
  isAnimating = false
}: { 
  children: React.ReactNode; 
  zoom: number; 
  setZoom: React.Dispatch<React.SetStateAction<number>>; 
  position: { x: number; y: number }; 
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  isAnimating?: boolean;
}) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const internalContentRef = useRef<HTMLDivElement>(null);
  const contentRef = externalContentRef || internalContentRef;
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
      className="absolute inset-0 bg-[#FCFAF6] cursor-grab active:cursor-grabbing touch-none overflow-hidden select-none"
      onMouseDown={(e) => { isDragging.current = true; dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y }; }}
      onMouseMove={(e) => { if(isDragging.current) setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }}
      onMouseUp={() => isDragging.current = false} 
      onMouseLeave={() => isDragging.current = false}
    >
       {/* Background Ornamen Islami Cerah */}
       <IslamicTreeBackground />

       <div 
         ref={contentRef}
         style={{ 
           transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`, 
           transformOrigin: '0 0' 
         }} 
         className={`w-max min-w-full flex justify-center origin-top-left pt-20 pb-48 px-16 relative z-10 ${isAnimating ? 'transition-transform duration-500 ease-out' : ''}`}
       >
          {children}
       </div>
    </div>
  );
}

interface TreeNodeData extends Member {
  children: TreeNodeData[];
}

export interface FamilyRelationTarget {
  member: Member;
  isSpouse?: boolean;
  spouseObj?: Spouse;
}

export interface FamilyRelationItem {
  relation: string;
  name: string;
  photo?: string;
  gender: 'L' | 'P';
  isAlive: boolean;
  targetPerson: FamilyRelationTarget;
}

export interface ProfileDetailData {
  name: string;
  gender: 'L' | 'P';
  isAlive: boolean;
  photo?: string;
  birthDate?: string;
  deathDate?: string | null;
  domicile?: string;
  phone?: string;
  subtitle: string;
  maritalStatus: string;
  childrenCount: number;
  relations: FamilyRelationItem[];
  rawMember: Member;
  isSpouse: boolean;
  spouseObj?: Spouse;
}

function formatIndonesianDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === '-') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function calculateAge(birthDateStr?: string | null, deathDateStr?: string | null, isAlive: boolean = true): number | null {
  if (!birthDateStr || birthDateStr === '-') return null;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return null;
  const end = (!isAlive && deathDateStr && !isNaN(new Date(deathDateStr).getTime())) ? new Date(deathDateStr) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function formatBirthDateAndAge(birthDate?: string | null, isAlive: boolean = true, deathDate?: string | null): string {
  if (!birthDate && !deathDate) return '-';
  const birthFormatted = formatIndonesianDate(birthDate);
  const deathFormatted = formatIndonesianDate(deathDate);
  const age = calculateAge(birthDate, deathDate, isAlive);

  if (isAlive) {
    if (birthFormatted && age !== null) {
      return `${birthFormatted} (${age} tahun)`;
    }
    if (birthFormatted) return birthFormatted;
    return '-';
  } else {
    if (birthFormatted && deathFormatted) {
      return `${birthFormatted} - ${deathFormatted} (Wafat)`;
    }
    if (birthFormatted && age !== null) {
      return `${birthFormatted} (${age} tahun, Wafat)`;
    }
    if (birthFormatted) return `${birthFormatted} (Wafat)`;
    if (deathFormatted) return `Wafat: ${deathFormatted}`;
    return 'Wafat (ALM)';
  }
}

function buildFullProfileData(
  member: Member, 
  allMembers: Member[], 
  isSpouse: boolean = false, 
  spouseObj?: Spouse
): ProfileDetailData {
  const sumadi = allMembers.find(m => m.id === 1) || allMembers[0];
  const wife1 = allMembers.find(m => m.name.toLowerCase().includes('munasikah')) || 
                allMembers.find(m => m.branch === 'istri1' && m.spouseOfId === 1) ||
                allMembers.find(m => m.id === 2);
  const wife2 = allMembers.find(m => m.name.toLowerCase().includes('masripah')) || 
                allMembers.find(m => m.branch === 'istri2' && m.spouseOfId === 1) ||
                allMembers.find(m => m.id === 3);

  if (!isSpouse) {
    const isMale = member.gender === 'L';
    const spouses = getMemberSpouses(member, allMembers);
    
    // Subtitle / Garis Keturunan
    let subtitle = 'Anggota Keluarga';
    if (member.id === 1) {
      subtitle = 'Pemuncak Silsilah (Akar Utama)';
    } else if (member.name.toLowerCase().includes('munasikah') || (wife1 && member.id === wife1.id)) {
      subtitle = 'Istri Pertama Mbah KH. Sumadi';
    } else if (member.name.toLowerCase().includes('masripah') || (wife2 && member.id === wife2.id)) {
      subtitle = 'Istri Kedua Mbah KH. Sumadi';
    } else if (member.parentId) {
      const pName = getMemberParentName(member, allMembers);
      if (pName && pName !== '-') {
        subtitle = `Anak dari ${pName}`;
      }
    }

    // Children
    let children: Member[] = [];
    if (member.id === 1) {
      children = allMembers.filter(m => (m.parentId === 1 || (wife1 && m.parentId === wife1.id) || (wife2 && m.parentId === wife2.id)) && m.relationType !== 'spouse' && m.id !== 1 && m.id !== wife1?.id && m.id !== wife2?.id);
    } else if (member.name.toLowerCase().includes('munasikah') || (wife1 && member.id === wife1.id)) {
      children = allMembers.filter(m => ((wife1 && m.parentId === wife1.id) || (m.parentId === 1 && ((wife1 && m.motherId === wife1.id) || m.branch === 'istri1'))) && m.relationType !== 'spouse' && m.id !== 1 && m.id !== wife1?.id && m.id !== wife2?.id);
    } else if (member.name.toLowerCase().includes('masripah') || (wife2 && member.id === wife2.id)) {
      children = allMembers.filter(m => ((wife2 && m.parentId === wife2.id) || (m.parentId === 1 && ((wife2 && m.motherId === wife2.id) || m.branch === 'istri2'))) && m.relationType !== 'spouse' && m.id !== 1 && m.id !== wife1?.id && m.id !== wife2?.id);
    } else {
      children = allMembers.filter(m => (m.parentId === member.id || m.motherId === member.id) && m.relationType !== 'spouse' && m.id !== 1 && m.id !== wife1?.id && m.id !== wife2?.id);
    }

    // Marital status
    const maritalStatus = spouses.length > 0 
      ? (member.isAlive ? 'Menikah' : 'Wafat') 
      : (member.relationType === 'spouse' ? 'Menikah' : 'Belum Menikah');

    // Relations
    const relations: FamilyRelationItem[] = [];

    // Deteksi Ayah & Ibu
    const isRootAncestor = member.id === 1 || (wife1 && member.id === wife1.id) || (wife2 && member.id === wife2.id) || member.id === 2 || member.id === 3;
    
    if (!isRootAncestor) {
      let ayahItem: FamilyRelationItem | null = null;
      let ibuItem: FamilyRelationItem | null = null;

      // Apakah anggota ini adalah anak langsung Mbah KH. Sumadi (Generasi 1)?
      // Contoh: Musyarrifin, Masluri, Masiroh, Masruron, Masfir
      const isDirectChildOfSumadi = 
        member.parentId === 1 || 
        (wife1 && member.parentId === wife1.id) || 
        (wife2 && member.parentId === wife2.id) || 
        member.parentId === 2 || 
        member.parentId === 3 || 
        (!member.parentId && (member.branch === 'istri1' || member.branch === 'istri2'));

      if (isDirectChildOfSumadi) {
        // 1. Ayah Kandung: Mbah KH. Sumadi
        if (sumadi) {
          ayahItem = {
            relation: 'Ayah',
            name: sumadi.name,
            photo: sumadi.photo,
            gender: 'L',
            isAlive: sumadi.isAlive,
            targetPerson: { member: sumadi, isSpouse: false }
          };
        }

        // 2. Ibu Kandung: Mbah Munasikah (Istri 1) atau Mbah Masripah (Istri 2)
        const isFromWife1 = 
          (wife1 && member.parentId === wife1.id) || 
          member.parentId === 2 || 
          (member.parentId === 1 && ((wife1 && member.motherId === wife1.id) || member.branch === 'istri1')) ||
          (member.branch === 'istri1' && (!member.parentId || member.parentId === 1));

        const isFromWife2 = 
          (wife2 && member.parentId === wife2.id) || 
          member.parentId === 3 || 
          (member.parentId === 1 && ((wife2 && member.motherId === wife2.id) || member.branch === 'istri2')) ||
          (member.branch === 'istri2' && (!member.parentId || member.parentId === 1));

        if (isFromWife1 && wife1) {
          ibuItem = {
            relation: 'Ibu',
            name: wife1.name,
            photo: wife1.photo,
            gender: 'P',
            isAlive: wife1.isAlive,
            targetPerson: { member: wife1, isSpouse: false }
          };
        } else if (isFromWife2 && wife2) {
          ibuItem = {
            relation: 'Ibu',
            name: wife2.name,
            photo: wife2.photo,
            gender: 'P',
            isAlive: wife2.isAlive,
            targetPerson: { member: wife2, isSpouse: false }
          };
        }
      } else if (member.parentId) {
        // Keturunan Lanjutan (Cucu, Cicit, dst. dari Musyarrifin, Masluri, Masiroh, Masruron, Masfir, dll.)
        const parent = allMembers.find(m => m.id === member.parentId);
        if (parent) {
          if (parent.gender === 'L') {
            // Orang tua tercatat adalah AYAH Laki-laki (contoh: Musyarrifin, Masluri, Masruron, Masfir)
            ayahItem = {
              relation: 'Ayah',
              name: parent.name,
              photo: parent.photo,
              gender: 'L',
              isAlive: parent.isAlive,
              targetPerson: { member: parent, isSpouse: false }
            };

            // Cari IBU (Istri dari Ayah)
            let motherMember: Member | undefined = undefined;
            if (member.motherId && member.motherId !== 1 && member.motherId !== 2 && member.motherId !== 3 && member.motherId !== wife1?.id && member.motherId !== wife2?.id) {
              motherMember = allMembers.find(m => m.id === member.motherId && m.gender === 'P');
            }

            if (motherMember) {
              ibuItem = {
                relation: 'Ibu',
                name: motherMember.name,
                photo: motherMember.photo,
                gender: 'P',
                isAlive: motherMember.isAlive,
                targetPerson: { member: motherMember, isSpouse: false }
              };
            } else {
              const pSpouses = getMemberSpouses(parent, allMembers);
              let motherSpouse: Spouse | undefined = undefined;
              if (member.parentSpouseName) {
                motherSpouse = pSpouses.find(s => s.name.trim().toLowerCase() === member.parentSpouseName?.trim().toLowerCase());
              }
              if (!motherSpouse && member.spouseIndex !== undefined && member.spouseIndex !== null && pSpouses[member.spouseIndex]) {
                motherSpouse = pSpouses[member.spouseIndex];
              }
              if (!motherSpouse && pSpouses.length > 0) {
                motherSpouse = pSpouses[0];
              }

              if (motherSpouse) {
                const spMember = allMembers.find(m => m.id === motherSpouse?.id || (m.name.trim().toLowerCase() === motherSpouse?.name.trim().toLowerCase() && m.id !== parent.id));
                ibuItem = {
                  relation: 'Ibu',
                  name: motherSpouse.name,
                  photo: motherSpouse.photo,
                  gender: 'P',
                  isAlive: motherSpouse.isAlive ?? true,
                  targetPerson: spMember 
                    ? { member: spMember, isSpouse: false }
                    : { member: parent, isSpouse: true, spouseObj: motherSpouse }
                };
              }
            }
          } else {
            // Orang tua tercatat adalah IBU Perempuan (contoh: Masiroh)
            ibuItem = {
              relation: 'Ibu',
              name: parent.name,
              photo: parent.photo,
              gender: 'P',
              isAlive: parent.isAlive,
              targetPerson: { member: parent, isSpouse: false }
            };

            // Cari AYAH (Suami dari Ibu)
            const pSpouses = getMemberSpouses(parent, allMembers);
            let fatherSpouse: Spouse | undefined = undefined;
            if (member.parentSpouseName) {
              fatherSpouse = pSpouses.find(s => s.name.trim().toLowerCase() === member.parentSpouseName?.trim().toLowerCase());
            }
            if (!fatherSpouse && member.spouseIndex !== undefined && member.spouseIndex !== null && pSpouses[member.spouseIndex]) {
              fatherSpouse = pSpouses[member.spouseIndex];
            }
            if (!fatherSpouse && pSpouses.length > 0) {
              fatherSpouse = pSpouses[0];
            }

            if (fatherSpouse) {
              const spMember = allMembers.find(m => m.id === fatherSpouse?.id || (m.name.trim().toLowerCase() === fatherSpouse?.name.trim().toLowerCase() && m.id !== parent.id));
              ayahItem = {
                relation: 'Ayah',
                name: fatherSpouse.name,
                photo: fatherSpouse.photo,
                gender: 'L',
                isAlive: fatherSpouse.isAlive ?? true,
                targetPerson: spMember 
                  ? { member: spMember, isSpouse: false }
                  : { member: parent, isSpouse: true, spouseObj: fatherSpouse }
              };
            }
          }
        }
      }

      // Masukkan Ayah dan Ibu sesuai urutan standar
      if (ayahItem) relations.push(ayahItem);
      if (ibuItem) relations.push(ibuItem);
    }

    // 3. Pasangan (Istri / Suami)
    spouses.forEach((sp, sIdx) => {
      const relLabel = isMale
        ? (spouses.length > 1 ? (sIdx === 0 ? 'Istri Pertama' : sIdx === 1 ? 'Istri Kedua' : `Istri ke-${sIdx+1}`) : 'Istri')
        : (spouses.length > 1 ? (sIdx === 0 ? 'Suami Pertama' : sIdx === 1 ? 'Suami Kedua' : `Suami ke-${sIdx+1}`) : 'Suami');
      
      const spMember = allMembers.find(m => m.id === sp.id || (m.name === sp.name && m.id !== member.id));
      relations.push({
        relation: relLabel,
        name: sp.name,
        photo: sp.photo,
        gender: isMale ? 'P' : 'L',
        isAlive: sp.isAlive ?? true,
        targetPerson: spMember 
          ? { member: spMember, isSpouse: false }
          : { member: member, isSpouse: true, spouseObj: sp }
      });
    });

    // 4. Anak
    children.forEach(ch => {
      relations.push({
        relation: 'Anak',
        name: ch.name,
        photo: ch.photo,
        gender: ch.gender,
        isAlive: ch.isAlive,
        targetPerson: { member: ch, isSpouse: false }
      });
    });

    return {
      name: member.name,
      gender: member.gender,
      isAlive: member.isAlive,
      photo: member.photo,
      birthDate: member.birthDate,
      deathDate: member.deathDate,
      domicile: member.domicile,
      phone: member.phone,
      subtitle,
      maritalStatus,
      childrenCount: children.length,
      relations,
      rawMember: member,
      isSpouse: false
    };
  } else {
    // Profil Pasangan (Spouse)
    const sp: Spouse = spouseObj || {
      id: `sp-${member.id}`,
      name: member.spouse || 'Pasangan',
      isAlive: member.spouseIsAlive ?? true,
      photo: member.spousePhoto || '',
      birthDate: member.spouseBirthDate || '',
      deathDate: member.spouseDeathDate || '',
      domicile: member.spouseDomicile || member.domicile || '',
      phone: member.spousePhone || ''
    };

    const isSpouseMale = member.gender === 'P';
    const subtitle = isSpouseMale ? `Suami dari ${member.name}` : `Istri dari ${member.name}`;
    
    // Children
    const children = allMembers.filter(m => (m.parentId === member.id || m.motherId === member.id) && m.relationType !== 'spouse' && m.id !== 1 && m.id !== 2 && m.id !== 3);

    const relations: FamilyRelationItem[] = [];

    // Suami / Istri (Main Member)
    relations.push({
      relation: isSpouseMale ? 'Istri' : 'Suami',
      name: member.name,
      photo: member.photo,
      gender: member.gender,
      isAlive: member.isAlive,
      targetPerson: { member, isSpouse: false }
    });

    // Anak
    children.forEach(ch => {
      relations.push({
        relation: 'Anak',
        name: ch.name,
        photo: ch.photo,
        gender: ch.gender,
        isAlive: ch.isAlive,
        targetPerson: { member: ch, isSpouse: false }
      });
    });

    return {
      name: sp.name,
      gender: isSpouseMale ? 'L' : 'P',
      isAlive: sp.isAlive ?? true,
      photo: sp.photo,
      birthDate: sp.birthDate,
      deathDate: sp.deathDate,
      domicile: sp.domicile || member.domicile,
      phone: sp.phone,
      subtitle,
      maritalStatus: sp.isAlive ? 'Menikah' : 'Wafat',
      childrenCount: children.length,
      relations,
      rawMember: member,
      isSpouse: true,
      spouseObj: sp
    };
  }
}

// ==========================================
// TAMPILAN POHON SILSILAH
// ==========================================
function PersonBox({ 
  id,
  name, 
  gender, 
  isAlive, 
  photo, 
  label, 
  isRootAncestor = false,
  badgeColor,
  isHighlighted = false,
  onClick 
}: { 
  id?: string;
  name: string; 
  gender: 'L' | 'P'; 
  isAlive: boolean; 
  photo?: string; 
  label?: string; 
  isRootAncestor?: boolean;
  badgeColor?: string;
  isHighlighted?: boolean;
  onClick: (e: React.MouseEvent) => void; 
}) {
  const isMale = gender === 'L';

  if (isRootAncestor) {
    return (
      <div 
        id={id}
        data-person-name={name.toLowerCase()}
        className={`relative flex flex-col items-center cursor-pointer p-3 rounded-2xl shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl w-[114px] sm:w-[124px] select-none border-2 border-amber-400 bg-gradient-to-b from-amber-50/95 via-emerald-50/90 to-white text-emerald-950 flex-shrink-0 backdrop-blur-sm ${
          isHighlighted 
            ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-emerald-900 shadow-2xl scale-110 z-40 animate-pulse' 
            : 'ring-2 ring-amber-400/50'
        }`}
        onClick={onClick}
        title={`Klik untuk melihat detail profil ${name} (Pemuncak Silsilah)`}
      >
        {isHighlighted && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-emerald-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-2xl border border-white animate-bounce whitespace-nowrap z-50 flex items-center gap-1">
            <span>🎯</span>
            <span>Di Sini</span>
          </div>
        )}

        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 border border-amber-400 bg-gradient-to-r from-amber-500 to-emerald-600 text-white shadow-xs">
          👑 Pemuncak Silsilah
        </span>

        <div className="relative mb-1">
          {!isAlive && (
            <span className="absolute -top-1 -right-1 bg-gray-800 text-amber-300 text-[7.5px] font-black px-1.5 py-0.2 rounded-md shadow-xs z-20 border border-gray-600">
              ALM
            </span>
          )}
          <div className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-amber-400 bg-amber-100/70 text-amber-700 shadow-md overflow-hidden flex-shrink-0 ring-2 ring-amber-300/40">
            {photo ? (
              <img src={photo} className="w-full h-full object-cover" alt={name} />
            ) : (
              <Users size={26} className="text-amber-800" />
            )}
          </div>
        </div>

        <p className="font-black text-xs text-center leading-tight line-clamp-2 w-full break-words text-emerald-950">
          {name}
        </p>
      </div>
    );
  }

  return (
    <div 
      id={id}
      data-person-name={name.toLowerCase()}
      className={`relative flex flex-col items-center cursor-pointer p-2.5 rounded-2xl shadow-md transition-all duration-300 hover:scale-105 hover:shadow-xl w-[92px] sm:w-[98px] select-none border-2 flex-shrink-0 backdrop-blur-sm ${
        isHighlighted
          ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-emerald-900 shadow-2xl scale-110 z-40 animate-pulse bg-amber-50 border-amber-400 text-amber-950'
          : isMale 
          ? 'bg-gradient-to-b from-blue-50/95 to-white border-blue-400 text-blue-950' 
          : 'bg-gradient-to-b from-pink-50/95 to-white border-pink-400 text-pink-950'
      }`}
      onClick={onClick}
      title={`Klik untuk melihat detail profil ${name}`}
    >
      {isHighlighted && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-emerald-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-2xl border border-white animate-bounce whitespace-nowrap z-50 flex items-center gap-1">
          <span>🎯</span>
          <span>Di Sini</span>
        </div>
      )}

      {/* Label / Badge (e.g. Kepala Keluarga, Istri 1, Suami, dll.) */}
      {label && (
        <span className={`text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full mb-1 border ${
          badgeColor || (isMale ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-pink-100 text-pink-800 border-pink-200')
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
      <div className="w-8 sm:w-12 h-[3px] bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500 rounded-full shadow-xs"></div>
      
      {label && (
        <div className="absolute -top-3 flex flex-col items-center pointer-events-none">
          <span className="text-[7.5px] font-black text-amber-950 bg-amber-100/95 px-1.5 py-0.2 rounded-full border border-amber-300 mt-0.5 whitespace-nowrap shadow-2xs">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

function PohonSilsilahTab({ 
  members, 
  showToast,
  onNavigateTab,
  focusTarget,
  onClearFocus
}: { 
  members: Member[]; 
  showToast?: (m: string, t?: 'success' | 'error') => void;
  onNavigateTab?: (tab: 'dash' | 'pohon' | 'anggota' | 'agenda' | 'kas' | 'iuran') => void;
  focusTarget?: { memberId?: number; spouseName?: string; name?: string; timestamp?: number } | null;
  onClearFocus?: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [expandAll, setExpandAll] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<FamilyRelationTarget | null>(null);
  
  // State untuk pencarian nama di pohon
  const [treeSearchQuery, setTreeSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedTarget, setHighlightedTarget] = useState<{ memberId?: number; spouseName?: string; name?: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Deteksi Pemuncak Silsilah (Mbah Sumadi)
  const sumadi = useMemo(() => {
    return members.find(m => m.id === 1) || 
           members.find(m => (!m.parentId && m.name.toLowerCase().includes('sumadi'))) || 
           members.find(m => !m.parentId && m.relationType !== 'spouse') ||
           members[0];
  }, [members]);

  // 2. Deteksi Kedua Istri Mbah Sumadi
  // Mbah Munasikah adalah ISTRI PERTAMA (Istri 1)
  const wife1 = useMemo(() => {
    return members.find(m => m.name.toLowerCase().includes('munasikah')) || 
           members.find(m => m.spouseOfId === 1 && (m.branch === 'istri1' || m.order === 1)) ||
           members.find(m => m.id === 2);
  }, [members]);

  // Mbah Masripah adalah ISTRI KEDUA (Istri 2)
  const wife2 = useMemo(() => {
    return members.find(m => m.name.toLowerCase().includes('masripah')) || 
           members.find(m => m.spouseOfId === 1 && (m.branch === 'istri2' || m.order === 2)) ||
           members.find(m => m.id === 3);
  }, [members]);

  // 3. Sub-tree Builder untuk Keturunan Masing-Masing Istri
  const buildChildrenTree = (targetParentId: number, isWifeBranch?: 1 | 2): TreeNodeData[] => {
    return members
      .filter(m => {
        // Pasangan terikat secara horizontal di samping anggotanya, tidak sebagai anak di pohon
        if (m.relationType === 'spouse') return false;
        // Mbah Sumadi, Istri 1, dan Istri 2 bukan anak
        if (m.id === 1 || (wife1 && m.id === wife1.id) || (wife2 && m.id === wife2.id)) return false;

        if (isWifeBranch === 1) {
          if (wife1 && m.parentId === wife1.id) return true;
          if (m.parentId === 1 && ((wife1 && m.motherId === wife1.id) || m.branch === 'istri1')) return true;
          return false;
        }

        if (isWifeBranch === 2) {
          if (wife2 && m.parentId === wife2.id) return true;
          if (m.parentId === 1 && ((wife2 && m.motherId === wife2.id) || m.branch === 'istri2')) return true;
          return false;
        }

        return m.parentId === targetParentId;
      })
      .map(m => ({
        ...m,
        children: buildChildrenTree(m.id)
      }));
  };

  const wife1Children = useMemo(() => {
    return wife1 ? buildChildrenTree(wife1.id, 1) : [];
  }, [members, wife1]);

  const wife2Children = useMemo(() => {
    return wife2 ? buildChildrenTree(wife2.id, 2) : [];
  }, [members, wife2]);

  // Hitung total anggota keturunan pada masing-masing cabang
  const countDescendantsBranch = (childrenList: TreeNodeData[]): number => {
    let count = 0;
    const visit = (node: TreeNodeData) => {
      count++;
      if (node.children && node.children.length > 0) {
        node.children.forEach(visit);
      }
    };
    childrenList.forEach(visit);
    return count;
  };

  const getParentLabel = (node: Member, isSpouse: boolean): string => {
    if (isSpouse) return '-';
    if (node.id === 1) return 'Pemuncak Silsilah (Akar Utama)';
    if (node.id === (wife1?.id ?? 2) || node.id === (wife2?.id ?? 3)) return '-';
    if ((wife1 && node.parentId === wife1.id) || node.parentId === 2 || (node.parentId === 1 && (node.motherId === wife1?.id || node.branch === 'istri1'))) {
      return `Mbah KH. Sumadi & ${wife1 ? wife1.name : 'Mbah Munasikah (Istri 1)'}`;
    }
    if ((wife2 && node.parentId === wife2.id) || node.parentId === 3 || (node.parentId === 1 && (node.motherId === wife2?.id || node.branch === 'istri2'))) {
      return `Mbah KH. Sumadi & ${wife2 ? wife2.name : 'Mbah Masripah (Istri 2)'}`;
    }
    const parent = members.find(m => m.id === node.parentId);
    if (!parent) return '-';
    if (node.parentSpouseName) {
      return `${parent.name} & ${node.parentSpouseName}`;
    }
    const pSpouses = getMemberSpouses(parent, members);
    if (node.spouseIndex !== undefined && node.spouseIndex !== null && pSpouses[node.spouseIndex]) {
      return `${parent.name} & ${pSpouses[node.spouseIndex].name}`;
    }
    if (pSpouses.length > 0) {
      return `${parent.name} & ${pSpouses[0].name}`;
    }
    const spouse = members.find(s => s.id === parent.spouseOfId || (s.parentId === parent.id && s.relationType === 'spouse')) || (parent.spouse ? { name: parent.spouse } : null);
    return spouse ? `${parent.name} & ${spouse.name}` : parent.name;
  };

  // Helper untuk memusatkan tampilan pada Mbah KH. Sumadi (Akar Utama)
  const centerRootAncestor = () => {
    if (!containerRef.current || !contentRef.current) {
      setPosition({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const sumadiEl = document.getElementById('tree-member-1') || (document.querySelector('[data-person-name*="sumadi"]') as HTMLElement);
    if (sumadiEl) {
      const targetRect = sumadiEl.getBoundingClientRect();
      const contRect = containerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();

      const targetCenterXInContent = (targetRect.left + targetRect.width / 2 - contentRect.left) / (zoom || 1);
      const targetZoom = 1.0;
      const newX = (contRect.width / 2) - (targetCenterXInContent * targetZoom);
      const newY = 30;

      setIsAnimating(true);
      setPosition({ x: newX, y: newY });
      setZoom(targetZoom);
      setTimeout(() => setIsAnimating(false), 550);
    } else {
      setPosition({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  // Helper untuk fokus langsung dan scroll/center ke card orang di pohon
  const focusOnPerson = (target: { memberId?: number; spouseName?: string; name?: string }) => {
    setExpandAll(true);
    setHighlightedTarget(target);

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedTarget(null);
    }, 8000);

    const attemptCenter = (attemptsLeft: number) => {
      let targetEl: HTMLElement | null = null;
      if (target.memberId) {
        targetEl = document.getElementById(`tree-member-${target.memberId}`);
      }
      if (!targetEl && target.spouseName) {
        const cleanSpouseName = target.spouseName.trim().toLowerCase().replace(/\s+/g, '-');
        targetEl = document.getElementById(`tree-spouse-${cleanSpouseName}`) || 
                   (document.querySelector(`[data-spouse-name="${target.spouseName.trim().toLowerCase()}"]`) as HTMLElement);
      }
      if (!targetEl && target.name) {
        const cleanName = target.name.trim().toLowerCase();
        const found = members.find(m => m.name.toLowerCase().includes(cleanName));
        if (found) {
          targetEl = document.getElementById(`tree-member-${found.id}`);
        }
        if (!targetEl) {
          targetEl = (document.querySelector(`[data-person-name*="${cleanName}"]`) as HTMLElement) || 
                     (document.querySelector(`[data-spouse-name*="${cleanName}"]`) as HTMLElement);
        }
      }

      if (targetEl && containerRef.current && contentRef.current) {
        const targetRect = targetEl.getBoundingClientRect();
        const contRect = containerRef.current.getBoundingClientRect();
        const contentRect = contentRef.current.getBoundingClientRect();

        // Hitung posisi tengah kartu target pada ruang koordinat unscaled konten
        const curZoom = zoom || 1;
        const targetCenterXInContent = (targetRect.left + targetRect.width / 2 - contentRect.left) / curZoom;
        const targetCenterYInContent = (targetRect.top + targetRect.height / 2 - contentRect.top) / curZoom;

        const targetZoom = 1.05;
        const newX = (contRect.width / 2) - (targetCenterXInContent * targetZoom);
        const newY = (contRect.height / 2) - (targetCenterYInContent * targetZoom);

        setIsAnimating(true);
        setPosition({ x: newX, y: newY });
        setZoom(targetZoom);
        setTimeout(() => setIsAnimating(false), 550);
      } else if (attemptsLeft > 0) {
        setTimeout(() => attemptCenter(attemptsLeft - 1), 100);
      }
    };

    setTimeout(() => attemptCenter(8), 100);
  };

  // Fokus awal saat pertama kali buka tab pohon
  useEffect(() => {
    if (!focusTarget) {
      const timer = setTimeout(() => {
        centerRootAncestor();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  // Pantau fokus dari tab lain (misal dari menu Anggota)
  useEffect(() => {
    if (focusTarget) {
      focusOnPerson(focusTarget);
      onClearFocus?.();
    }
  }, [focusTarget]);

  // Daftar seluruh anggota & pasangan untuk pencarian cepat
  const searchableTreeList = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      photo?: string;
      gender: 'L' | 'P';
      isAlive: boolean;
      branch: 'istri1' | 'istri2' | 'root';
      branchLabel: string;
      relationLabel: string;
      memberId: number;
      isSpouse: boolean;
      spouseName?: string;
    }> = [];
    const seen = new Set<string>();

    members.forEach(m => {
      const isRoot = m.id === 1 || (wife1 && m.id === wife1.id) || (wife2 && m.id === wife2.id) || m.id === 2 || m.id === 3;
      const b = isRoot ? 'root' : getMemberBranch(m, members);
      const bLabel = isRoot 
        ? '👑 Pemuncak Silsilah' 
        : b === 'istri1' 
        ? '🌺 Cabang Mbah Munasikah (Istri 1)' 
        : '🌸 Cabang Mbah Masripah (Istri 2)';
      const rel = getParentLabel(m, false);

      const mKey = `m-${m.id}`;
      if (!seen.has(mKey)) {
        list.push({
          id: mKey,
          name: m.name,
          photo: m.photo,
          gender: m.gender,
          isAlive: m.isAlive,
          branch: b,
          branchLabel: bLabel,
          relationLabel: rel !== '-' ? `Ortu: ${rel}` : (isRoot ? 'Pemuncak Silsilah' : 'Anggota Keluarga'),
          memberId: m.id,
          isSpouse: false
        });
        seen.add(mKey);
      }

      const sps = getMemberSpouses(m, members);
      sps.forEach((sp, idx) => {
        const sKey = `sp-${m.id}-${sp.name.trim().toLowerCase()}`;
        if (!seen.has(sKey)) {
          const spGender = m.gender === 'L' ? 'P' : 'L';
          const spouseRel = m.gender === 'L' 
            ? (sps.length > 1 ? `Istri ke-${idx + 1} dari ${m.name}` : `Istri dari ${m.name}`)
            : (sps.length > 1 ? `Suami ke-${idx + 1} dari ${m.name}` : `Suami dari ${m.name}`);
          list.push({
            id: sKey,
            name: sp.name,
            photo: sp.photo,
            gender: spGender,
            isAlive: sp.isAlive ?? true,
            branch: b,
            branchLabel: bLabel,
            relationLabel: spouseRel,
            memberId: m.id,
            isSpouse: true,
            spouseName: sp.name
          });
          seen.add(sKey);
        }
      });
    });

    return list;
  }, [members, wife1, wife2]);

  const filteredSearchResults = useMemo(() => {
    if (!treeSearchQuery.trim()) return [];
    const q = treeSearchQuery.trim().toLowerCase();
    return searchableTreeList.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.relationLabel.toLowerCase().includes(q) ||
      item.branchLabel.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchableTreeList, treeSearchQuery]);

  const handleProfileClick = (node: Member, isSpouse: boolean = false, spouseObj?: Spouse) => {
    setSelectedTarget({ member: node, isSpouse, spouseObj });
  };

  return (
    <div className="flex flex-col h-[75vh] relative rounded-2xl overflow-hidden shadow-lg border-2 border-amber-300/70 bg-[#FAF7EE] -mx-4 -mt-4">
      
      {/* HEADER JUDUL BAGAN SILSILAH DENGAN ORNAMEN ISLAMI */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none w-[94%] max-w-lg">
        <div className="bg-white/95 backdrop-blur-md px-4 sm:px-6 py-1.5 rounded-full shadow-md text-center border-2 border-amber-400/80 flex items-center gap-2">
          <span className="text-amber-600 text-xs">✨</span>
          <h2 className="text-xs sm:text-sm font-black text-emerald-950 tracking-wide flex items-center justify-center gap-1.5">
            <span>👑</span>
            <span>Bagan Silsilah Mbah KH. Sumadi</span>
          </h2>
          <span className="text-amber-600 text-xs">✨</span>
        </div>
      </div>

      {/* FITUR PENCARIAN NAMA DI POHON SILSILAH */}
      <div className="absolute top-3 right-3 sm:right-4 z-30 flex flex-col items-end">
        <div className={`relative transition-all duration-200 ${isSearchOpen || treeSearchQuery ? 'w-60 sm:w-72' : 'w-10 sm:w-10'}`}>
          {!isSearchOpen && !treeSearchQuery ? (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-10 h-10 bg-white/95 hover:bg-amber-50 text-emerald-950 rounded-full shadow-md flex items-center justify-center transition active:scale-95 cursor-pointer border-2 border-amber-400/80 backdrop-blur-md"
              title="Cari nama di pohon silsilah"
            >
              <Search size={18} className="text-emerald-800" />
            </button>
          ) : (
            <div className="relative flex flex-col items-end w-full">
              <div className="relative w-full shadow-xl rounded-2xl overflow-hidden border-2 border-emerald-500 bg-white">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={treeSearchQuery}
                  onChange={(e) => setTreeSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredSearchResults.length > 0) {
                      const first = filteredSearchResults[0];
                      focusOnPerson({ memberId: first.memberId, spouseName: first.spouseName, name: first.name });
                      setTreeSearchQuery('');
                      setIsSearchOpen(false);
                      showToast?.(`Menampilkan posisi ${first.name} di Pohon Silsilah`, 'success');
                    } else if (e.key === 'Escape') {
                      setTreeSearchQuery('');
                      setIsSearchOpen(false);
                    }
                  }}
                  placeholder="Cari nama anggota/pasangan..."
                  className="w-full pl-8 pr-8 py-2 text-xs font-bold text-gray-800 outline-none placeholder:text-gray-400"
                />
                <button
                  onClick={() => {
                    setTreeSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 rounded-full cursor-pointer"
                  title="Tutup pencarian"
                >
                  <X size={14} />
                </button>
              </div>

              {/* DROPDOWN HASIL PENCARIAN LIVE */}
              {treeSearchQuery.trim() && (
                <div className="absolute top-11 right-0 w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border-2 border-emerald-300 overflow-hidden z-50 animate-fade-in max-h-72 overflow-y-auto divide-y divide-gray-100">
                  <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-200 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                      Hasil ({filteredSearchResults.length})
                    </span>
                    <span className="text-[9px] text-emerald-700 font-semibold">
                      Klik untuk fokus ke kartu
                    </span>
                  </div>

                  {filteredSearchResults.length > 0 ? (
                    filteredSearchResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          focusOnPerson({ memberId: item.memberId, spouseName: item.spouseName, name: item.name });
                          setTreeSearchQuery('');
                          setIsSearchOpen(false);
                          showToast?.(`Menampilkan posisi ${item.name} di Pohon Silsilah`, 'success');
                        }}
                        className="p-2.5 hover:bg-emerald-50 transition cursor-pointer flex items-center gap-2.5 group"
                      >
                        {/* Avatar */}
                        <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border shadow-2xs">
                          {item.photo ? (
                            <img src={item.photo} className="w-full h-full object-cover" alt={item.name} />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${item.gender === 'L' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                              <Users size={16} />
                            </div>
                          )}
                          {!item.isAlive && (
                            <span className="absolute bottom-0 right-0 bg-gray-800 text-white text-[6px] font-black px-0.5 rounded">
                              ALM
                            </span>
                          )}
                        </div>

                        {/* Text info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-gray-800 group-hover:text-emerald-800 truncate">
                            {item.name}
                          </p>
                          <p className="text-[9.5px] text-gray-500 truncate leading-tight">
                            {item.relationLabel}
                          </p>
                          <span className={`inline-block text-[7.5px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                            item.branch === 'root'
                              ? 'bg-amber-100 text-amber-900'
                              : item.branch === 'istri1'
                              ? 'bg-purple-100 text-purple-900'
                              : 'bg-pink-100 text-pink-900'
                          }`}>
                            {item.branchLabel}
                          </span>
                        </div>

                        {/* Chevron Icon */}
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400 italic">
                      Tidak ditemukan nama &quot;{treeSearchQuery}&quot; di silsilah
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KONTROL ZOOM & VIEW */}
      <div className="absolute left-3 sm:left-4 top-14 flex flex-col gap-2 z-30">
        <button 
          onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} 
          className="w-9 h-9 sm:w-10 sm:h-10 bg-white/95 hover:bg-amber-50 text-emerald-950 border border-amber-300/80 rounded-full shadow-md flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-md" 
          title="Perbesar (Zoom In)"
        >
          <Plus size={18}/>
        </button>
        <button 
          onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} 
          className="w-9 h-9 sm:w-10 sm:h-10 bg-white/95 hover:bg-amber-50 text-emerald-950 border border-amber-300/80 rounded-full shadow-md flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-md" 
          title="Perkecil (Zoom Out)"
        >
          <Minus size={18}/>
        </button>
        <button 
          onClick={centerRootAncestor} 
          className="w-9 h-9 sm:w-10 sm:h-10 bg-white/95 hover:bg-amber-50 text-emerald-950 border border-amber-300/80 rounded-full shadow-md flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-md" 
          title="Pusatkan ke Mbah KH. Sumadi"
        >
          <Maximize size={16}/>
        </button>
        <button 
          onClick={() => setExpandAll(!expandAll)} 
          className={`w-9 h-9 sm:w-10 sm:h-10 border rounded-full shadow-md flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-md ${
            expandAll 
              ? 'bg-emerald-700 border-emerald-800 text-white' 
              : 'bg-white/95 border-amber-300/80 text-emerald-950 hover:bg-amber-50'
          }`} 
          title="Buka / Tutup Cabang Silsilah"
        >
          <Network size={16}/>
        </button>
      </div>

      <PanZoomWrapper 
        zoom={zoom} 
        setZoom={setZoom} 
        position={position} 
        setPosition={setPosition} 
        containerRef={containerRef}
        contentRef={contentRef}
        isAnimating={isAnimating}
      >
        {sumadi ? (
          <div className="relative flex flex-col items-center">
            
            {/* TAMPILAN SEMUA CABANG: ISTRI 1 (KIRI) ━━ MBAH SUMADI (TENGAH) ━━ ISTRI 2 (KANAN) */}
            <div className="relative flex justify-center items-start pt-2">
                
                {/* CABANG KIRI: KETURUNAN PERNIKAHAN MBAH MUNASIKAH (ISTRI 1) & MBAH KH. SUMADI */}
                <div className="relative flex flex-col items-center">
                  
                  {/* BARIS SEJAJAR ATAS KIRI: KARTU MBAH MUNASIKAH + GARIS PERNIKAHAN MENUJU TENGAH */}
                  <div className="relative flex items-center justify-end w-full">
                    {/* Kartu Mbah Munasikah (Istri Pertama di Kiri) */}
                    <div className="flex-shrink-0 z-20">
                      {wife1 ? (
                        <PersonBox
                          id={`tree-member-${wife1.id}`}
                          name={wife1.name}
                          gender={wife1.gender}
                          isAlive={wife1.isAlive}
                          photo={wife1.photo}
                          label="Istri 1"
                          badgeColor="bg-purple-100 text-purple-900 border-purple-300"
                          isHighlighted={Boolean(highlightedTarget?.memberId === wife1.id || (highlightedTarget?.name && wife1.name.toLowerCase().includes(highlightedTarget.name.toLowerCase())))}
                          onClick={(e) => { e.stopPropagation(); handleProfileClick(wife1, false); }}
                        />
                      ) : (
                        <div className="p-3 bg-purple-900/60 rounded-2xl text-white text-xs">Mbah Munasikah (Istri 1)</div>
                      )}
                    </div>

                    {/* Garis Horizontal Pernikahan Menghubungkan Mbah Munasikah & Mbah Sumadi */}
                    <div className="flex-1 min-w-[110px] sm:min-w-[150px] h-[3.5px] bg-gradient-to-r from-purple-400 via-amber-400 to-emerald-400 self-center relative flex items-center justify-center">
                    </div>
                  </div>

                  {/* GARIS TURUN VERTICAL DARI TITIK TENGAH PERNIKAHAN MENUJU KETURUNAN */}
                  <div className="relative flex flex-col items-center w-full mt-0">
                    {/* Batang Garis Vertikal Turun Tepat dari Titik Pernikahan */}
                    <div className="w-[3px] h-8 bg-purple-400 shadow-xs"></div>

                    {/* Banner Silsilah Keturunan Mbah Munasikah */}
                    <div className="mb-3 px-3 py-1 rounded-xl bg-purple-950/90 border border-purple-500/70 shadow-sm text-center">
                      <p className="text-[10px] font-black text-purple-200 uppercase tracking-wide">
                        Keturunan Mbah Munasikah & Mbah KH. Sumadi (Istri Pertama)
                      </p>
                      <p className="text-[8px] font-bold text-purple-300/80">
                        {countDescendantsBranch(wife1Children)} Anggota Keturunan (Anak & Cucu)
                      </p>
                    </div>

                    {/* Deretan Anak-anak & Cucu-cucu */}
                    {wife1Children.length > 0 ? (
                      <div className="flex justify-center items-start">
                        {wife1Children.map((child, idx) => {
                          const isFirst = idx === 0;
                          const isLast = idx === wife1Children.length - 1;
                          const isOnly = wife1Children.length === 1;

                          return (
                            <div key={child.id} className="relative flex flex-col items-center px-2 sm:px-4">
                              {!isOnly && (
                                <>
                                  {isFirst && <div className="absolute top-0 right-0 w-1/2 h-[2.5px] bg-purple-400"></div>}
                                  {isLast && <div className="absolute top-0 left-0 w-1/2 h-[2.5px] bg-purple-400"></div>}
                                  {!isFirst && !isLast && <div className="absolute top-0 left-0 w-full h-[2.5px] bg-purple-400"></div>}
                                </>
                              )}
                              <TreeNode
                                node={child}
                                members={members}
                                onOpenProfile={handleProfileClick}
                                isRoot={false}
                                globalExpandAll={expandAll}
                                highlightedTarget={highlightedTarget}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[9px] text-purple-300/60 mt-1 font-medium italic">Belum ada data anak/cucu</p>
                    )}
                  </div>

                </div>

                {/* TENGAH: MBAH KH. SUMADI (PEMUNCAK SILSILAH) */}
                <div className="relative flex flex-col items-center z-30 px-0 flex-shrink-0">
                  <PersonBox
                    id={`tree-member-${sumadi.id}`}
                    name={sumadi.name}
                    gender={sumadi.gender}
                    isAlive={sumadi.isAlive}
                    photo={sumadi.photo}
                    isRootAncestor={true}
                    isHighlighted={Boolean(highlightedTarget?.memberId === sumadi.id || (highlightedTarget?.name && sumadi.name.toLowerCase().includes(highlightedTarget.name.toLowerCase())))}
                    onClick={(e) => { e.stopPropagation(); handleProfileClick(sumadi, false); }}
                  />
                </div>

                {/* CABANG KANAN: KETURUNAN PERNIKAHAN MBAH MASRIPAH (ISTRI 2) & MBAH KH. SUMADI */}
                <div className="relative flex flex-col items-center">
                  
                  {/* BARIS SEJAJAR ATAS KANAN: GARIS PERNIKAHAN + KARTU MBAH MASRIPAH */}
                  <div className="relative flex items-center justify-start w-full">
                    {/* Garis Horizontal Pernikahan Menghubungkan Mbah Sumadi & Mbah Masripah */}
                    <div className="flex-1 min-w-[110px] sm:min-w-[150px] h-[3.5px] bg-gradient-to-r from-emerald-400 via-amber-400 to-pink-400 self-center relative flex items-center justify-center">
                    </div>

                    {/* Kartu Mbah Masripah (Istri Kedua di Kanan) */}
                    <div className="flex-shrink-0 z-20">
                      {wife2 ? (
                        <PersonBox
                          id={`tree-member-${wife2.id}`}
                          name={wife2.name}
                          gender={wife2.gender}
                          isAlive={wife2.isAlive}
                          photo={wife2.photo}
                          label="Istri 2"
                          badgeColor="bg-pink-100 text-pink-900 border-pink-300"
                          isHighlighted={Boolean(highlightedTarget?.memberId === wife2.id || (highlightedTarget?.name && wife2.name.toLowerCase().includes(highlightedTarget.name.toLowerCase())))}
                          onClick={(e) => { e.stopPropagation(); handleProfileClick(wife2, false); }}
                        />
                      ) : (
                        <div className="p-3 bg-pink-900/60 rounded-2xl text-white text-xs">Mbah Masripah (Istri 2)</div>
                      )}
                    </div>
                  </div>

                  {/* GARIS TURUN VERTICAL DARI TITIK TENGAH PERNIKAHAN MENUJU KETURUNAN */}
                  <div className="relative flex flex-col items-center w-full mt-0">
                    {/* Batang Garis Vertikal Turun Tepat dari Titik Pernikahan */}
                    <div className="w-[3px] h-8 bg-pink-400 shadow-xs"></div>

                    {/* Banner Silsilah Keturunan Mbah Masripah */}
                    <div className="mb-3 px-3 py-1 rounded-xl bg-pink-950/90 border border-pink-500/70 shadow-sm text-center">
                      <p className="text-[10px] font-black text-pink-200 uppercase tracking-wide">
                        Keturunan Mbah Masripah & Mbah KH. Sumadi (Istri Kedua)
                      </p>
                      <p className="text-[8px] font-bold text-pink-300/80">
                        {countDescendantsBranch(wife2Children)} Anggota Keturunan (Anak & Cucu)
                      </p>
                    </div>

                    {/* Deretan Anak-anak & Cucu-cucu */}
                    {wife2Children.length > 0 ? (
                      <div className="flex justify-center items-start">
                        {wife2Children.map((child, idx) => {
                          const isFirst = idx === 0;
                          const isLast = idx === wife2Children.length - 1;
                          const isOnly = wife2Children.length === 1;

                          return (
                            <div key={child.id} className="relative flex flex-col items-center px-2 sm:px-4">
                              {!isOnly && (
                                <>
                                  {isFirst && <div className="absolute top-0 right-0 w-1/2 h-[2.5px] bg-pink-400"></div>}
                                  {isLast && <div className="absolute top-0 left-0 w-1/2 h-[2.5px] bg-pink-400"></div>}
                                  {!isFirst && !isLast && <div className="absolute top-0 left-0 w-full h-[2.5px] bg-pink-400"></div>}
                                </>
                              )}
                              <TreeNode
                                node={child}
                                members={members}
                                onOpenProfile={handleProfileClick}
                                isRoot={false}
                                globalExpandAll={expandAll}
                                highlightedTarget={highlightedTarget}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[9px] text-pink-300/60 mt-1 font-medium italic">Belum ada data anak/cucu</p>
                    )}
                  </div>

                </div>

              </div>

            </div>
        ) : (
          <p className="text-white/50 font-medium mt-10">Belum ada struktur silsilah.</p>
        )}
      </PanZoomWrapper>

      {selectedTarget && (
        <ProfilePopupCard 
          initialTarget={selectedTarget} 
          members={members} 
          onClose={() => setSelectedTarget(null)} 
          onNavigateToTree={(target) => {
            setSelectedTarget(null);
            focusOnPerson({ 
              memberId: target.member.id, 
              spouseName: target.isSpouse ? (target.spouseObj?.name || target.member.spouse) : undefined,
              name: target.isSpouse ? (target.spouseObj?.name || target.member.spouse) : target.member.name
            });
          }}
        />
      )}
    </div>
  );
}

function CoupleCard({
  member,
  spouse,
  label,
  badgeColor,
  onOpenProfile,
  hasChildren,
  isExpanded,
  onToggleExpand,
  isMemberHighlighted = false,
  isSpouseHighlighted = false
}: {
  member: Member;
  spouse: Spouse;
  label?: string;
  badgeColor?: string;
  onOpenProfile: (m: Member, isSpouse: boolean, spouseObj?: Spouse) => void;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isMemberHighlighted?: boolean;
  isSpouseHighlighted?: boolean;
}) {
  const isPrimaryMale = member.gender === 'L';
  const spouseIsMale = !isPrimaryMale;
  const isAnyHighlighted = isMemberHighlighted || isSpouseHighlighted;
  const cleanSpouseName = (spouse.name || '').toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="relative flex flex-col items-center select-none flex-shrink-0">
      {/* KARTU GABUNGAN PASANGAN (SATU CARD) */}
      <div className={`relative flex flex-col items-center p-2 sm:p-2.5 rounded-2xl shadow-md border-2 transition-all duration-300 backdrop-blur-sm ${
        isAnyHighlighted
          ? 'border-amber-400 ring-4 ring-amber-400 ring-offset-2 ring-offset-emerald-900 shadow-2xl scale-105 z-40 bg-amber-50/90 text-amber-950 animate-pulse'
          : 'border-emerald-400/80 bg-gradient-to-b from-emerald-50/70 via-white to-white text-emerald-950 hover:shadow-xl hover:border-emerald-500'
      }`}>
        
        {isAnyHighlighted && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-emerald-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-2xl border border-white animate-bounce whitespace-nowrap z-50 flex items-center gap-1">
            <span>🎯</span>
            <span>Di Sini</span>
          </div>
        )}

        {/* Label Atas Kartu (e.g. Istri Pertama, Istri Kedua, Pasangan) */}
        {label && (
          <span className={`text-[7.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5 border shadow-2xs ${
            badgeColor || 'bg-emerald-100 text-emerald-900 border-emerald-300'
          }`}>
            {label}
          </span>
        )}

        {/* Baris Dua Orang dalam Satu Card */}
        <div className="flex items-center gap-2">
          
          {/* SISI ANGGOTA UTAMA */}
          <div 
            id={`tree-member-${member.id}`}
            data-person-name={member.name.toLowerCase()}
            onClick={(e) => { e.stopPropagation(); onOpenProfile(member, false); }}
            className={`flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition w-[84px] sm:w-[92px] ${
              isMemberHighlighted 
                ? 'bg-amber-200/80 ring-2 ring-amber-400 font-black scale-105' 
                : 'hover:bg-emerald-100/50'
            } ${
              isPrimaryMale ? 'text-blue-950' : 'text-pink-950'
            }`}
            title={`Klik untuk melihat detail profil ${member.name}`}
          >
            <div className="relative mb-1">
              {!member.isAlive && (
                <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-[7px] font-black px-1 py-0.2 rounded-md shadow-xs z-20">
                  ALM
                </span>
              )}
              <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 shadow-sm overflow-hidden flex-shrink-0 ${
                isMemberHighlighted
                  ? 'border-amber-400 ring-2 ring-amber-300'
                  : isPrimaryMale 
                  ? 'bg-blue-100/70 text-blue-600 border-blue-300' 
                  : 'bg-pink-100/70 text-pink-600 border-pink-300'
              }`}>
                {member.photo ? (
                  <img src={member.photo} className="w-full h-full object-cover" alt={member.name} />
                ) : (
                  <Users size={18} />
                )}
              </div>
            </div>

            <p className="font-bold text-[10px] text-center leading-tight line-clamp-2 w-full break-words">
              {member.name}
            </p>
            <span className={`text-[7px] font-black mt-0.5 px-1 py-0.2 rounded ${
              isPrimaryMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
            }`}>
              {isPrimaryMale ? 'Suami' : 'Istri'}
            </span>
          </div>

          {/* PEMISAH ELEGAN ANTARA PASANGAN (TANPA SIMBOL CINCIN) */}
          <div className="flex flex-col items-center justify-center px-0.5">
            <div className="w-[1.5px] h-10 bg-emerald-200/90 rounded-full flex items-center justify-center relative">
              <span className="absolute bg-emerald-100 text-emerald-800 text-[8.5px] font-black w-4 h-4 rounded-full border border-emerald-300 shadow-2xs flex items-center justify-center leading-none">
                &
              </span>
            </div>
          </div>

          {/* SISI PASANGAN */}
          <div 
            id={`tree-spouse-${cleanSpouseName}`}
            data-spouse-name={spouse.name.toLowerCase()}
            onClick={(e) => { e.stopPropagation(); onOpenProfile(member, true, spouse); }}
            className={`flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition w-[84px] sm:w-[92px] ${
              isSpouseHighlighted 
                ? 'bg-amber-200/80 ring-2 ring-amber-400 font-black scale-105' 
                : 'hover:bg-emerald-100/50'
            } ${
              spouseIsMale ? 'text-blue-950' : 'text-pink-950'
            }`}
            title={`Klik untuk melihat detail profil ${spouse.name}`}
          >
            <div className="relative mb-1">
              {!spouse.isAlive && (
                <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-[7px] font-black px-1 py-0.2 rounded-md shadow-xs z-20">
                  ALM
                </span>
              )}
              <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 shadow-sm overflow-hidden flex-shrink-0 ${
                isSpouseHighlighted
                  ? 'border-amber-400 ring-2 ring-amber-300'
                  : spouseIsMale 
                  ? 'bg-blue-100/70 text-blue-600 border-blue-300' 
                  : 'bg-pink-100/70 text-pink-600 border-pink-300'
              }`}>
                {spouse.photo ? (
                  <img src={spouse.photo} className="w-full h-full object-cover" alt={spouse.name} />
                ) : (
                  <Users size={18} />
                )}
              </div>
            </div>

            <p className="font-bold text-[10px] text-center leading-tight line-clamp-2 w-full break-words">
              {spouse.name}
            </p>
            <span className={`text-[7px] font-black mt-0.5 px-1 py-0.2 rounded ${
              spouseIsMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
            }`}>
              {spouseIsMale ? 'Suami' : 'Istri'}
            </span>
          </div>

        </div>

        {/* Tombol Expand/Collapse jika ada anak */}
        {hasChildren && onToggleExpand && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} 
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-md text-white flex items-center justify-center z-30 hover:bg-emerald-700 transition font-black active:scale-95 cursor-pointer"
            title={isExpanded ? 'Sembunyikan Keturunan' : 'Tampilkan Keturunan'}
          >
            {isExpanded ? <Minus size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
          </button>
        )}
      </div>
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
  customLabel,
  highlightedTarget
}: { 
  node: TreeNodeData; 
  members?: Member[];
  onOpenProfile: (n: Member, isSpouse: boolean, spouseObj?: Spouse) => void; 
  isRoot: boolean; 
  globalExpandAll: boolean; 
  hideSpouse?: boolean;
  customLabel?: string;
  highlightedTarget?: { memberId?: number; spouseName?: string; name?: string } | null;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const spouses = getMemberSpouses(node, members);

  useEffect(() => { setIsExpanded(globalExpandAll); }, [globalExpandAll]);

  // Helper untuk memisahkan anak berdasarkan pasangan
  const getChildrenForSpouse = (sp: Spouse, spIdx: number) => {
    if (!node.children || node.children.length === 0) return [];
    return node.children.filter(child => {
      if (child.parentSpouseName && sp.name) {
        if (child.parentSpouseName.trim().toLowerCase() === sp.name.trim().toLowerCase()) return true;
      }
      if (child.spouseIndex !== undefined && child.spouseIndex !== null) {
        return Number(child.spouseIndex) === spIdx;
      }
      if (child.motherId && (sp.id === child.motherId || Number(sp.id) === child.motherId)) {
        return true;
      }
      // Jika belum ditentukan spesifik, default ke pasangan pertama
      if (!child.parentSpouseName && (child.spouseIndex === undefined || child.spouseIndex === null)) {
        return spIdx === 0;
      }
      return false;
    });
  };

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col items-center relative">
      
      {/* GARIS KE BAWAH: Masuk ke atas kartu anak dari orang tua di atas */}
      {!isRoot && (
        <div className="w-[2.5px] h-6 bg-emerald-500 mb-0 flex-shrink-0"></div>
      )}

      {/* KONTEN KARTU ANGGOTA / PASANGAN */}
      {spouses.length === 0 || hideSpouse ? (
        // KASUS 1: BELUM MEMILIKI PASANGAN -> 1 KARTU TUNGGAL
        <div className="relative flex flex-col items-center">
          <PersonBox 
            id={`tree-member-${node.id}`}
            name={node.name} 
            gender={node.gender} 
            isAlive={node.isAlive} 
            photo={node.photo} 
            label={customLabel || (isRoot ? 'Puncak Silsilah' : undefined)}
            isHighlighted={Boolean(highlightedTarget?.memberId === node.id)}
            onClick={(e) => { e.stopPropagation(); onOpenProfile(node, false); }} 
          />

          {hasChildren && (
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} 
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-md text-white flex items-center justify-center z-30 hover:bg-emerald-700 transition font-black active:scale-95 cursor-pointer"
              title={isExpanded ? 'Sembunyikan Keturunan' : 'Tampilkan Keturunan'}
            >
              {isExpanded ? <Minus size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
            </button>
          )}
        </div>
      ) : spouses.length === 1 ? (
        // KASUS 2: MEMILIKI 1 PASANGAN (CONTOH: MASLURI & YAH) -> DIJADIKAN SATU CARD!
        <CoupleCard 
          member={node}
          spouse={spouses[0]}
          label={customLabel}
          onOpenProfile={onOpenProfile}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          isMemberHighlighted={Boolean(
            highlightedTarget?.memberId === node.id || 
            (highlightedTarget?.name && node.name.toLowerCase().includes(highlightedTarget.name.toLowerCase()))
          )}
          isSpouseHighlighted={Boolean(
            (highlightedTarget?.spouseName && spouses[0].name && highlightedTarget.spouseName.trim().toLowerCase() === spouses[0].name.trim().toLowerCase()) ||
            (highlightedTarget?.name && spouses[0].name && (
              spouses[0].name.toLowerCase().includes(highlightedTarget.name.toLowerCase()) ||
              highlightedTarget.name.toLowerCase().includes(spouses[0].name.toLowerCase())
            ))
          )}
        />
      ) : (
        // KASUS 3: MEMILIKI LEBIH DARI 1 PASANGAN (MENIKAH LAGI / POLIGAMI, CONTOH: MASRURON)
        // -> DIJADIKAN BEDA CARD: MASRURON & SRI DALAM SATU CARD, MASRURON & MAGHFIROH DALAM SATU CARD!
        <div className="relative flex flex-col items-center">
          {/* Garis Horizontal Penghubung di atas kedua kartu pasangan */}
          {!isRoot && (
            <div className="w-full flex justify-center mb-0 relative">
              <div className="w-1/2 h-[2.5px] bg-emerald-500"></div>
            </div>
          )}

          <div className="flex items-start justify-center gap-4 sm:gap-6 relative">
            {spouses.map((sp, idx) => {
              const spouseChildren = getChildrenForSpouse(sp, idx);
              const hasSpouseChildren = spouseChildren.length > 0;
              const isFirst = idx === 0;
              const spouseCardLabel = node.gender === 'L' 
                ? (isFirst ? 'Istri Pertama (ke-1)' : `Istri Kedua (ke-${idx + 1})`)
                : (isFirst ? 'Suami Pertama (ke-1)' : `Suami Kedua (ke-${idx + 1})`);

              return (
                <div key={sp.id || idx} className="relative flex flex-col items-center">
                  {/* Kartu Khusus Pernikahan Pasangan ini */}
                  <CoupleCard 
                    member={node}
                    spouse={sp}
                    label={spouseCardLabel}
                    badgeColor={isFirst ? 'bg-pink-100 text-pink-900 border-pink-300' : 'bg-purple-100 text-purple-900 border-purple-300'}
                    onOpenProfile={onOpenProfile}
                    hasChildren={hasSpouseChildren}
                    isExpanded={isExpanded}
                    onToggleExpand={() => setIsExpanded(!isExpanded)}
                    isMemberHighlighted={Boolean(
                      highlightedTarget?.memberId === node.id || 
                      (highlightedTarget?.name && node.name.toLowerCase().includes(highlightedTarget.name.toLowerCase()))
                    )}
                    isSpouseHighlighted={Boolean(
                      (highlightedTarget?.spouseName && sp.name && highlightedTarget.spouseName.trim().toLowerCase() === sp.name.trim().toLowerCase()) ||
                      (highlightedTarget?.name && sp.name && (
                        sp.name.toLowerCase().includes(highlightedTarget.name.toLowerCase()) ||
                        highlightedTarget.name.toLowerCase().includes(sp.name.toLowerCase())
                      ))
                    )}
                  />

                  {/* Keturunan Khusus dari Pasangan ini */}
                  {hasSpouseChildren && isExpanded && (
                    <div className="relative flex flex-col items-center mt-3 pt-4 w-full">
                      <div className="absolute top-0 left-1/2 w-[2.5px] h-4 bg-emerald-500 -translate-x-1/2"></div>
                      <div className="flex justify-center items-start">
                        {spouseChildren.map((child, cIdx) => {
                          const isChildFirst = cIdx === 0;
                          const isChildLast = cIdx === spouseChildren.length - 1;
                          const isChildOnly = spouseChildren.length === 1;

                          return (
                            <div key={child.id} className="relative flex flex-col items-center px-2 sm:px-4">
                              {!isChildOnly && (
                                <>
                                  {isChildFirst && <div className="absolute top-0 right-0 w-1/2 h-[2.5px] bg-emerald-500"></div>}
                                  {isChildLast && <div className="absolute top-0 left-0 w-1/2 h-[2.5px] bg-emerald-500"></div>}
                                  {!isChildFirst && !isChildLast && <div className="absolute top-0 left-0 w-full h-[2.5px] bg-emerald-500"></div>}
                                </>
                              )}
                              <TreeNode 
                                node={child}
                                members={members}
                                onOpenProfile={onOpenProfile}
                                isRoot={false}
                                globalExpandAll={globalExpandAll}
                                highlightedTarget={highlightedTarget}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GARIS KETURUNAN UNTUK KASUS 1 & 2 (SINGLE ATAU 1 PASANGAN) */}
      {spouses.length <= 1 && hasChildren && isExpanded && (
        <div className="relative flex flex-col items-center mt-3 pt-4 w-full">
          {/* Garis vertikal lurus ke bawah dari kartu */}
          <div className="absolute top-0 left-1/2 w-[2.5px] h-4 bg-emerald-500 -translate-x-1/2"></div>
          
          {/* Cabang horizontal menghubungkan anak-anak di bawahnya */}
          <div className="flex justify-center items-start">
            {node.children.map((child, index) => {
              const isFirst = index === 0;
              const isLast = index === node.children.length - 1;
              const isOnly = node.children.length === 1;

              return (
                <div key={child.id} className="relative flex flex-col items-center px-2 sm:px-4">
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
                    highlightedTarget={highlightedTarget}
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

function ProfilePopupCard({ 
  initialTarget, 
  members, 
  onClose,
  onNavigateToTree 
}: { 
  initialTarget: FamilyRelationTarget; 
  members: Member[]; 
  onClose: () => void;
  onNavigateToTree?: (target: FamilyRelationTarget) => void;
}) {
  const [currentTarget, setCurrentTarget] = useState<FamilyRelationTarget>(initialTarget);

  const profile = useMemo(() => {
    return buildFullProfileData(
      currentTarget.member, 
      members, 
      currentTarget.isSpouse ?? false, 
      currentTarget.spouseObj
    );
  }, [currentTarget, members]);

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in" 
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-b from-[#FCFBF8] via-[#F8F4EC] to-[#EFE7D8] rounded-[2.25rem] w-full max-w-sm max-h-[92vh] shadow-2xl flex flex-col overflow-hidden relative border-2 border-amber-400/80 ring-1 ring-emerald-600/20 text-gray-800" 
        onClick={e => e.stopPropagation()}
      >
        {/* BACKGROUND ORNAMEN ISLAMIC MODERN */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
          {/* Lengkungan Kubah / Mihrab Islami Modern Bagian Atas */}
          <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 rounded-b-[2.5rem] shadow-md border-b-2 border-amber-400/60" />
          
          {/* Efek Cahaya / Ambient Radiant Light */}
          <div className="absolute top-0 inset-x-0 h-44 opacity-40 bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,0.25),transparent_70%)]" />

          {/* Watermark Pola Geometris Bintang 8 Islami */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.16]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="islamic-modal-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
                <path
                  d="M30 6 L35 19 L48 14 L43 27 L54 30 L43 33 L48 46 L35 41 L30 54 L25 41 L12 46 L17 33 L6 30 L17 27 L12 14 L25 19 Z"
                  fill="none"
                  stroke="#B48232"
                  strokeWidth="0.8"
                />
                <polygon
                  points="30,16 36,19 39,26 36,33 30,36 24,33 21,26 24,19"
                  fill="rgba(180, 130, 50, 0.05)"
                  stroke="#15803D"
                  strokeWidth="0.6"
                />
                <line x1="0" y1="30" x2="60" y2="30" stroke="#B48232" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.4" />
                <line x1="30" y1="0" x2="30" y2="60" stroke="#B48232" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.4" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#islamic-modal-pattern)" />
          </svg>

          {/* Ornamen Sudut Bawah */}
          <div className="absolute bottom-2 left-2 w-16 h-16 opacity-25">
            <svg viewBox="0 0 100 100" fill="none">
              <path d="M0 100 L70 100 C45 100 30 85 30 60 C30 35 15 20 0 0 L0 100 Z" fill="rgba(217,119,6,0.1)" />
              <path d="M4 96 L60 96 C40 96 26 82 26 58 C26 34 14 22 4 4 Z" stroke="#B48232" strokeWidth="1.2" />
            </svg>
          </div>
          <div className="absolute bottom-2 right-2 w-16 h-16 opacity-25 scale-x-[-1]">
            <svg viewBox="0 0 100 100" fill="none">
              <path d="M0 100 L70 100 C45 100 30 85 30 60 C30 35 15 20 0 0 L0 100 Z" fill="rgba(217,119,6,0.1)" />
              <path d="M4 96 L60 96 C40 96 26 82 26 58 C26 34 14 22 4 4 Z" stroke="#B48232" strokeWidth="1.2" />
            </svg>
          </div>
        </div>

        {/* TOMBOL TUTUP / CLOSE */}
        <button 
          className="absolute top-3.5 right-3.5 bg-white/20 hover:bg-white/35 text-white p-2 rounded-full z-20 transition cursor-pointer backdrop-blur-md border border-white/30 shadow-md active:scale-95" 
          onClick={onClose}
          title="Tutup"
        >
          <X size={18}/>
        </button>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 relative z-10">
          
          {/* FOTO PROFIL DENGAN MEDALION FRAME EMAS ISLAMI & HEADER */}
          <div className="flex flex-col items-center">
            <div className="relative my-1 mt-3">
              <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full p-1.5 bg-gradient-to-tr from-amber-400 via-yellow-200 to-emerald-400 shadow-2xl ring-4 ring-amber-300/90 ring-offset-4 ring-offset-emerald-950 overflow-hidden flex items-center justify-center transition-transform duration-300 hover:scale-[1.03]">
                {profile.photo ? (
                  <img src={profile.photo} className="w-full h-full rounded-full object-cover shadow-inner" alt={profile.name} />
                ) : (
                  <div className={`w-full h-full rounded-full flex items-center justify-center ${profile.gender === 'L' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                    <Users size={52} />
                  </div>
                )}
              </div>
              {!profile.isAlive && (
                <span className="absolute bottom-1 right-1 bg-gray-900 text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border-2 border-amber-400 shadow-lg z-20">
                  ALM
                </span>
              )}
            </div>

            {/* NAMA LENGKAP */}
            <h2 className="text-xl sm:text-2xl font-black text-emerald-950 text-center mt-3 leading-tight tracking-tight drop-shadow-xs">
              {profile.name}
            </h2>

            {/* KETERANGAN GARIS KETURUNAN / SUBTITLE DENGAN AKSEN EMAS */}
            <div className="mt-1.5 flex justify-center">
              <span className="text-xs text-amber-950 font-bold bg-amber-100/90 px-3.5 py-1 rounded-full border border-amber-300/80 shadow-2xs inline-flex items-center gap-1.5">
                <span className="text-amber-600">✦</span>
                <span>{profile.subtitle}</span>
                <span className="text-amber-600">✦</span>
              </span>
            </div>
          </div>

          {/* KARTU INFORMASI UTAMA (TANGGAL LAHIR, DOMISILI, MENIKAH, JUMLAH ANAK) */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 space-y-3.5 border-2 border-amber-200/80 shadow-md text-xs text-gray-800 font-medium">
            {/* ROW 1: TANGGAL LAHIR & USIA */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 border border-emerald-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <Calendar size={16} />
              </div>
              <span className="font-bold text-gray-900 break-words flex-1">
                {formatBirthDateAndAge(profile.birthDate, profile.isAlive, profile.deathDate)}
              </span>
            </div>

            {/* ROW 2: DOMISILI */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 border border-emerald-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <MapPin size={16} />
              </div>
              <span className="font-bold text-gray-900 break-words flex-1">
                {profile.domicile || 'Domisili belum diisi'}
              </span>
            </div>

            {/* ROW 3: STATUS PERNIKAHAN */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 border border-emerald-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <InfinityIcon size={16} />
              </div>
              <span className="font-bold text-gray-900 flex-1">
                {profile.maritalStatus}
              </span>
            </div>

            {/* ROW 4: JUMLAH ANAK */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 border border-emerald-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <Users size={16} />
              </div>
              <span className="font-bold text-gray-900 flex-1">
                {profile.childrenCount > 0 ? `${profile.childrenCount} Anak` : 'Belum ada data anak'}
              </span>
            </div>

            {/* OPSIONAL ROW 5: NO HP (JIKA ADA) */}
            {profile.phone && profile.phone !== '-' && (
              <div className="flex items-center gap-3 pt-2 border-t border-amber-200/60">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 border border-emerald-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <Phone size={16} />
                </div>
                <span className="font-bold text-gray-900 flex-1">
                  {profile.phone}
                </span>
              </div>
            )}
          </div>

          {/* SECTION: HUBUNGAN KELUARGA */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-[11px] font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-amber-600 text-xs">✨</span>
                <span>HUBUNGAN KELUARGA</span>
                <span className="text-amber-600 text-xs">✨</span>
              </h3>
              {profile.relations.length > 0 && (
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                  {profile.relations.length} Orang
                </span>
              )}
            </div>

            <div className="bg-white/95 backdrop-blur-md rounded-2xl divide-y divide-amber-100/80 border-2 border-amber-200/80 overflow-hidden shadow-md">
              {profile.relations.length > 0 ? (
                profile.relations.map((rel, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setCurrentTarget(rel.targetPerson)}
                    className="flex items-center justify-between p-3 hover:bg-emerald-50/90 transition-all cursor-pointer group"
                    title={`Klik untuk melihat profil ${rel.name} (${rel.relation})`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* AVATAR KECIL DENGAN RING EMAS */}
                      <div className="w-11 h-11 rounded-full border-2 border-amber-300/90 bg-white shadow-xs overflow-hidden flex-shrink-0 flex items-center justify-center ring-2 ring-emerald-500/20 group-hover:scale-105 transition-transform">
                        {rel.photo ? (
                          <img src={rel.photo} className="w-full h-full object-cover" alt={rel.name} />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${rel.gender === 'L' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                            <Users size={18} />
                          </div>
                        )}
                      </div>

                      {/* INFO HUBUNGAN & NAMA */}
                      <div className="min-w-0 flex-1">
                        <span className="text-[9.5px] font-black text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md inline-block mb-1 border border-emerald-200/70">
                          {rel.relation}
                        </span>
                        <p className="text-xs font-black text-gray-900 truncate group-hover:text-emerald-800 transition">
                          {rel.name}
                        </p>
                      </div>
                    </div>

                    {/* CHEVRON PANAH KANAN EMAS */}
                    <ChevronRight size={18} className="text-amber-500 group-hover:text-emerald-700 group-hover:translate-x-1 transition-transform flex-shrink-0 ml-2" />
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-gray-500 italic">
                  Belum ada data hubungan keluarga terdaftar
                </div>
              )}
            </div>
          </div>

          {/* TOMBOL LIHAT DI POHON KELUARGA */}
          <div className="pt-2">
            <button 
              onClick={() => {
                onNavigateToTree?.(currentTarget);
                onClose();
              }}
              className="w-full bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] text-white font-black py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-950/20 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 text-sm border-2 border-amber-400/50 cursor-pointer group"
            >
              <Network size={17} className="text-amber-300 group-hover:rotate-12 transition-transform" />
              <span>Lihat di Pohon Keluarga</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAMPILAN ANGGOTA
// ==========================================
function AnggotaTab({ 
  members, 
  isAdmin, 
  showToast,
  onNavigateTab,
  onFocusInTree,
  onUpdateMember,
  onDeleteMember,
  onReorderMembers
}: { 
  members: Member[]; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
  onNavigateTab?: (tab: 'dash' | 'pohon' | 'anggota' | 'agenda' | 'kas' | 'iuran') => void;
  onFocusInTree?: (target: { memberId?: number; spouseName?: string; name?: string }) => void;
  onUpdateMember?: (updated: Member) => void;
  onDeleteMember?: (id: number) => void;
  onReorderMembers?: (newMembers: Member[]) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState<'all' | number>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Member | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<FamilyRelationTarget | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [draggedMemberId, setDraggedMemberId] = useState<number | null>(null);
  const [dragOverMemberId, setDragOverMemberId] = useState<number | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // 1. Pemetaan generasi setiap anggota secara hierarki silsilah
  const memberGenMap = useMemo(() => {
    const map = new Map<number, number>();
    members.forEach(m => {
      map.set(m.id, getMemberGeneration(m, members));
    });
    return map;
  }, [members]);

  // 2. Daftar generasi yang tersedia di dalam silsilah keluarga
  const availableGenerations = useMemo(() => {
    const gens = new Set<number>();
    gens.add(1);
    members.forEach(m => {
      gens.add(memberGenMap.get(m.id) || 2);
    });
    return Array.from(gens).sort((a, b) => a - b);
  }, [members, memberGenMap]);

  // 3. Jumlah anggota per generasi
  const generationCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    members.forEach(m => {
      const g = memberGenMap.get(m.id) || 2;
      counts[g] = (counts[g] || 0) + 1;
    });
    return counts;
  }, [members, memberGenMap]);

  // 4. Filter berdasarkan pencarian nama/domisili (anggota maupun pasangan)
  const searchFiltered = useMemo(() => {
    return members.filter(m => {
      const q = searchTerm.toLowerCase();
      const matchSelf = m.name.toLowerCase().includes(q) || (m.domicile && m.domicile.toLowerCase().includes(q));
      const spouses = getMemberSpouses(m, members);
      const matchSpouse = spouses.some(s => s.name.toLowerCase().includes(q) || (s.domicile && s.domicile.toLowerCase().includes(q)));
      return matchSelf || matchSpouse;
    });
  }, [members, searchTerm]);

  // 5. Filter berdasarkan pilihan dropdown generasi
  const generationFiltered = useMemo(() => {
    if (selectedGeneration === 'all') return searchFiltered;
    return searchFiltered.filter(m => (memberGenMap.get(m.id) || 2) === selectedGeneration);
  }, [searchFiltered, selectedGeneration, memberGenMap]);

  // 6. Pengelompokan anggota per generasi (untuk tampilan berurutan rapi per generasi)
  const groupedMembers = useMemo(() => {
    if (selectedGeneration !== 'all') {
      return [{
        generation: selectedGeneration,
        info: getGenerationLabel(selectedGeneration),
        items: generationFiltered
      }];
    }

    const groups: Array<{
      generation: number;
      info: ReturnType<typeof getGenerationLabel>;
      items: Member[];
    }> = [];

    availableGenerations.forEach(gen => {
      const items = generationFiltered.filter(m => (memberGenMap.get(m.id) || 2) === gen);
      if (items.length > 0) {
        groups.push({
          generation: gen,
          info: getGenerationLabel(gen),
          items
        });
      }
    });

    return groups;
  }, [generationFiltered, selectedGeneration, availableGenerations, memberGenMap]);

  const handleMoveMember = async (memberId: number, direction: 'up' | 'down') => {
    if (isSavingOrder) return;
    const currentIndex = members.findIndex(m => m.id === memberId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= members.length) return;

    const newMembers = [...members];
    const [moved] = newMembers.splice(currentIndex, 1);
    newMembers.splice(targetIndex, 0, moved);

    const updatedWithOrder = newMembers.map((m, idx) => ({ ...m, order: idx }));
    setIsSavingOrder(true);
    try {
      const promises = updatedWithOrder.map((m, idx) => {
        if (members[idx]?.id !== m.id || m.order !== idx) {
          return setDoc(getDocRef('members', m.id), cleanFirestoreData({ ...m, order: idx }), { merge: true });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
      showToast(`Posisi "${moved.name}" berhasil digeser (${direction === 'up' ? 'ke atas' : 'ke bawah'})!`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'members');
      showToast('Gagal menyimpan urutan posisi anggota', 'error');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDragDrop = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId || isSavingOrder) return;
    const sourceIdx = members.findIndex(m => m.id === sourceId);
    const targetIdx = members.findIndex(m => m.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newMembers = [...members];
    const [moved] = newMembers.splice(sourceIdx, 1);
    newMembers.splice(targetIdx, 0, moved);

    const updatedWithOrder = newMembers.map((m, idx) => ({ ...m, order: idx }));
    setIsSavingOrder(true);
    try {
      const promises = updatedWithOrder.map((m, idx) => {
        return setDoc(getDocRef('members', m.id), cleanFirestoreData({ ...m, order: idx }), { merge: true });
      });
      await Promise.all(promises);
      showToast(`Posisi "${moved.name}" berhasil dipindahkan ke posisi #${targetIdx + 1}!`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'members');
      showToast('Gagal menyimpan urutan posisi anggota', 'error');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const openProfile = (member: Member, isSpouse: boolean = false, spouseObj?: Spouse) => {
    setSelectedTarget({ member, isSpouse, spouseObj });
  };

  const executeDelete = async (id: number) => {
    try {
      onDeleteMember?.(id);
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
      {/* HEADER DAFTAR ANGGOTA */}
      <div className="flex justify-between items-center mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Daftar Anggota</h2>
          <p className="text-[11px] text-gray-500">
            Total {members.length} anggota keluarga terdaftar
          </p>
        </div>
      </div>

      {isAdmin && (
        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }} 
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl shadow-md transition flex justify-center cursor-pointer items-center"
        >
          <Plus size={20} className="mr-2"/> Tambah Anggota
        </button>
      )}

      {/* BANNER MODE ADMIN: PETUNJUK MENGGESER POSISI */}
      {isAdmin && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-base font-black">⇅</span>
            <span className="font-semibold">
              Fitur Geser Posisi: Anda dapat menggeser posisi anggota ke atas (↑) / ke bawah (↓) atau tarik kartu (drag & drop) untuk mengatur susunan anggota.
            </span>
          </div>
          {isSavingOrder && (
            <span className="text-[10px] font-black text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap">
              Menyimpan...
            </span>
          )}
        </div>
      )}
      
      {/* KOTAK PENCARIAN */}
      <div className="relative">
        <Search className="absolute left-3 top-3.5 text-gray-400" size={20} />
        <input 
          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 outline-none focus:border-green-500 font-medium bg-white" 
          placeholder="Cari nama anggota atau pasangan..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')} 
            className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 p-0.5 rounded-full cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* FITUR DROPDOWN & FILTER GENERASI */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-xs border border-gray-200/90 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={15} className="text-emerald-600 flex-shrink-0" />
            <span>Pilih Generasi Silsilah:</span>
          </label>
          <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            {generationFiltered.length} Anggota
          </span>
        </div>

        {/* SELECT DROPDOWN GENERASI */}
        <div className="relative">
          <select
            value={selectedGeneration}
            onChange={(e) => setSelectedGeneration(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="w-full bg-gray-50 hover:bg-gray-100/80 focus:bg-white border-2 border-emerald-300 focus:border-emerald-600 text-gray-800 text-xs sm:text-sm font-bold py-3 px-3.5 rounded-xl outline-none transition shadow-2xs cursor-pointer appearance-none pr-10"
          >
            <option value="all">
              🌐 Semua Generasi (Seluruh {members.length} Anggota Keluarga)
            </option>
            {availableGenerations.map(gen => {
              const info = getGenerationLabel(gen);
              const count = generationCounts[gen] || 0;
              return (
                <option key={gen} value={gen}>
                  {info.icon} {info.title} — {info.subtitle} ({count} Anggota)
                </option>
              );
            })}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-700 font-black text-xs">
            ▼
          </div>
        </div>

        {/* PILLS / QUICK BUTTONS GENERASI */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedGeneration('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              selectedGeneration === 'all'
                ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <span>🌐</span> Semua ({members.length})
          </button>
          {availableGenerations.map(gen => {
            const info = getGenerationLabel(gen);
            const count = generationCounts[gen] || 0;
            const isSelected = selectedGeneration === gen;
            return (
              <button
                key={gen}
                type="button"
                onClick={() => setSelectedGeneration(gen)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-xs'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <span>{info.icon}</span>
                <span>{info.title}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* DAFTAR ANGGOTA DIKELOMPOKKAN PER GENERASI */}
      <div className="space-y-6">
        {groupedMembers.map(group => {
          if (group.items.length === 0) return null;

          return (
            <div key={group.generation} className="space-y-3">
              {/* HEADER SECTION GENERASI */}
              <div className="sticky top-0 z-20 bg-gray-100/95 backdrop-blur-sm py-2 px-1 flex items-center justify-between border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl flex-shrink-0">{group.info.icon}</span>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-gray-800 tracking-wide flex items-center gap-1.5 flex-wrap">
                      <span>{group.info.title}</span>
                      <span className="text-[11px] font-semibold text-gray-500">
                        • {group.info.subtitle}
                      </span>
                    </h3>
                  </div>
                </div>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs flex-shrink-0 ${group.info.badge}`}>
                  {group.items.length} Orang
                </span>
              </div>

              {/* LIST KARTU ANGGOTA DALAM GENERASI INI */}
              <div className="space-y-3.5">
                {group.items.map(member => {
                  const memberSpouses = getMemberSpouses(member, members);
                  const globalIndex = members.findIndex(m => m.id === member.id);
                  const isFirstInGlobal = globalIndex === 0;
                  const isLastInGlobal = globalIndex === members.length - 1;
                  const memberGen = memberGenMap.get(member.id) || 2;
                  const genBadge = getGenerationLabel(memberGen);

                  return (
                    <div 
                      key={member.id} 
                      onDragOver={(e) => {
                        if (isAdmin && draggedMemberId && draggedMemberId !== member.id) {
                          e.preventDefault();
                          if (dragOverMemberId !== member.id) setDragOverMemberId(member.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverMemberId === member.id) setDragOverMemberId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceId = Number(e.dataTransfer.getData('text/plain') || draggedMemberId);
                        setDragOverMemberId(null);
                        setDraggedMemberId(null);
                        if (sourceId && sourceId !== member.id) {
                          handleDragDrop(sourceId, member.id);
                        }
                      }}
                      className={`bg-white p-4 rounded-2xl shadow-sm border transition ${
                        dragOverMemberId === member.id 
                          ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-300' 
                          : 'border-gray-150 hover:shadow-md'
                      } ${draggedMemberId === member.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex gap-3 sm:gap-4 items-start relative z-10">
                        {/* DRAG HANDLE UNTUK ADMIN */}
                        {isAdmin && (
                          <div 
                            draggable={!searchTerm && selectedGeneration === 'all'}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(member.id));
                              setDraggedMemberId(member.id);
                            }}
                            onDragEnd={() => {
                              setDraggedMemberId(null);
                              setDragOverMemberId(null);
                            }}
                            className="flex items-center text-gray-400 hover:text-emerald-700 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-emerald-50 transition self-center flex-shrink-0"
                            title="Tahan & tarik untuk menggeser posisi anggota"
                          >
                            <GripVertical size={20} />
                          </div>
                        )}

                        <div 
                          className={`w-16 h-16 rounded-full border-2 flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-85 transition shadow-sm ${member.gender === 'L' ? 'border-blue-200 bg-blue-50 text-blue-500' : 'border-pink-200 bg-pink-50 text-pink-500'}`} 
                          onClick={() => openProfile(member, false)}
                          title="Lihat profil lengkap"
                        >
                          {member.photo ? <img src={member.photo} className="w-full h-full object-cover" alt={member.name} /> : <Users size={30} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-1">
                             <div className="flex items-center gap-1.5 min-w-0 flex-1">
                               {/* NOMOR URUT POSISI ANGGOTA */}
                               <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100/90 text-emerald-800 border border-emerald-300 flex-shrink-0" title="Nomor urut posisi anggota">
                                 #{globalIndex + 1}
                               </span>
                               <h3 
                                 className="font-bold text-lg text-gray-800 truncate cursor-pointer hover:text-green-700" 
                                 onClick={() => openProfile(member, false)}
                               >
                                 {member.name}
                               </h3>
                             </div>

                             {isAdmin && (
                               <div className="flex items-center gap-1.5 flex-shrink-0">
                                 {/* TOMBOL GESER POSISI KE ATAS & KE BAWAH */}
                                 <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                                   <button 
                                     type="button"
                                     disabled={isFirstInGlobal || isSavingOrder} 
                                     onClick={() => handleMoveMember(member.id, 'up')} 
                                     className="p-1.5 text-gray-700 hover:text-emerald-700 hover:bg-white rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed transition" 
                                     title="Geser posisi ke atas (↑)"
                                   >
                                     <ArrowUp size={14}/>
                                   </button>
                                   <button 
                                     type="button"
                                     disabled={isLastInGlobal || isSavingOrder} 
                                     onClick={() => handleMoveMember(member.id, 'down')} 
                                     className="p-1.5 text-gray-700 hover:text-emerald-700 hover:bg-white rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed transition" 
                                     title="Geser posisi ke bawah (↓)"
                                   >
                                     <ArrowDown size={14}/>
                                   </button>
                                 </div>

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

                          {/* BADGES: GENERASI, STATUS HIDUP/ALM, GENDER */}
                          <div className="mt-1.5 mb-2 flex flex-wrap items-center gap-1.5">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${genBadge.badge}`}>
                              <span>{genBadge.icon}</span>
                              <span>{genBadge.title}</span>
                            </span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${member.isAlive ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>
                              {member.isAlive ? 'HIDUP' : 'ALM'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              {member.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                            </span>
                          </div>

                          <div className="text-[11px] text-gray-600 space-y-1">
                            <p className="truncate">Ortu: <span className="font-semibold text-gray-800">{getMemberParentName(member, members)}</span></p>
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
              </div>
            </div>
          );
        })}

        {generationFiltered.length === 0 && (
          <div className="text-center bg-white p-8 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
            <p className="text-3xl">🔍</p>
            <p className="text-sm font-bold text-gray-700">Tidak ada data anggota ditemukan</p>
            <p className="text-xs text-gray-400">
              {searchTerm 
                ? `Tidak ditemukan nama "${searchTerm}" pada filter yang dipilih.` 
                : 'Belum ada anggota yang terdaftar pada generasi ini.'}
            </p>
            {(searchTerm || selectedGeneration !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setSelectedGeneration('all'); }}
                className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                Reset Filter & Pencarian
              </button>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <ModalFormAnggota 
          member={editingItem} 
          members={members} 
          showToast={showToast} 
          onClose={() => setIsModalOpen(false)} 
          onUpdateMember={onUpdateMember} 
        />
      )}
      {selectedTarget && (
        <ProfilePopupCard 
          initialTarget={selectedTarget} 
          members={members} 
          onClose={() => setSelectedTarget(null)} 
          onNavigateToTree={(target) => {
            onFocusInTree?.({
              memberId: target.member.id,
              spouseName: target.isSpouse ? (target.spouseObj?.name || target.member.spouse) : undefined,
              name: target.isSpouse ? (target.spouseObj?.name || target.member.spouse) : target.member.name
            });
            setSelectedTarget(null);
          }}
        />
      )}
      {itemToDelete !== null && <ConfirmModal title="Hapus Anggota" message="Yakin ingin menghapus anggota ini? Silsilah akan otomatis tersesuaikan dengan aman." onCancel={() => setItemToDelete(null)} onConfirm={() => executeDelete(itemToDelete)} />}
    </div>
  );
}

function ModalFormAnggota({ 
  member, 
  members, 
  showToast, 
  onClose,
  onUpdateMember
}: { 
  member: Member | null; 
  members: Member[]; 
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void;
  onUpdateMember?: (updated: Member) => void;
}) {
  // Mbah Sumadi (1), Istri 1 (2), dan Istri 2 (3) adalah Pemuncak Silsilah
  const isPemuncak = member?.id === 1 || member?.id === 2 || member?.id === 3;

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

  const munasikah = useMemo(() => members.find(m => m.name.toLowerCase().includes('munasikah')), [members]);
  const masripah = useMemo(() => members.find(m => m.name.toLowerCase().includes('masripah')), [members]);

  const munasikahId = munasikah ? munasikah.id : 2;
  const masripahId = masripah ? masripah.id : 3;

  // Pemilihan Orang Tua: default Mbah KH. Sumadi & Mbah Munasikah (Istri 1) untuk anggota baru
  const [selectedParentChoice, setSelectedParentChoice] = useState<string>(() => {
    if (member) {
      if (member.id === 1 || (munasikah && member.id === munasikah.id) || (masripah && member.id === masripah.id) || member.id === 2 || member.id === 3) return '';
      if (member.parentId === munasikahId || member.parentId === 2) return String(munasikahId);
      if (member.parentId === masripahId || member.parentId === 3) return String(masripahId);
      if (member.parentId === 1) {
        return (member.motherId === masripahId || member.branch === 'istri2') ? String(masripahId) : String(munasikahId);
      }
      if (member.parentId) {
        const parentObj = members.find(m => m.id === member.parentId);
        if (parentObj) {
          const sps = getMemberSpouses(parentObj, members);
          if (sps.length > 1) {
            if (member.parentSpouseName) {
              const idx = sps.findIndex(s => s.name.trim().toLowerCase() === member.parentSpouseName?.trim().toLowerCase());
              if (idx !== -1) return `${member.parentId}_${idx}`;
            }
            if (member.spouseIndex !== undefined && member.spouseIndex !== null) {
              return `${member.parentId}_${member.spouseIndex}`;
            }
            return `${member.parentId}_0`;
          }
          if (sps.length === 1) {
            return `${member.parentId}_0`;
          }
          return `${member.parentId}`;
        }
      }
      if (member.branch === 'istri2') return String(masripahId);
      return String(munasikahId);
    }
    return String(munasikahId);
  });

  // Daftar calon orang tua dari silsilah (bukan diri sendiri dan bukan pemuncak 1, 2, 3)
  const eligibleParents = useMemo(() => {
    return members.filter(m => 
      m.id !== formData.id && 
      m.id !== 1 && 
      (!munasikah || m.id !== munasikah.id) &&
      (!masripah || m.id !== masripah.id) &&
      m.id !== 2 && 
      m.id !== 3 && 
      m.relationType !== 'spouse'
    );
  }, [members, formData.id, munasikah, masripah]);

  const munasikahParents = useMemo(() => {
    return eligibleParents.filter(m => getMemberBranch(m, members) === 'istri1');
  }, [eligibleParents, members]);

  const masripahParents = useMemo(() => {
    return eligibleParents.filter(m => getMemberBranch(m, members) === 'istri2');
  }, [eligibleParents, members]);

  // Bangun opsi orang tua untuk setiap cabang (mendukung jika orang tua punya >1 istri, contoh: Masruron)
  const buildParentOptions = (parentList: Member[]) => {
    const options: { value: string; label: string }[] = [];
    parentList.forEach(p => {
      const sps = getMemberSpouses(p, members);
      const icon = p.gender === 'L' ? '👨' : '👩';
      const domText = p.domicile ? ` (${p.domicile})` : '';

      if (sps.length === 0) {
        options.push({
          value: `${p.id}`,
          label: `${icon} ${p.name}${domText}`
        });
      } else if (sps.length === 1) {
        options.push({
          value: `${p.id}_0`,
          label: `${icon} ${p.name} & ${sps[0].name}${domText}`
        });
      } else {
        // LEBIH DARI 1 PASANGAN (CONTOH: MASRURON DENGAN DUA ISTRI: SRI & MAGHFIROH)
        // DITAMPILKAN SEMUA PILIHAN: MASRURON & ISTRI PERTAMA DAN MASRURON & ISTRI KEDUA
        sps.forEach((sp, idx) => {
          const spouseLabel = p.gender === 'L' 
            ? (idx === 0 ? 'Istri Pertama' : idx === 1 ? 'Istri Kedua' : `Istri ke-${idx + 1}`)
            : (idx === 0 ? 'Suami Pertama' : idx === 1 ? 'Suami Kedua' : `Suami ke-${idx + 1}`);
          
          options.push({
            value: `${p.id}_${idx}`,
            label: `${icon} ${p.name} & ${sp.name} (${spouseLabel})${domText}`
          });
        });
      }
    });
    return options;
  };

  const munasikahOptions = useMemo(() => buildParentOptions(munasikahParents), [munasikahParents, members]);
  const masripahOptions = useMemo(() => buildParentOptions(masripahParents), [masripahParents, members]);

  const selectedParentInfo = useMemo(() => {
    if (!selectedParentChoice) return null;
    if (selectedParentChoice === String(munasikahId) || selectedParentChoice === '2' || selectedParentChoice === 'munasikah') {
      return {
        label: `Mbah KH. Sumadi & ${munasikah ? munasikah.name : 'Mbah Munasikah'} (Istri 1)`,
        branch: 'istri1' as const
      };
    }
    if (selectedParentChoice === String(masripahId) || selectedParentChoice === '3' || selectedParentChoice === 'masripah') {
      return {
        label: `Mbah KH. Sumadi & ${masripah ? masripah.name : 'Mbah Masripah'} (Istri 2)`,
        branch: 'istri2' as const
      };
    }
    if (selectedParentChoice.includes('_')) {
      const [pIdStr, sIdxStr] = selectedParentChoice.split('_');
      const p = members.find(m => m.id === Number(pIdStr));
      if (!p) return null;
      const sIdx = Number(sIdxStr);
      const sps = getMemberSpouses(p, members);
      const sp = sps[sIdx];
      const pBranch = getMemberBranch(p, members);
      const spouseLabel = sp 
        ? ` & ${sp.name} (${p.gender === 'L' ? (sIdx === 0 ? 'Istri Pertama' : 'Istri Kedua') : (sIdx === 0 ? 'Suami Pertama' : 'Suami Kedua')})`
        : '';
      return {
        label: `${p.name}${spouseLabel}`,
        branch: pBranch
      };
    }
    const p = members.find(m => m.id === Number(selectedParentChoice));
    if (!p) return null;
    return {
      label: p.name,
      branch: getMemberBranch(p, members)
    };
  }, [selectedParentChoice, members, munasikah, masripah, munasikahId, masripahId]);

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
      
      let parentId: number | null = null;
      let relationType: 'child' | 'spouse' = 'child';
      let spouseOfId: number | null = null;
      let memberBranch: 'istri1' | 'istri2' = 'istri1';
      let motherId: number | null = 2;
      let parentSpouseName: string | undefined = undefined;
      let spouseIndex: number | undefined = undefined;

      if (isPemuncak) {
        parentId = null;
        relationType = member?.id === 1 ? 'child' : 'spouse';
        spouseOfId = member?.id === 1 ? null : 1;
        const isMunasikah = member?.name?.toLowerCase().includes('munasikah') || member?.id === munasikahId;
        memberBranch = isMunasikah ? 'istri1' : 'istri2';
        motherId = isMunasikah ? munasikahId : masripahId;
      } else {
        relationType = 'child';
        spouseOfId = null;

        if (selectedParentChoice === String(munasikahId) || selectedParentChoice === '2' || selectedParentChoice === 'munasikah') {
          parentId = munasikahId;
          motherId = munasikahId;
          memberBranch = 'istri1';
          parentSpouseName = munasikah ? munasikah.name : 'Mbah Munasikah';
          spouseIndex = 0;
        } else if (selectedParentChoice === String(masripahId) || selectedParentChoice === '3' || selectedParentChoice === 'masripah') {
          parentId = masripahId;
          motherId = masripahId;
          memberBranch = 'istri2';
          parentSpouseName = masripah ? masripah.name : 'Mbah Masripah';
          spouseIndex = 1;
        } else if (selectedParentChoice) {
          if (selectedParentChoice.includes('_')) {
            const [pIdStr, sIdxStr] = selectedParentChoice.split('_');
            const pId = Number(pIdStr);
            const sIdx = Number(sIdxStr);
            parentId = pId;
            spouseIndex = sIdx;
            const parentObj = members.find(m => m.id === pId);
            if (parentObj) {
              memberBranch = getMemberBranch(parentObj, members);
              const sps = getMemberSpouses(parentObj, members);
              if (sps[sIdx]) {
                parentSpouseName = sps[sIdx].name;
                motherId = (parentObj.gender === 'P' ? parentObj.id : (sps[sIdx].id && !isNaN(Number(sps[sIdx].id)) ? Number(sps[sIdx].id) : null));
              } else {
                motherId = (parentObj.gender === 'P' ? parentObj.id : null);
              }
            }
          } else {
            const pId = Number(selectedParentChoice);
            parentId = pId;
            const parentObj = members.find(m => m.id === pId);
            if (parentObj) {
              memberBranch = getMemberBranch(parentObj, members);
              motherId = (parentObj.gender === 'P' ? parentObj.id : null);
            }
          }
        } else {
          parentId = munasikahId;
          motherId = munasikahId;
          memberBranch = 'istri1';
        }
      }

      const payload: Member = {
        ...formData as any,
        id, 
        parentId,
        relationType,
        spouseOfId,
        branch: memberBranch,
        motherId,
        parentSpouseName,
        spouseIndex,
        spouses: cleanSpouses,
        // Backward compatibility dengan data pasangan tunggal lama
        spouse: primarySpouse ? primarySpouse.name : '',
        spousePhoto: primarySpouse ? (primarySpouse.photo || '') : '',
        spouseIsAlive: primarySpouse ? (primarySpouse.isAlive ?? true) : true,
        spouseDomicile: primarySpouse ? (primarySpouse.domicile || '') : '',
        spousePhone: primarySpouse ? (primarySpouse.phone || '') : '',
        spouseBirthDate: primarySpouse ? (primarySpouse.birthDate || '') : '',
        spouseDeathDate: primarySpouse ? (primarySpouse.deathDate || '') : '',
        order: member?.order !== undefined ? member.order : (members.length > 0 ? Math.max(...members.map(m => m.order ?? 0)) + 1 : 0)
      };

      onUpdateMember?.(payload as Member);
      await setDoc(getDocRef('members', id), cleanFirestoreData(payload));
      showToast('Data Anggota & Silsilah berhasil disimpan di Firebase', 'success');
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
              {isPemuncak ? 'Edit Profil Pemuncak Silsilah' : member ? 'Edit Anggota Keluarga' : 'Tambah Anggota Keluarga'}
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

            {/* FORM PEMILIHAN ORANG TUA */}
            {isPemuncak ? (
              <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-4 rounded-2xl border-2 border-amber-300 flex items-center gap-3 shadow-xs">
                <span className="text-3xl">👑</span>
                <div>
                  <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wide">Pemuncak Silsilah Keluarga</h3>
                  <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                    {member?.id === 1 
                      ? 'Mbah KH. Sumadi adalah pemuncak silsilah utama (posisi tengah sejajar).' 
                      : (member?.name?.toLowerCase().includes('munasikah') || (munasikah && member?.id === munasikah.id) || member?.id === 2) 
                      ? 'Mbah Munasikah adalah pemuncak silsilah (Istri Pertama, posisi kiri sejajar).' 
                      : 'Mbah Masripah adalah pemuncak silsilah (Istri Kedua, posisi kanan sejajar).'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50/70 p-4 rounded-2xl border-2 border-emerald-200 space-y-3">
                <div>
                  <label className="block text-xs font-black text-emerald-950 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                    <span>Pilih Orang Tua (Ayah / Ibu) *</span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      Otomatis Masuk Silsilah
                    </span>
                  </label>

                  <select
                    value={selectedParentChoice}
                    onChange={(e) => setSelectedParentChoice(e.target.value)}
                    required
                    className="w-full border-2 border-emerald-300 p-3 rounded-xl bg-white text-xs font-bold text-gray-800 outline-none focus:border-emerald-500 shadow-2xs cursor-pointer"
                  >
                    <option value="">-- Pilih Orang Tua dari Silsilah Keluarga --</option>
                    
                    <optgroup label="👑 Generasi 1 (Anak Langsung Mbah KH. Sumadi)">
                      <option value={String(munasikahId)}>
                        🌺 Mbah KH. Sumadi & Mbah Munasikah (Cabang Kiri / Istri 1)
                      </option>
                      <option value={String(masripahId)}>
                        🌸 Mbah KH. Sumadi & Mbah Masripah (Cabang Kanan / Istri 2)
                      </option>
                    </optgroup>

                    {munasikahOptions.length > 0 && (
                      <optgroup label="👨‍👩‍👧 Keturunan Cabang Mbah Munasikah (Istri 1 / Kiri)">
                        {munasikahOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {masripahOptions.length > 0 && (
                      <optgroup label="👨‍👩‍👧 Keturunan Cabang Mbah Masripah (Istri 2 / Kanan)">
                        {masripahOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Keterangan Posisi Otomatis di Pohon Silsilah */}
                  {selectedParentInfo && (
                    <div className="mt-2.5 p-3 rounded-xl bg-white border border-emerald-200 shadow-2xs flex items-start gap-2.5">
                      <span className="text-lg">🌳</span>
                      <div className="text-[11px] text-emerald-950 leading-snug">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>Posisi di Pohon Silsilah:</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-md ${
                            selectedParentInfo.branch === 'istri1' ? 'bg-purple-100 text-purple-800' : 'bg-pink-100 text-pink-800'
                          }`}>
                            {selectedParentInfo.branch === 'istri1' ? 'Cabang Kiri (Mbah Munasikah - Istri 1)' : 'Cabang Kanan (Mbah Masripah - Istri 2)'}
                          </span>
                        </p>
                        <p className="text-emerald-700 text-[10px] mt-0.5 font-medium">
                          Anggota ini otomatis tampil tepat di bawah <strong>{selectedParentInfo.label}</strong> pada menu Pohon Silsilah.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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
function AgendaTab({ 
  agendas, 
  isAdmin, 
  showToast,
  onUpdateAgenda,
  onDeleteAgenda
}: { 
  agendas: Agenda[]; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
  onUpdateAgenda?: (updated: Agenda) => void;
  onDeleteAgenda?: (id: number) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Agenda | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isSoundOn, setIsSoundOn] = useState(() => isAlarmSoundEnabled());
  const [notifStatus, setNotifStatus] = useState(() => getNotificationPermissionStatus());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const executeDelete = async (id: number) => {
    try {
      onDeleteAgenda?.(id);
      await deleteDoc(getDocRef('agendas', id));
      setItemToDelete(null);
      showToast('Agenda berhasil dihapus dari Firebase', 'success');
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, 'agendas');
      showToast('Gagal menghapus agenda', 'error'); 
    }
  };

  const handleToggleSound = () => {
    const next = !isSoundOn;
    setIsSoundOn(next);
    setAlarmSoundEnabled(next);
    showToast(next ? 'Alarm suara agenda diaktifkan 🔔' : 'Alarm suara dinonaktifkan 🔕', 'success');
  };

  const handleTestAudio = async () => {
    setIsTesting(true);
    setTestResult('Membunyikan...');
    try {
      const res = await testAlarmSoundAndNotification();
      setNotifStatus(getNotificationPermissionStatus());
      setTestResult(res.permitted ? 'Berhasil! 🔔' : 'Suara Berbunyi! 🔊');
      showToast('Suara notifikasi agenda berhasil dibunyikan', 'success');
      setTimeout(() => setTestResult(null), 3000);
    } catch {
      setTestResult('Selesai');
      setTimeout(() => setTestResult(null), 2000);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRequestNotif = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
    showToast(granted ? 'Izin notifikasi latar belakang berhasil diaktifkan!' : 'Izin notifikasi belum diizinkan oleh browser', granted ? 'success' : 'error');
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xl font-bold text-gray-800">Agenda Keluarga</h2>
      </div>

      {/* CARD PENGINGAT SUARA & NOTIFIKASI LATAR BELAKANG */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-green-900 text-white p-4 rounded-2xl shadow-sm border border-emerald-600/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-emerald-300">
              <BellRing size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Alarm & Notifikasi Otomatis</h4>
              <p className="text-[11px] text-emerald-200/90 leading-tight mt-0.5">
                Suara lonceng dan notifikasi sistem berbunyi otomatis saat waktu tiba (meskipun aplikasi ditutup).
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-emerald-700/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSound}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isSoundOn 
                  ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40' 
                  : 'bg-white/10 text-gray-300 border border-white/10'
              }`}
            >
              {isSoundOn ? <Volume2 size={14} className="text-emerald-300" /> : <VolumeX size={14} className="text-gray-400" />}
              <span>Alarm Suara: {isSoundOn ? 'Aktif' : 'Mati'}</span>
            </button>

            <button
              onClick={handleTestAudio}
              disabled={isTesting}
              className="px-3 py-1.5 bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/40 text-amber-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bell size={13} className={isTesting ? "animate-bounce" : ""} />
              <span>{testResult || 'Tes Bunyi Alarm'}</span>
            </button>
          </div>

          {notifStatus !== 'granted' ? (
            <button
              onClick={handleRequestNotif}
              className="px-2.5 py-1 text-[11px] font-semibold bg-amber-400 text-emerald-950 rounded-lg shadow-sm hover:bg-amber-300 transition cursor-pointer"
            >
              Aktifkan Izin Latar Belakang
            </button>
          ) : (
            <span className="text-[11px] text-emerald-300 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Izin Notifikasi Aktif
            </span>
          )}
        </div>
      </div>

      {isAdmin && (
        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }} 
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl shadow-md transition flex items-center justify-center cursor-pointer"
        >
          <Plus size={20} className="mr-2" /> Tambah Agenda Baru
        </button>
      )}

      <div className="space-y-3">
        {[...agendas].sort((a,b) => getAgendaTargetTimestamp(a) - getAgendaTargetTimestamp(b)).map(a => (
          <div key={a.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-4 items-start">
            <div className="bg-green-50 border border-green-100 p-2.5 rounded-xl text-center min-w-[64px] h-fit flex-shrink-0">
              <p className="text-[10px] font-black text-green-700 uppercase">{new Date(a.date).toLocaleDateString('id-ID', { month: 'short' })}</p>
              <p className="text-2xl font-black text-green-800 my-0.5">{new Date(a.date).getDate()}</p>
              <span className="text-[9px] font-bold text-gray-500 block truncate">{new Date(a.date).getFullYear()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-800 text-base mb-1 truncate pr-2">{a.title}</h3>
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setEditingItem(a); setIsModalOpen(true); }} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg cursor-pointer hover:bg-blue-100 transition"><Edit2 size={14}/></button>
                    <button onClick={() => setItemToDelete(a.id)} className="text-red-500 bg-red-50 p-1.5 rounded-lg cursor-pointer hover:bg-red-100 transition"><Trash2 size={14}/></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px] text-gray-500">
                <span className="flex items-center gap-1 font-medium bg-gray-100 px-2 py-0.5 rounded-md">
                  <Clock size={11} className="text-green-700" />
                  {a.time ? `${a.time} WIB` : '08:00 WIB'}
                </span>
                <span className="truncate">📍 {a.location}</span>
              </div>
              <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 break-words">{a.desc}</p>
            </div>
          </div>
        ))}
        {agendas.length === 0 && <p className="text-center text-gray-400 py-10 text-sm font-medium">Belum ada agenda keluarga tercatat.</p>}
      </div>
      {isModalOpen && (
        <ModalFormAgenda 
          agenda={editingItem} 
          showToast={showToast} 
          onClose={() => setIsModalOpen(false)} 
          onUpdateAgenda={onUpdateAgenda}
        />
      )}
      {itemToDelete !== null && <ConfirmModal title="Hapus Agenda" message="Apakah Anda yakin ingin menghapus catatan agenda keluarga ini?" onCancel={() => setItemToDelete(null)} onConfirm={() => executeDelete(itemToDelete)} />}
    </div>
  );
}

function ModalFormAgenda({ 
  agenda, 
  showToast, 
  onClose,
  onUpdateAgenda
}: { 
  agenda: Agenda | null; 
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void; 
  onUpdateAgenda?: (updated: Agenda) => void;
}) {
  const [formData, setFormData] = useState<Partial<Agenda>>(agenda || { date: '', time: '08:00', title: '', location: '', desc: '' });
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = agenda ? agenda.id : Date.now();
      const payload = { 
        ...formData, 
        id,
        time: formData.time || '08:00'
      } as Agenda;
      onUpdateAgenda?.(payload);
      await setDoc(getDocRef('agendas', id), cleanFirestoreData(payload));
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
        <div className="bg-green-700 p-4 text-white font-bold text-sm flex items-center justify-between">
          <span>{agenda ? 'Edit Agenda Keluarga' : 'Tambah Agenda Keluarga Baru'}</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition cursor-pointer"><X size={16} /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3.5">
          <div>
            <label className="text-[11px] font-bold text-gray-700 block mb-1">Judul Acara Agenda</label>
            <input placeholder="Contoh: Reuni Akbar Bani KH. Sumadi" required className="w-full border-2 p-2.5 rounded-xl text-sm outline-none focus:border-green-500 font-medium" value={formData.title || ''} onChange={e=>setFormData({...formData, title: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">Tanggal Acara</label>
              <input type="date" required className="w-full border-2 p-2.5 rounded-xl text-sm outline-none focus:border-green-500 font-medium" value={formData.date || ''} onChange={e=>setFormData({...formData, date: e.target.value})} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">Jam Acara (WIB)</label>
              <input type="time" className="w-full border-2 p-2.5 rounded-xl text-sm outline-none focus:border-green-500 font-medium" value={formData.time || '08:00'} onChange={e=>setFormData({...formData, time: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-700 block mb-1">Lokasi Tempat Acara</label>
            <input placeholder="Contoh: Rumah Kediaman Tuban" required className="w-full border-2 p-2.5 rounded-xl text-sm outline-none focus:border-green-500 font-medium" value={formData.location || ''} onChange={e=>setFormData({...formData, location: e.target.value})} />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-700 block mb-1">Keterangan / Deskripsi Acara</label>
            <textarea placeholder="Keterangan susunan acara, dresscode, konsumsi, dll." className="w-full border-2 p-2.5 rounded-xl text-sm resize-none outline-none focus:border-green-500" rows={3} value={formData.desc || ''} onChange={e=>setFormData({...formData, desc: e.target.value})} />
          </div>

          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 flex items-start gap-2">
            <Bell size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <span>Notifikasi alarm suara otomatis dijadwalkan dan berbunyi saat countdown acara tiba di jam yang dipilih.</span>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 cursor-pointer">Batal</button>
            <button type="submit" className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold shadow-md cursor-pointer transition">Simpan Agenda</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KasTab({ 
  kasSessions, 
  legacyTransactions,
  totalKas, 
  formatRupiah, 
  isAdmin, 
  showToast,
  onUpdateKasSession,
  onDeleteKasSession
}: { 
  kasSessions: KasSession[]; 
  legacyTransactions: Transaction[];
  totalKas: number; 
  formatRupiah: (n: number) => string; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
  onUpdateKasSession?: (updated: KasSession) => void;
  onDeleteKasSession?: (id: number) => void;
}) {
  const sortedSessions = useMemo(() => {
    return [...kasSessions].sort(compareKasSessionsDescending);
  }, [kasSessions]);

  const [activeSid, setActiveSid] = useState<number | null>(() => {
    return sortedSessions.length > 0 ? sortedSessions[0].id : null;
  });

  useEffect(() => {
    if ((activeSid === null || !sortedSessions.some(s => s.id === activeSid)) && sortedSessions.length > 0) {
      setActiveSid(sortedSessions[0].id);
    }
  }, [sortedSessions, activeSid]);

  // If no kasSessions yet, fallback to a virtual session with legacyTransactions
  const activeSession: KasSession | null = useMemo(() => {
    if (kasSessions.length > 0) {
      return kasSessions.find(s => s.id === activeSid) || sortedSessions[0] || null;
    }
    if (legacyTransactions.length > 0) {
      return {
        id: 1,
        title: "Kas Utama Keluarga",
        transactions: legacyTransactions
      };
    }
    return null;
  }, [kasSessions, activeSid, sortedSessions, legacyTransactions]);

  const currentTransactions = activeSession?.transactions || [];

  // Hitung pemasukan, pengeluaran, dan saldo bersih lembar ini
  const inTransactions = currentTransactions.filter(t => t.type === 'in');
  const outTransactions = currentTransactions.filter(t => t.type === 'out');

  const totalIn = inTransactions.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalOut = outTransactions.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const saldoLembar = totalIn - totalOut;

  // State Modal & Filter
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewSessOpen, setIsNewSessOpen] = useState(false);
  const [isEditSessOpen, setIsEditSessOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const filteredTransactions = useMemo(() => {
    const sorted = [...currentTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (filterType === 'in') return sorted.filter(t => t.type === 'in');
    if (filterType === 'out') return sorted.filter(t => t.type === 'out');
    return sorted;
  }, [currentTransactions, filterType]);

  const handleDownloadJPEG = async () => {
    setIsDownloading(true);
    const title = activeSession?.title?.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_') || 'Keluarga';
    const filename = `Laporan_Kas_${title}.jpg`;
    await exportElementAsJPEG('kas-download-area', filename, showToast);
    setIsDownloading(false);
  };

  const executeDeleteSession = async (id: number) => {
    try {
      onDeleteKasSession?.(id);
      await deleteDoc(getDocRef('kasSessions', id));
      setActiveSid(null);
      setSessionToDelete(null);
      showToast('Lembar riwayat kas berhasil dihapus dari Firebase', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'kasSessions');
      showToast('Gagal menghapus lembar kas di Firebase', 'error');
    }
  };

  const executeDeleteItem = async (transId: number) => {
    if (!activeSession) return;
    try {
      const newTransactions = activeSession.transactions.filter(x => x.id !== transId);
      const updated = { ...activeSession, transactions: newTransactions };
      onUpdateKasSession?.(updated);
      await setDoc(getDocRef('kasSessions', activeSession.id), cleanFirestoreData(updated));
      setItemToDelete(null);
      showToast('Transaksi berhasil dihapus dari lembar kas', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'kasSessions');
      showToast('Gagal menghapus transaksi', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* HEADER TAB */}
      <div className="flex justify-between items-center mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Kas Keuangan</h2>
          <p className="text-[11px] text-gray-500">Kelola buku riwayat pemasukan & pengeluaran kas</p>
        </div>
        {activeSession && (
          <button 
            onClick={handleDownloadJPEG} 
            disabled={isDownloading} 
            className="bg-green-100 hover:bg-green-200 text-green-800 px-3.5 py-2 rounded-xl font-bold flex items-center text-xs shadow-xs cursor-pointer disabled:opacity-50 transition"
          >
            <Download size={15} className="mr-1.5"/> {isDownloading ? 'Menyimpan...' : 'Unduh JPEG'}
          </button>
        )}
      </div>

      {/* SECTION: PILIH LEMBAR RIWAYAT TRANSAKSI */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/80 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-[10.5px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={14} className="text-green-600" /> Pilih Lembar Riwayat Transaksi:
          </p>
          <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">
            {kasSessions.length || (legacyTransactions.length > 0 ? 1 : 0)} Lembar
          </span>
        </div>

        {kasSessions.length > 0 || legacyTransactions.length > 0 ? (
          <div className="flex items-center gap-2">
            <select 
              className="flex-1 border-2 border-gray-200 focus:border-green-600 p-2.5 sm:p-3 rounded-xl text-xs sm:text-sm font-bold bg-gray-50 text-gray-800 outline-none truncate cursor-pointer transition shadow-2xs" 
              value={activeSession?.id || ''} 
              onChange={e => setActiveSid(Number(e.target.value))}
            >
              {sortedSessions.map(s => (
                <option key={s.id} value={s.id}>
                  📄 {s.title} ({s.transactions?.length || 0} Transaksi)
                </option>
              ))}
              {sortedSessions.length === 0 && (
                <option value={1}>📄 Kas Utama Keluarga ({legacyTransactions.length} Transaksi)</option>
              )}
            </select>
            {isAdmin && activeSession && (
              <div className="flex gap-1.5 border-l pl-2 flex-shrink-0">
                <button 
                  onClick={() => setIsEditSessOpen(true)} 
                  className="p-2.5 sm:p-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl cursor-pointer border border-amber-200 transition" 
                  title="Edit Nama Lembar Kas"
                >
                  <Edit2 size={16}/>
                </button>
                <button 
                  onClick={() => setSessionToDelete(activeSession.id)} 
                  className="p-2.5 sm:p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl cursor-pointer border border-red-200 transition" 
                  title="Hapus Lembar Kas Ini"
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic text-center py-2">Belum ada lembar riwayat transaksi.</p>
        )}

        {isAdmin && (
          <button 
            onClick={() => setIsNewSessOpen(true)} 
            className="w-full text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 text-xs sm:text-sm font-bold py-3 rounded-xl border border-green-200 flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs"
          >
            <FolderPlus size={16}/> Buat Lembar Baru Riwayat Transaksi
          </button>
        )}
      </div>

      {/* CARD 1: TOTAL SALDO KAS LEMBAR INI */}
      <div className="bg-gradient-to-br from-green-600 via-emerald-700 to-green-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col justify-between">
        <div className="flex justify-between items-start z-10">
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase text-green-100/90">
              SALDO KAS BERSIH {activeSession ? `• ${activeSession.title}` : ''}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black break-words mt-1">
              {formatRupiah(saldoLembar)}
            </h2>
          </div>
        </div>
        <p className="text-[10px] text-green-100/80 font-medium mt-2 z-10">
          Sisa saldo kas dari {currentTransactions.length} riwayat transaksi pada lembar ini
        </p>
        <Wallet className="absolute -right-3 -bottom-3 opacity-15 w-28 h-28 pointer-events-none" />
      </div>

      {/* CARD 2 & CARD 3: PEMISAHAN CARD PEMASUKAN DAN PENGELUARAN */}
      <div className="grid grid-cols-2 gap-3">
        {/* CARD PEMASUKAN SENDIRI */}
        <div className="bg-emerald-50/90 border-2 border-emerald-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
              PEMASUKAN (+)
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="my-2 z-10">
            <h3 className="text-lg sm:text-xl font-black text-emerald-700 break-words leading-tight">
              +{formatRupiah(totalIn)}
            </h3>
          </div>
          <p className="text-[10px] font-bold text-emerald-600/90 z-10">
            {inTransactions.length} Transaksi Masuk
          </p>
        </div>

        {/* CARD PENGELUARAN SENDIRI */}
        <div className="bg-rose-50/90 border-2 border-rose-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider">
              PENGELUARAN (-)
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="my-2 z-10">
            <h3 className="text-lg sm:text-xl font-black text-rose-600 break-words leading-tight">
              -{formatRupiah(totalOut)}
            </h3>
          </div>
          <p className="text-[10px] font-bold text-rose-500/90 z-10">
            {outTransactions.length} Transaksi Keluar
          </p>
        </div>
      </div>

      {/* TOMBOL TAMBAH TRANSAKSI */}
      {isAdmin && activeSession && !isDownloading && (
        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }} 
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center shadow-md transition cursor-pointer text-sm"
        >
          <Plus size={18} className="mr-2"/> Tambah Transaksi Kas
        </button>
      )}

      {/* DAFTAR RIWAYAT TRANSAKSI & AREA DOWNLOAD JPEG */}
      {activeSession && (
        <div id="kas-download-area" className="bg-white rounded-2xl shadow-sm border border-gray-200/90 overflow-hidden mt-3">
          {/* HEADER CETAK */}
          <div className="bg-green-700 p-5 text-white text-center">
            <h3 className="font-black text-base sm:text-lg uppercase tracking-widest mb-1">
              LAPORAN KAS KELUARGA
            </h3>
            <div className="inline-block bg-white/20 px-3.5 py-1 rounded-lg text-xs font-bold backdrop-blur-xs border border-white/30">
              {activeSession.title}
            </div>
            <div className="mt-3 pt-3 border-t border-white/20 grid grid-cols-3 text-center text-[10px] sm:text-xs">
              <div>
                <p className="text-green-200 opacity-80">Pemasukan</p>
                <p className="font-black text-green-100 mt-0.5">+{formatRupiah(totalIn)}</p>
              </div>
              <div className="border-x border-white/20">
                <p className="text-rose-200 opacity-80">Pengeluaran</p>
                <p className="font-black text-rose-100 mt-0.5">-{formatRupiah(totalOut)}</p>
              </div>
              <div>
                <p className="text-white opacity-80">Sisa Kas</p>
                <p className="font-black text-white mt-0.5">{formatRupiah(saldoLembar)}</p>
              </div>
            </div>
          </div>

          {/* FILTER TABS (SEMUA, PEMASUKAN, PENGELUARAN) */}
          <div className="flex border-b bg-gray-50/80 p-1.5 gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                filterType === 'all' ? 'bg-white text-gray-800 shadow-xs border border-gray-200' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Semua ({currentTransactions.length})
            </button>
            <button
              onClick={() => setFilterType('in')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 ${
                filterType === 'in' ? 'bg-emerald-50 text-emerald-800 shadow-xs border border-emerald-200' : 'text-emerald-700/70 hover:text-emerald-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Masuk ({inTransactions.length})
            </button>
            <button
              onClick={() => setFilterType('out')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 ${
                filterType === 'out' ? 'bg-rose-50 text-rose-800 shadow-xs border border-rose-200' : 'text-rose-600/70 hover:text-rose-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Keluar ({outTransactions.length})
            </button>
          </div>

          {/* LIST TRANSAKSI */}
          <div className="divide-y divide-gray-100">
            {filteredTransactions.map(t => (
              <div key={t.id} className="p-4 sm:p-5 flex justify-between items-center hover:bg-gray-50/80 transition">
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    t.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {t.type === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs sm:text-sm text-gray-800 truncate">{t.desc}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span>{new Date(t.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase ${
                        t.type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {t.type === 'in' ? 'Pemasukan' : 'Pengeluaran'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-right flex items-center flex-shrink-0">
                  <div className="mr-2 sm:mr-3">
                    <p className={`font-black text-xs sm:text-sm ${t.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'in' ? '+' : '-'}{formatRupiah(t.amount)}
                    </p>
                  </div>
                  {isAdmin && !isDownloading && (
                    <div className="flex gap-1 border-l pl-2 sm:pl-3">
                      <button 
                        onClick={() => { setEditingItem(t); setIsModalOpen(true); }} 
                        className="text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 p-1.5 rounded-lg cursor-pointer transition"
                        title="Edit Transaksi"
                      >
                        <Edit2 size={13}/>
                      </button>
                      <button 
                        onClick={() => setItemToDelete(t.id)} 
                        className="text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 p-1.5 rounded-lg cursor-pointer transition"
                        title="Hapus Transaksi"
                      >
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredTransactions.length === 0 && (
              <p className="p-8 text-center text-gray-400 text-xs font-medium italic">
                {filterType === 'in' ? 'Tidak ada transaksi pemasukan.' : filterType === 'out' ? 'Tidak ada transaksi pengeluaran.' : 'Belum ada catatan riwayat transaksi pada lembar ini.'}
              </p>
            )}
          </div>

          <div className="py-2.5 text-center bg-gray-50 border-t">
            <p className="text-[8px] text-gray-400 uppercase font-black tracking-widest">
              Keluarga Besar KH. SUMADI &bull; by Falah
            </p>
          </div>
        </div>
      )}

      {/* MODAL FORM TAMBAH / EDIT TRANSAKSI KAS */}
      {isModalOpen && activeSession && (
        <ModalFormKas 
          item={editingItem} 
          activeSession={activeSession}
          showToast={showToast} 
          onClose={() => setIsModalOpen(false)} 
          onUpdateKasSession={onUpdateKasSession}
        />
      )}

      {/* MODAL BUAT LEMBAR KAS BARU */}
      {isNewSessOpen && (
        <ModalSess 
          title="" 
          label="Buat Lembar Riwayat Transaksi Baru" 
          onClose={() => setIsNewSessOpen(false)} 
          onSave={async (t) => { 
            try {
              const n: KasSession = { id: Date.now(), title: t, transactions: [] }; 
              onUpdateKasSession?.(n);
              await setDoc(getDocRef('kasSessions', n.id), cleanFirestoreData(n)); 
              setActiveSid(n.id); 
              setIsNewSessOpen(false); 
              showToast(`Lembar transaksi "${t}" berhasil dibuat di Firebase`, 'success'); 
            } catch (err) { 
              handleFirestoreError(err, OperationType.WRITE, 'kasSessions');
              showToast('Gagal membuat lembar transaksi', 'error'); 
            }
          }} 
        />
      )}

      {/* MODAL EDIT NAMA LEMBAR KAS */}
      {isEditSessOpen && activeSession && (
        <ModalSess 
          title={activeSession.title || ''} 
          label="Edit Nama Lembar Riwayat Transaksi" 
          onClose={() => setIsEditSessOpen(false)} 
          onSave={async (t) => { 
            try {
              const updated = { ...activeSession, title: t };
              onUpdateKasSession?.(updated);
              await setDoc(getDocRef('kasSessions', activeSession.id), cleanFirestoreData(updated)); 
              setIsEditSessOpen(false); 
              showToast('Nama lembar transaksi berhasil diubah di Firebase', 'success'); 
            } catch (err) { 
              handleFirestoreError(err, OperationType.WRITE, 'kasSessions');
              showToast('Gagal mengubah nama lembar', 'error'); 
            }
          }} 
        />
      )}

      {/* MODAL KONFIRMASI HAPUS LEMBAR KAS */}
      {sessionToDelete !== null && (
        <ConfirmModal 
          title="Hapus Lembar Riwayat Kas" 
          message="Yakin menghapus seluruh lembar transaksi ini dari Firebase? Semua riwayat pemasukan & pengeluaran di lembar ini akan hilang permanen." 
          onCancel={() => setSessionToDelete(null)} 
          onConfirm={() => executeDeleteSession(sessionToDelete)} 
        />
      )}

      {/* MODAL KONFIRMASI HAPUS BARIS TRANSAKSI */}
      {itemToDelete !== null && (
        <ConfirmModal 
          title="Hapus Catatan Transaksi" 
          message="Yakin ingin menghapus catatan transaksi ini dari lembar kas?" 
          onCancel={() => setItemToDelete(null)} 
          onConfirm={() => executeDeleteItem(itemToDelete)} 
        />
      )}
    </div>
  );
}

function ModalFormKas({ 
  item, 
  activeSession,
  showToast, 
  onClose,
  onUpdateKasSession
}: { 
  item: Transaction | null; 
  activeSession: KasSession;
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void;
  onUpdateKasSession?: (updated: KasSession) => void;
}) {
  const [formData, setFormData] = useState<Partial<Transaction>>(
    item || { 
      date: new Date().toISOString().split('T')[0], 
      type: 'in', 
      amount: '' as any, 
      desc: '' 
    }
  );
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.desc || !formData.amount) {
      showToast('Keterangan dan nominal harus diisi', 'error');
      return;
    }
    try {
      const payload: Transaction = {
        id: item ? item.id : Date.now(),
        date: formData.date || new Date().toISOString().split('T')[0],
        type: formData.type || 'in',
        amount: Number(formData.amount),
        desc: formData.desc.trim()
      };

      let newTransactions: Transaction[];
      if (item) {
        newTransactions = (activeSession.transactions || []).map(x => x.id === item.id ? payload : x);
      } else {
        newTransactions = [...(activeSession.transactions || []), payload];
      }

      const updated = { ...activeSession, transactions: newTransactions };
      onUpdateKasSession?.(updated);
      await setDoc(getDocRef('kasSessions', activeSession.id), cleanFirestoreData(updated));
      showToast('Transaksi kas berhasil disimpan ke Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'kasSessions');
      showToast('Gagal menyimpan ke Firebase', 'error'); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-green-700 to-emerald-700 p-4 text-white font-bold text-sm flex items-center justify-between">
          <span>{item ? 'Edit Transaksi Kas' : 'Catat Transaksi Kas Baru'}</span>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer"><X size={18}/></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="flex bg-gray-100 rounded-xl p-1.5 border shadow-inner">
            <button 
              type="button" 
              onClick={() => setFormData({...formData, type: 'in'})} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                formData.type === 'in' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200' : 'text-gray-500'
              }`}
            >
              <TrendingUp size={14} /> Pemasukan (+)
            </button>
            <button 
              type="button" 
              onClick={() => setFormData({...formData, type: 'out'})} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                formData.type === 'out' ? 'bg-white text-rose-600 shadow-sm border border-rose-200' : 'text-gray-500'
              }`}
            >
              <TrendingDown size={14} /> Pengeluaran (-)
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">Tanggal Transaksi</label>
            <input 
              type="date" 
              required 
              className="w-full border-2 border-gray-200 focus:border-green-600 p-2.5 rounded-xl text-xs font-semibold outline-none bg-gray-50" 
              value={formData.date || ''} 
              onChange={e=>setFormData({...formData, date: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">Nominal (Rp)</label>
            <input 
              type="number" 
              placeholder="Contoh: 500000" 
              required 
              className="w-full border-2 border-gray-200 focus:border-green-600 p-3 rounded-xl text-xl font-black text-gray-900 outline-none" 
              value={formData.amount || ''} 
              onChange={e=>setFormData({...formData, amount: e.target.value as any})} 
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">Keterangan Transaksi</label>
            <input 
              placeholder="Misal: Iuran bulanan dari Pak Budi" 
              required 
              className="w-full border-2 border-gray-200 focus:border-green-600 p-2.5 rounded-xl text-xs font-medium outline-none" 
              value={formData.desc || ''} 
              onChange={e=>setFormData({...formData, desc: e.target.value})} 
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 text-gray-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-100 transition">
              Batal
            </button>
            <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-green-700 transition cursor-pointer">
              Simpan Transaksi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IuranTab({ 
  iuranSessions, 
  members = [],
  formatRupiah, 
  isAdmin, 
  showToast,
  onUpdateIuranSession,
  onDeleteIuranSession
}: { 
  iuranSessions: IuranSession[]; 
  members?: Member[];
  formatRupiah: (n: number) => string; 
  isAdmin: boolean; 
  showToast: (m: string, t?: 'success' | 'error') => void;
  onUpdateIuranSession?: (updated: IuranSession) => void;
  onDeleteIuranSession?: (id: number) => void;
}) {
  const sortedSessions = useMemo(() => {
    return [...iuranSessions].sort(compareIuranSessionsDescending);
  }, [iuranSessions]);
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

  const handleDownload = async () => {
    setIsDownloading(true);
    const title = activeSession?.title?.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_') || 'Keluarga';
    const filename = `Data_Iuran_${title}.jpg`;
    await exportElementAsJPEG('iuran-area', filename, showToast);
    setIsDownloading(false);
  };

  const executeDeleteSession = async (id: number) => {
     try {
       onDeleteIuranSession?.(id);
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
       const updated = { ...activeSession, data: newData };
       onUpdateIuranSession?.(updated);
       await setDoc(getDocRef('iuranSessions', activeSession.id), updated);
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
      
      {isModalOpen && activeSession && (
        <ModalFormIuranItem 
          item={editingItem} 
          activeSession={activeSession} 
          members={members}
          formatRupiah={formatRupiah}
          showToast={showToast} 
          onClose={() => setIsModalOpen(false)} 
          onUpdateIuranSession={onUpdateIuranSession}
        />
      )}
      
      {isNewSessOpen && (
        <ModalSess 
          title="" 
          label="Buat Lembar Data Baru" 
          onClose={() => setIsNewSessOpen(false)} 
          onSave={async (t) => { 
            try {
              const n = { id: Date.now(), title: t, data: [] }; 
              onUpdateIuranSession?.(n);
              await setDoc(getDocRef('iuranSessions', n.id), n); 
              setActiveSid(n.id); 
              setIsNewSessOpen(false); 
              showToast('Lembar baru berhasil disimpan di Firebase', 'success'); 
            } catch (err) { 
              handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
              showToast('Gagal membuat lembar', 'error'); 
            }
          }} 
        />
      )}
      
      {isEditSessOpen && (
        <ModalSess 
          title={activeSession?.title || ''} 
          label="Edit Nama Lembar" 
          onClose={() => setIsEditSessOpen(false)} 
          onSave={async (t) => { 
            if (!activeSession) return;
            try {
              const updated = { ...activeSession, title: t };
              onUpdateIuranSession?.(updated);
              await setDoc(getDocRef('iuranSessions', activeSession.id), updated); 
              setIsEditSessOpen(false); 
              showToast('Nama lembar berhasil diubah di Firebase', 'success'); 
            } catch (err) { 
              handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
              showToast('Gagal mengubah nama', 'error'); 
            }
          }} 
        />
      )}
      
      {sessionToDelete !== null && <ConfirmModal title="Hapus Lembar Iuran" message="Yakin menghapus seluruh lembar data ini dari Firebase? Semua isinya akan hilang permanen." onCancel={() => setSessionToDelete(null)} onConfirm={() => executeDeleteSession(sessionToDelete)} />}
      {itemToDelete !== null && <ConfirmModal title="Hapus Data" message="Hapus baris iuran anggota ini?" onCancel={() => setItemToDelete(null)} onConfirm={() => executeDeleteItem(itemToDelete)} />}
    </div>
  );
}

function ModalFormIuranItem({ 
  item, 
  activeSession, 
  members = [],
  formatRupiah,
  showToast, 
  onClose,
  onUpdateIuranSession
}: { 
  item: IuranRow | null; 
  activeSession: IuranSession; 
  members?: Member[];
  formatRupiah?: (n: number) => string;
  showToast: (m: string, t?: 'success' | 'error') => void; 
  onClose: () => void;
  onUpdateIuranSession?: (updated: IuranSession) => void;
}) {
  const [formData, setFormData] = useState<{ name: string; amount: string | number }>(
    item ? { name: item.name, amount: item.amount } : { name: '', amount: '' }
  );

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedGenFilter, setSelectedGenFilter] = useState<'all' | number>('all');
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Kompilasi seluruh data anggota dan pasangan keluarga untuk pilihan cepat
  const candidates = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      gen: number;
      genLabel: ReturnType<typeof getGenerationLabel>;
      subtitle: string;
      isAlive: boolean;
      gender: 'L' | 'P';
      domicile?: string;
    }> = [];

    const memberMap = new Map<number, Member>();
    members.forEach(m => memberMap.set(m.id, m));

    members.forEach(m => {
      const gen = getMemberGeneration(m, members);
      const genLabel = getGenerationLabel(gen);
      
      let parentDesc = '';
      if (m.parentId) {
        const parent = memberMap.get(m.parentId);
        if (parent) parentDesc = `Anak dari ${parent.name}`;
      } else if (m.branch === 'istri1') {
        parentDesc = 'Cabang Mbah Munasikah';
      } else if (m.branch === 'istri2') {
        parentDesc = 'Cabang Mbah Masripah';
      } else if (gen === 1) {
        parentDesc = 'Pemuncak Silsilah';
      }

      list.push({
        id: `mem-${m.id}`,
        name: m.name,
        gen,
        genLabel,
        subtitle: parentDesc || genLabel.subtitle,
        isAlive: m.isAlive ?? true,
        gender: m.gender || 'L',
        domicile: m.domicile
      });

      // Tambahkan data pasangan terdaftar (jika ada)
      const spouses = getMemberSpouses(m, members);
      spouses.forEach((sp, sIdx) => {
        list.push({
          id: `sp-${m.id}-${sIdx}`,
          name: sp.name,
          gen,
          genLabel,
          subtitle: `Pasangan dari ${m.name}`,
          isAlive: sp.isAlive ?? true,
          gender: m.gender === 'L' ? 'P' : 'L',
          domicile: sp.domicile || m.domicile
        });
      });
    });

    // Urutkan berdasarkan generasi 1, 2, 3, dst, lalu nama
    return list.sort((a, b) => {
      if (a.gen !== b.gen) return a.gen - b.gen;
      return a.name.localeCompare(b.name, 'id');
    });
  }, [members]);

  const availableGens = useMemo(() => {
    const s = new Set<number>();
    candidates.forEach(c => s.add(c.gen));
    return Array.from(s).sort((a, b) => a - b);
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      if (selectedGenFilter !== 'all' && c.gen !== selectedGenFilter) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        (c.domicile && c.domicile.toLowerCase().includes(q))
      );
    });
  }, [candidates, selectedGenFilter, searchFilter]);

  const handleSelectMember = (name: string) => {
    setFormData(prev => ({ ...prev, name }));
    setIsPickerOpen(false);
    // Otomatis arahkan fokus ke input nominal
    setTimeout(() => {
      amountInputRef.current?.focus();
    }, 100);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Nama anggota tidak boleh kosong', 'error');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      showToast('Nominal iuran harus diisi', 'error');
      return;
    }

    try {
      const payload: IuranRow = { 
        id: item ? item.id : Date.now(), 
        name: formData.name.trim(), 
        amount: Number(formData.amount) 
      };
      let newData: IuranRow[];
      if (item) newData = activeSession.data.map(x => x.id === item.id ? payload : x);
      else newData = [...activeSession.data, payload];
      
      const updated = { ...activeSession, data: newData };
      onUpdateIuranSession?.(updated);
      await setDoc(getDocRef('iuranSessions', activeSession.id), updated);
      showToast('Data iuran berhasil disimpan di Firebase', 'success');
      onClose();
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, 'iuranSessions');
      showToast('Gagal menyimpan iuran', 'error'); 
    }
  };

  const quickAmounts = [25000, 50000, 100000, 200000, 500000];

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER MODAL */}
        <div className="bg-gradient-to-r from-green-700 to-emerald-700 p-4 text-white font-bold text-sm flex items-center justify-between shadow-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wallet size={18} />
            <span>{item ? 'Edit Baris Iuran' : 'Catat Iuran Baru'}</span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* FORM BODY */}
        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* FIELD 1: NAMA ANGGOTA DENGAN POPUP / DROPDOWN SEMUA DATA */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <Users size={14} className="text-green-700" />
                <span>Nama Anggota Keluarga</span>
              </label>
              <button
                type="button"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className="text-[11px] font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-0.5 rounded-full transition flex items-center gap-1 cursor-pointer"
              >
                <span>{isPickerOpen ? 'Tutup Daftar' : `Pilih dari ${candidates.length} Anggota`}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isPickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* INPUT FIELD NAMA ANGGOTA */}
            <div className="relative">
              <input 
                placeholder="Klik di sini untuk memilih nama anggota..." 
                required 
                className="w-full border-2 border-gray-200 focus:border-green-600 hover:border-green-400 p-3 pr-10 rounded-2xl text-sm outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white transition cursor-pointer" 
                value={formData.name} 
                onClick={() => setIsPickerOpen(true)}
                onFocus={() => setIsPickerOpen(true)}
                onChange={e => {
                  setFormData({ ...formData, name: e.target.value });
                  setSearchFilter(e.target.value);
                }} 
                autoFocus 
              />
              <button
                type="button"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-700 cursor-pointer p-1"
                title="Buka daftar nama anggota"
              >
                <ChevronDown size={18} className={`transition-transform duration-200 ${isPickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* DAFTAR PILIHAN ANGGOTA (MUNCUL KETIKA ADMIN KLIK NAMA ANGGOTA) */}
            {isPickerOpen && (
              <div className="mt-2.5 bg-gray-50 border-2 border-green-500/40 rounded-2xl p-3 shadow-lg space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                    <Sparkles size={14} className="text-amber-500" />
                    <span>Pilih Anggota ({filteredCandidates.length} tersedia):</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(false)}
                    className="text-[10px] font-bold text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                  >
                    Tutup ✕
                  </button>
                </div>

                {/* SEARCH INPUT DALAM PICKER */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Ketik untuk memfilter nama..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:border-green-600 font-semibold"
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* FILTER GENERASI PILLS */}
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[10.5px]">
                  <button
                    type="button"
                    onClick={() => setSelectedGenFilter('all')}
                    className={`px-2 py-0.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedGenFilter === 'all' 
                        ? 'bg-green-700 text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    Semua ({candidates.length})
                  </button>
                  {availableGens.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGenFilter(g)}
                      className={`px-2 py-0.5 rounded-lg font-bold whitespace-nowrap transition cursor-pointer ${
                        selectedGenFilter === g 
                          ? 'bg-green-700 text-white' 
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      Gen {g}
                    </button>
                  ))}
                </div>

                {/* DAFTAR ROSTER ANGGOTA (BISA DIKLIK LANGSUNG) */}
                <div className="max-h-52 overflow-y-auto space-y-1 divide-y divide-gray-100 pr-1">
                  {filteredCandidates.map(c => {
                    const isSelected = formData.name.trim().toLowerCase() === c.name.trim().toLowerCase();
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectMember(c.name)}
                        className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition ${
                          isSelected 
                            ? 'bg-green-100/90 border border-green-400 text-green-900' 
                            : 'hover:bg-white bg-white/70 hover:shadow-2xs text-gray-800'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs">{c.gender === 'L' ? '👤' : '🧕'}</span>
                            <span className="text-xs font-bold truncate">{c.name}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full border ${c.genLabel.badge}`}>
                              {c.genLabel.icon} Gen {c.gen}
                            </span>
                            {!c.isAlive && (
                              <span className="text-[8.5px] bg-gray-200 text-gray-600 px-1 py-0.2 rounded font-semibold">
                                Almarhum
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            {c.subtitle} {c.domicile ? `• ${c.domicile}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="flex-shrink-0 text-green-700">
                            <Check size={16} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredCandidates.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400 space-y-1">
                      <p>Tidak ada nama anggota cocok dengan pencarian.</p>
                      {searchFilter && (
                        <button
                          type="button"
                          onClick={() => handleSelectMember(searchFilter)}
                          className="text-[11px] font-bold text-green-700 bg-green-100 px-3 py-1 rounded-lg hover:bg-green-200 transition mt-1 cursor-pointer"
                        >
                          Gunakan "{searchFilter}" sebagai nama kustom
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-1 border-t flex justify-between items-center text-[10.5px] text-gray-500">
                  <span>💡 Klik salah satu nama di atas untuk memilih</span>
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(false)}
                    className="font-bold text-green-700 hover:underline cursor-pointer"
                  >
                    Selesai Memilih
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FIELD 2: NOMINAL (RP) */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
              <span>Nominal Iuran (Rp)</span>
              {formData.amount && Number(formData.amount) > 0 && (
                <span className="text-green-700 font-extrabold text-xs">
                  {formatRupiah ? formatRupiah(Number(formData.amount)) : `Rp ${Number(formData.amount).toLocaleString('id-ID')}`}
                </span>
              )}
            </label>
            <input 
              ref={amountInputRef}
              type="number" 
              placeholder="Contoh: 100000" 
              required 
              min="1000"
              step="1000"
              className="w-full border-2 border-gray-200 focus:border-green-600 p-3 rounded-2xl text-xl font-black text-green-700 outline-none transition bg-white" 
              value={formData.amount} 
              onChange={e=>setFormData({...formData, amount: e.target.value})} 
            />

            {/* QUICK AMOUNT CHIPS */}
            <div className="flex gap-1.5 flex-wrap mt-2">
              <span className="text-[10px] font-bold text-gray-400 self-center mr-0.5">Pilihan Cepat:</span>
              {quickAmounts.map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: amt.toString() }))}
                  className={`text-[10.5px] font-bold px-2.5 py-1 rounded-xl border transition cursor-pointer ${
                    Number(formData.amount) === amt
                      ? 'bg-green-700 text-white border-green-700 shadow-xs'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                  }`}
                >
                  {formatRupiah ? formatRupiah(amt) : `Rp ${amt.toLocaleString('id-ID')}`}
                </button>
              ))}
            </div>
          </div>

          {/* TOMBOL AKSI */}
          <div className="flex gap-3 pt-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3 border-2 border-gray-200 hover:bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm cursor-pointer transition"
            >
              Batal
            </button>
            <button 
              type="submit" 
              className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white rounded-2xl font-bold text-sm shadow-md hover:shadow-lg cursor-pointer transition active:scale-[0.98]"
            >
              Simpan Data
            </button>
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

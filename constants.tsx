
import { Teacher, ClassLevel, Section } from './types';

export const SCHOOL_NAME = "SACRED HEART SCHOOL";
export const SCHOOL_SUBTITLE = "(Affiliated to CBSE, New Delhi, upto +2 Level)";
export const ADMIN_EMAIL = "admin@sacredheartkoderma.org";
export const PORTAL_LINK = "https://syllabuscompiler-ruddy.vercel.app/";

/** 
 * HARDCODED BACKEND: Set this to your deployed Google Apps Script URL.
 * This ensures new devices automatically connect without manual setup.
 */
export const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbwyU9YV_eW3J_r3p2jGz_v2G_J5J2_z5J2_z5J2/exec"; 

export const SCHOOL_LOGO_URL = "logo.png"; 

export const ALL_CLASSES: ClassLevel[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const ALL_SECTIONS: Section[] = ['A', 'B', 'C', 'D'];

export const CLASS_STYLES: Record<string, { bg: string, text: string }> = {
  'DEFAULT': { bg: 'bg-blue-600', text: 'text-blue-600' },
  'I': { bg: 'bg-emerald-600', text: 'text-emerald-600' },
  'II': { bg: 'bg-teal-600', text: 'text-teal-600' },
  'III': { bg: 'bg-cyan-600', text: 'text-cyan-600' },
  'IV': { bg: 'bg-sky-600', text: 'text-sky-600' },
  'V': { bg: 'bg-blue-600', text: 'text-blue-600' },
  'VI': { bg: 'bg-indigo-600', text: 'text-indigo-600' },
  'VII': { bg: 'bg-purple-600', text: 'text-purple-600' },
  'VIII': { bg: 'bg-fuchsia-600', text: 'text-fuchsia-600' },
  'IX': { bg: 'bg-pink-600', text: 'text-pink-600' },
  'X': { bg: 'bg-rose-600', text: 'text-rose-600' },
  'XI': { bg: 'bg-orange-600', text: 'text-orange-600' },
  'XII': { bg: 'bg-red-600', text: 'text-red-600' }
};

export const getWhatsAppLink = (phone: string | undefined, message: string) => {
  if (!phone) return null;
  let cleanNumber = phone.replace(/\D/g, '');
  if (cleanNumber.length === 10) {
    cleanNumber = '91' + cleanNumber;
  }
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
};

export const getCurrentWeekMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
};

export const getNextWeekMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const daysUntilNextMonday = (1 - day + 7) % 7 || 7;
  const nextMonday = new Date(d.setDate(d.getDate() + daysUntilNextMonday));
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday.toISOString().split('T')[0];
};

export const INITIAL_TEACHERS: Teacher[] = [
  { 
    id: 'kishor-kunal', 
    email: 'kunal2959@gmail.com', 
    name: 'Kishor Kunal', 
    whatsapp: '9852963971',
    isClassTeacher: { classLevel: 'V', section: 'A' },
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'Computer' },
      { classLevel: 'V', section: 'B', subject: 'Computer' }
    ] 
  }
];

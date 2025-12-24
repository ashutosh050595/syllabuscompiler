
import { Teacher, ClassLevel, Section } from './types';

export const SCHOOL_NAME = "SACRED HEART SCHOOL";
export const SCHOOL_SUBTITLE = "(Affiliated to CBSE, New Delhi, upto +2 Level)";
export const ADMIN_EMAIL = "admin@sacredheartkoderma.org";
export const PORTAL_LINK = "https://syllabuscompiler-ruddy.vercel.app/";

/** 
 * HARDCODED BACKEND: Set this to your deployed Google Apps Script URL.
 * This ensures new devices automatically connect without manual setup.
 */
export const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbymQppLkpZrIdBylwYaI-HTB8WfeDqLrOpZeMy1qtoTvRwh9iBIcdCYCy4xtvfyCmo3Kg/exec"; 

export const SCHOOL_LOGO_URL = "logo.png"; 

// Storage Keys
export const OFFLINE_SUBMISSIONS_KEY = 'sh_offline_submissions_v3';
export const SUBMISSION_RETRY_KEY = 'sh_submission_retry_v2';

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
      { classLevel: 'VI', section: 'A', subject: 'Computer' },
      { classLevel: 'VI', section: 'B', subject: 'Computer' },
      { classLevel: 'VI', section: 'C', subject: 'Computer' },
      { classLevel: 'VI', section: 'D', subject: 'Computer' },
      { classLevel: 'V', section: 'A', subject: 'Computer' },
      { classLevel: 'V', section: 'B', subject: 'Computer' },
      { classLevel: 'V', section: 'C', subject: 'Computer' }
    ] 
  },
  { 
    id: 'jude-godwin', 
    email: 'frankgodwin416@gmail.com', 
    name: 'Jude Godwin', 
    whatsapp: '8340203221',
    isClassTeacher: { classLevel: 'VI', section: 'A' },
    assignedClasses: [
      { classLevel: 'VI', section: 'A', subject: 'English' },
      { classLevel: 'VI', section: 'B', subject: 'English' },
      { classLevel: 'V', section: 'A', subject: 'English' },
      { classLevel: 'V', section: 'B', subject: 'English' },
      { classLevel: 'V', section: 'C', subject: 'English' }
    ] 
  },
  { 
    id: 'rajni-bala', 
    email: 'nancyrajni1510@gmail.com', 
    name: 'Rajni Bala', 
    whatsapp: '8709648302',
    isClassTeacher: { classLevel: 'VII', section: 'A' },
    assignedClasses: [
      { classLevel: 'VI', section: 'C', subject: 'English' },
      { classLevel: 'VII', section: 'A', subject: 'English' },
      { classLevel: 'VII', section: 'B', subject: 'English' },
      { classLevel: 'VII', section: 'C', subject: 'English' },
      { classLevel: 'VII', section: 'D', subject: 'English' }
    ] 
  },
  { 
    id: 'rahul-kumar', 
    email: 'rahul.kkq@gmail.com', 
    name: 'Rahul Kumar', 
    whatsapp: '8340370475',
    isClassTeacher: { classLevel: 'VI', section: 'D' },
    assignedClasses: [
      { classLevel: 'VI', section: 'D', subject: 'English' },
      { classLevel: 'VI', section: 'A', subject: 'Social Science' },
      { classLevel: 'VI', section: 'B', subject: 'Social Science' },
      { classLevel: 'VI', section: 'C', subject: 'Social Science' },
      { classLevel: 'VI', section: 'D', subject: 'Social Science' }
    ] 
  },
  { 
    id: 'renu-kumari', 
    email: '69191@sacredheartkoderma.org', 
    name: 'Renu Kumari', 
    whatsapp: '8340227030',
    isClassTeacher: { classLevel: 'V', section: 'C' },
    assignedClasses: [
      { classLevel: 'VI', section: 'A', subject: 'Hindi' },
      { classLevel: 'VI', section: 'B', subject: 'Hindi' },
      { classLevel: 'V', section: 'A', subject: 'Hindi' },
      { classLevel: 'V', section: 'B', subject: 'Hindi' },
      { classLevel: 'V', section: 'C', subject: 'Hindi' }
    ] 
  },
  { 
    id: 'manoj-singh', 
    email: 'ms3020998@gmail.com', 
    name: 'Manoj Kumar Singh', 
    whatsapp: '7739566755',
    isClassTeacher: { classLevel: 'VI', section: 'C' },
    assignedClasses: [
      { classLevel: 'VI', section: 'C', subject: 'Hindi' },
      { classLevel: 'VI', section: 'D', subject: 'Hindi' },
      { classLevel: 'VII', section: 'A', subject: 'Hindi' },
      { classLevel: 'VII', section: 'B', subject: 'Hindi' },
      { classLevel: 'VII', section: 'C', subject: 'Hindi' },
      { classLevel: 'VII', section: 'D', subject: 'Hindi' }
    ] 
  },
  { 
    id: 'ramesh-kunj', 
    email: 'rameshkunj6311@gmail.com', 
    name: 'Ramesh Kunj', 
    whatsapp: '6202915575',
    assignedClasses: [
      { classLevel: 'VI', section: 'A', subject: 'Mathematics' },
      { classLevel: 'VI', section: 'B', subject: 'Mathematics' },
      { classLevel: 'VI', section: 'D', subject: 'Mathematics' }
    ] 
  },
  { 
    id: 'radha-singh', 
    email: 'radhasingh1223@gmail.com', 
    name: 'Radha Singh', 
    whatsapp: '8709081170',
    isClassTeacher: { classLevel: 'V', section: 'B' },
    assignedClasses: [
      { classLevel: 'VI', section: 'C', subject: 'Mathematics' },
      { classLevel: 'V', section: 'A', subject: 'EVS' },
      { classLevel: 'V', section: 'B', subject: 'EVS' },
      { classLevel: 'V', section: 'C', subject: 'EVS' }
    ] 
  },
  { 
    id: 'sumit-shaw', 
    email: '10674690@cbsedigitaledu.in', 
    name: 'Sumit Shaw', 
    whatsapp: '7908682112',
    isClassTeacher: { classLevel: 'VII', section: 'B' },
    assignedClasses: [
      { classLevel: 'VI', section: 'A', subject: 'Science' },
      { classLevel: 'VI', section: 'B', subject: 'Science' },
      { classLevel: 'VI', section: 'C', subject: 'Science' },
      { classLevel: 'VI', section: 'D', subject: 'Science' },
      { classLevel: 'VII', section: 'A', subject: 'Science' },
      { classLevel: 'VII', section: 'B', subject: 'Science' }
    ] 
  },
  { 
    id: 'sanjay-kumar', 
    email: 'sanjaykumar.shs@gmail.com', 
    name: 'Sanjay Kumar', 
    whatsapp: '9204434436',
    assignedClasses: [
      { classLevel: 'VI', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'D', subject: 'Sanskrit' },
      { classLevel: 'V', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'V', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'V', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'D', subject: 'Sanskrit' }
    ] 
  },
  { 
    id: 'neha-kumari', 
    email: 'nehajmt81@gmail.com', 
    name: 'Neha Kumari', 
    whatsapp: '7667260558',
    isClassTeacher: { classLevel: 'VI', section: 'B' },
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'Mathematics' },
      { classLevel: 'V', section: 'B', subject: 'Mathematics' },
      { classLevel: 'V', section: 'C', subject: 'Mathematics' }
    ] 
  },
  { 
    id: 'ashutosh-gautam', 
    email: 'gautam663@gmail.com', 
    name: 'Ashutosh Kumar Gautam', 
    whatsapp: '7004743875',
    assignedClasses: [
      { classLevel: 'VII', section: 'A', subject: 'Computer' },
      { classLevel: 'VII', section: 'B', subject: 'Computer' },
      { classLevel: 'VII', section: 'C', subject: 'Computer' },
      { classLevel: 'VII', section: 'D', subject: 'Computer' }
    ] 
  },
  { 
    id: 'sujeet-pratap', 
    email: 'sujeetpratapsingh65908@gmail.com', 
    name: 'Sujeet Pratap Singh', 
    whatsapp: '7667892143',
    isClassTeacher: { classLevel: 'VII', section: 'D' },
    assignedClasses: [
      { classLevel: 'VII', section: 'A', subject: 'Mathematics' },
      { classLevel: 'VII', section: 'B', subject: 'Mathematics' },
      { classLevel: 'VII', section: 'C', subject: 'Mathematics' },
      { classLevel: 'VII', section: 'D', subject: 'Mathematics' },
      { classLevel: 'VII', section: 'C', subject: 'Science' },
      { classLevel: 'VII', section: 'D', subject: 'Science' }
    ] 
  },
  { 
    id: 'anmol-ratan', 
    email: 'anmolratan80@gmail.com', 
    name: 'Anmol Ratan', 
    whatsapp: '7091203535',
    isClassTeacher: { classLevel: 'VII', section: 'C' },
    assignedClasses: [
      { classLevel: 'VII', section: 'A', subject: 'Social Science' },
      { classLevel: 'VII', section: 'B', subject: 'Social Science' },
      { classLevel: 'VII', section: 'C', subject: 'Social Science' },
      { classLevel: 'VII', section: 'D', subject: 'Social Science' }
    ] 
  }
];

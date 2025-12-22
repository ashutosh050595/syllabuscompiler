
import { Teacher, ClassLevel } from './types';

export const SCHOOL_NAME = "SACRED HEART SCHOOL";
export const SCHOOL_SUBTITLE = "(Affiliated to CBSE, New Delhi, upto +2 Level)";
export const ADMIN_EMAIL = "admin@sacredheartkoderma.org";
export const PORTAL_LINK = "https://syllabuscompiler-ruddy.vercel.app/";

// UPDATE THIS LINE: Change "logo.png" to your actual filename or an absolute URL
export const SCHOOL_LOGO_URL = "logo.png"; 

export const CLASS_STYLES: Record<ClassLevel, { bg: string, text: string }> = {
  'V': { bg: 'bg-blue-600', text: 'text-blue-600' },
  'VI': { bg: 'bg-indigo-600', text: 'text-indigo-600' },
  'VII': { bg: 'bg-purple-600', text: 'text-purple-600' }
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
      { classLevel: 'V', section: 'B', subject: 'Computer' },
      { classLevel: 'V', section: 'C', subject: 'Computer' },
      { classLevel: 'VI', section: 'A', subject: 'Computer' },
      { classLevel: 'VI', section: 'B', subject: 'Computer' },
      { classLevel: 'VI', section: 'C', subject: 'Computer' },
      { classLevel: 'VI', section: 'D', subject: 'Computer' }
    ] 
  },
  { 
    id: 'radha-singh', 
    email: 'radhasingh1223@gmail.com', 
    name: 'Radha Singh', 
    whatsapp: '8709081170',
    isClassTeacher: { classLevel: 'V', section: 'B' },
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'EVS' },
      { classLevel: 'V', section: 'B', subject: 'EVS' },
      { classLevel: 'V', section: 'C', subject: 'EVS' },
      { classLevel: 'VI', section: 'C', subject: 'Mathematics' }
    ] 
  },
  { 
    id: 'renu-kumari', 
    email: '69191@sacredheartkoderma.org', 
    name: 'Renu Kumari', 
    whatsapp: '8340227030',
    isClassTeacher: { classLevel: 'V', section: 'C' },
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'Hindi' },
      { classLevel: 'V', section: 'B', subject: 'Hindi' },
      { classLevel: 'V', section: 'C', subject: 'Hindi' },
      { classLevel: 'VI', section: 'A', subject: 'Hindi' },
      { classLevel: 'VI', section: 'B', subject: 'Hindi' }
    ] 
  },
  { 
    id: 'jude-godwin', 
    email: 'frankgodwin416@gmail.com', 
    name: 'Jude Godwin', 
    whatsapp: '8340203221',
    isClassTeacher: { classLevel: 'VI', section: 'A' },
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'English' },
      { classLevel: 'V', section: 'B', subject: 'English' },
      { classLevel: 'V', section: 'C', subject: 'English' },
      { classLevel: 'VI', section: 'A', subject: 'English' },
      { classLevel: 'VI', section: 'B', subject: 'English' }
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
    id: 'manoj-kumar', 
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
      // Fixed extra curly brace
      { classLevel: 'VII', section: 'D', subject: 'English' }
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
  },
  {
    id: 'sanjay-kumar',
    email: 'sanjaykumar@sacredheartkoderma.org',
    name: 'Sanjay Kumar',
    whatsapp: '9204434436',
    assignedClasses: [
      { classLevel: 'V', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'V', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'V', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VI', section: 'D', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'A', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'B', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'C', subject: 'Sanskrit' },
      { classLevel: 'VII', section: 'D', subject: 'Sanskrit' }
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
    id: 'ashutosh-gautam',
    email: 'GAUTAM663@gmail.com',
    name: 'Ashutosh Kumar Gautam',
    whatsapp: '7004743875',
    assignedClasses: [
      { classLevel: 'VII', section: 'A', subject: 'Computer' },
      { classLevel: 'VII', section: 'B', subject: 'Computer' },
      { classLevel: 'VII', section: 'C', subject: 'Computer' },
      // Fixed extra curly brace
      { classLevel: 'VII', section: 'D', subject: 'Computer' }
    ]
  }
];

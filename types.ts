
export type ClassLevel = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX' | 'X' | 'XI' | 'XII';
export type Section = 'A' | 'B' | 'C' | 'D';

export interface AssignedClass {
  classLevel: ClassLevel;
  section: Section;
  subject: string;
}

export interface Teacher {
  id: string;
  email: string;
  name: string;
  whatsapp?: string; // WhatsApp phone number
  assignedClasses: AssignedClass[];
  isClassTeacher?: {
    classLevel: ClassLevel;
    section: Section;
  };
}

export interface ClassPlan {
  classLevel: ClassLevel;
  section: Section;
  subject: string;
  chapterName: string;
  topics: string;
  homework: string;
}

export interface WeeklySubmission {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  weekStarting: string; // ISO date of Monday
  plans: ClassPlan[];
  timestamp: string;
}

export interface Submission {
  subject: string;
  teacherName: string;
  chapterName: string;
  topics: string;
  homework: string;
  classLevel: ClassLevel;
  section: Section;
}

export interface ClassTeacherInfo {
  name: string;
  email: string;
  classLevel: ClassLevel;
  section: Section;
}

// export interface ResubmitRequest {
//   id: string;
//   teacherId: string;
//   teacherName: string;
//   teacherEmail: string;
//   weekStarting: string;
//   timestamp: string;
//   status: 'pending' | 'approved';
// }
export interface ResubmitRequest {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  weekStarting: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: Date;
  // Add these if you want to track email status
  teacherNotified?: boolean;
  adminNotified?: boolean;
}

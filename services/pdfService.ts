
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Submission, ClassTeacherInfo } from '../types';
import { SCHOOL_NAME, SCHOOL_SUBTITLE, SCHOOL_LOGO_URL } from '../constants';

export const generateSyllabusPDF = (
  submissions: Submission[],
  classTeacher: ClassTeacherInfo,
  dateFrom: string,
  dateTo: string
) => {
  // Requirement 5: Change layout from portrait to landscape
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();

  // Requirement 2: Logo to be place at the top left corner
  try {
    doc.addImage(SCHOOL_LOGO_URL, 'PNG', 15, 10, 25, 25);
  } catch (e) {
    console.warn("Logo failed to load for PDF");
  }

  // Header Section
  // Requirement 1: Font style for School Name (Using Times Bold for formal traditional look)
  doc.setFontSize(26);
  doc.setFont('times', 'bold');
  doc.setTextColor(0, 51, 153); // School Blue
  doc.text(SCHOOL_NAME, pageWidth / 2 + 10, 25, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(SCHOOL_SUBTITLE, pageWidth / 2 + 10, 31, { align: 'center' });

  // Requirement 3: Title - Weekly Syllabus
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('WEEKLY SYLLABUS', pageWidth / 2 + 10, 42, { align: 'center' });

  // Details Bar
  doc.setDrawColor(200, 200, 200);
  doc.line(15, 48, pageWidth - 15, 48);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text(`Week Beginning: ${dateFrom}`, 15, 55);
  doc.text(`Ending On: ${dateTo}`, 100, 55);
  doc.text(`Class: ${classTeacher.classLevel} - ${classTeacher.section}`, 180, 55);
  
  // Requirement 4: In place of In-Charge, write Class Teacher
  doc.text(`Class Teacher: ${classTeacher.name}`, 15, 61);

  // Table Data Preparation
  const tableData = submissions.map(sub => [
    sub.subject.toUpperCase(),
    sub.teacherName,
    sub.chapterName === 'PENDING' ? '-' : sub.chapterName,
    sub.topics === 'PENDING' ? 'Subject Plan Not Submitted' : sub.topics,
    sub.homework === 'PENDING' ? '-' : sub.homework
  ]);

  (doc as any).autoTable({
    startY: 68,
    head: [['SUBJECT', 'FACULTY', 'CHAPTER', 'PLANNED TOPICS', 'HOMEWORK']],
    body: tableData,
    margin: { left: 15, right: 15 },
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      valign: 'top'
    },
    headStyles: {
      fillColor: [0, 51, 153], // Sacred Heart Blue
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' },
      1: { cellWidth: 35 },
      2: { cellWidth: 45 },
      3: { cellWidth: 100 },
      4: { cellWidth: 57 },
    },
    theme: 'grid',
    didDrawPage: (data: any) => {
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text('Sacred Heart School Automation - Academic Management System', 15, footerY);
      doc.text(`Page ${(doc as any).internal.getNumberOfPages()}`, pageWidth - 25, footerY);
    }
  });

  return doc;
};

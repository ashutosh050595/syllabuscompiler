
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
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  try {
    doc.addImage(SCHOOL_LOGO_URL, 'PNG', pageWidth / 2 - 15, 8, 30, 30);
  } catch (e) {
    console.warn("Logo failed to load for PDF");
  }

  // Header Section
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 51, 153); // School Blue
  doc.text(SCHOOL_NAME, pageWidth / 2, 45, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(SCHOOL_SUBTITLE, pageWidth / 2, 50, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('WEEKLY SYLLABUS COMPILATION', pageWidth / 2, 60, { align: 'center' });

  // Details Bar
  doc.setDrawColor(230, 230, 230);
  doc.line(15, 65, pageWidth - 15, 65);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Week Beginning: ${dateFrom}`, 15, 72);
  doc.text(`Ending On: ${dateTo}`, 120, 72);
  doc.text(`Class: ${classTeacher.classLevel} - ${classTeacher.section}`, 15, 78);
  doc.text(`In-Charge: ${classTeacher.name}`, 120, 78);

  // Table Data Preparation
  const tableData = submissions.map(sub => [
    sub.subject.toUpperCase(),
    sub.teacherName,
    sub.chapterName === 'PENDING' ? '-' : sub.chapterName,
    sub.topics === 'PENDING' ? 'Subject Plan Not Submitted' : sub.topics,
    sub.homework === 'PENDING' ? '-' : sub.homework
  ]);

  (doc as any).autoTable({
    startY: 85,
    head: [['SUBJECT', 'FACULTY', 'CHAPTER', 'PLANNED TOPICS', 'HOMEWORK']],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 5,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [0, 51, 153], // Sacred Heart Blue
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 25, fontStyle: 'bold' },
      1: { cellWidth: 25 },
      2: { cellWidth: 35 },
      3: { cellWidth: 65 },
      4: { cellWidth: 35 },
    },
    theme: 'grid',
    didDrawPage: (data: any) => {
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text('Sacred Heart School Automation - Academic Management System', 15, footerY);
      doc.text(`Page ${(doc as any).internal.getNumberOfPages()}`, pageWidth - 25, footerY);
    }
  });

  return doc;
};

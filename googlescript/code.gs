
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER BACKEND
 * Developed for: Sacred Heart Weekly Syllabus Manager
 * Features: 
 * - Auto-header initialization
 * - Auto-folder creation in Google Drive
 * - PDF archival and email delivery
 */

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SHEET_NAME = "Submissions";

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); 

  try {
    ensureEnvironment(); // Automatically setup headers and folders
    
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'SUBMIT_PLAN') {
      return handlePlanSubmission(data);
    } 
    else if (action === 'SEND_WARNINGS') {
      return handleWarningEmails(data);
    } 
    else if (action === 'SEND_COMPILED_PDF') {
      return handlePdfDelivery(data);
    }

    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "Invalid Action" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ensures the Spreadsheet has the correct headers and the Root folder exists in Drive
 */
function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  
  // 1. Setup Sheet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  
  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp", "Week Starting", "Teacher Name", "Teacher Email", 
      "Class", "Section", "Subject", "Chapter", "Topics", "Homework"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setBackground("#003399")
         .setFontColor("#FFFFFF")
         .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // 2. Setup Root Folder in Drive
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (!folders.hasNext()) {
    DriveApp.createFolder(ROOT_FOLDER_NAME);
  }
}

/**
 * Helper to get or create a folder within a parent folder
 */
function getOrCreateSubFolder(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

/**
 * Saves teacher plans to the Google Sheet
 */
function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  data.plans.forEach(function(plan) {
    sheet.appendRow([
      new Date(),
      data.weekStarting,
      data.teacherName,
      data.teacherEmail,
      plan.classLevel,
      plan.section,
      plan.subject,
      plan.chapterName,
      plan.topics,
      plan.homework
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sends reminder emails to teachers
 */
function handleWarningEmails(data) {
  var defaulters = data.defaulters;
  var week = data.weekStarting;
  var isAuto = data.isAuto;

  defaulters.forEach(function(teacher) {
    var subject = "URGENT: Lesson Plan Pending - Sacred Heart School";
    var body = "Dear " + teacher.name + ",\n\n" +
               "This is an " + (isAuto ? "automated " : "") + "reminder from the Academic Office.\n\n" +
               "Our records show that your Weekly Lesson Plan for the week beginning " + week + 
               " has not been submitted yet.\n\n" +
               "Please log in to the Syllabus Manager portal and finalize your submission immediately.\n\n" +
               "Regards,\n" +
               "Admin Office\n" +
               "Sacred Heart School, Koderma";

    GmailApp.sendEmail(teacher.email, subject, body);
  });

  return ContentService.createTextOutput(JSON.stringify({ "result": "success", "count": defaulters.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Receives Base64 PDF, archives it in Drive, and emails it to the Class Teacher
 */
function handlePdfDelivery(data) {
  var base64Data = data.pdfBase64.split(',')[1]; 
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, 'application/pdf', data.filename);

  // 1. Archive in Google Drive
  try {
    var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    var rootFolder = rootFolders.next();
    
    // Create hierarchy: Root > Week > Class Folder
    var weekFolder = getOrCreateSubFolder(rootFolder, "Week of " + (data.weekStarting || "Archive"));
    var classFolder = getOrCreateSubFolder(weekFolder, "Class " + data.className);
    
    // Save file
    classFolder.createFile(blob);
  } catch (err) {
    console.error("Drive Archival Failed: " + err.toString());
  }

  // 2. Email Delivery
  var subject = "Weekly Compiled Syllabus - Class " + data.className;
  var body = "Dear Class Teacher,\n\n" +
             "Please find attached the compiled weekly syllabus for Class " + data.className + 
             " for the week starting " + (data.weekStarting || "") + ".\n\n" +
             "A copy has also been archived in the school's Google Drive storage.\n\n" +
             "Regards,\n" +
             "Academic Automation System\n" +
             "Sacred Heart School";

  GmailApp.sendEmail(data.recipient, subject, body, {
    attachments: [blob]
  });

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

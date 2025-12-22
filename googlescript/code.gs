
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v3.2)
 * 24/7 Autonomous Edition - Professional Communication & Multi-Device Sync
 */

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SUBMISSIONS_SHEET = "Submissions";
const REGISTRY_SHEET = "Registry";
const PORTAL_URL = "https://syllabuscompiler-ruddy.vercel.app/";

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); 

  try {
    ensureEnvironment();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'SUBMIT_PLAN') return handlePlanSubmission(data);
    if (action === 'SYNC_REGISTRY') return handleSyncRegistry(data);
    if (action === 'GET_REGISTRY') return handleGetRegistry();
    if (action === 'SEND_WARNINGS') return handleWarningEmails(data);
    if (action === 'SEND_COMPILED_PDF') return handlePdfDelivery(data);

    return jsonResponse("error", "Invalid Action");
  } catch (error) {
    return jsonResponse("error", error.toString());
  } finally {
    lock.releaseLock();
  }
}

// Added GET handler for simpler device linking if needed, though doPost is preferred
function doGet(e) {
  return handleGetRegistry();
}

function handleGetRegistry() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  if (!sheet) return jsonResponse("error", "Registry not found");
  
  var data = sheet.getDataRange().getValues();
  var teachers = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // Skip empty rows
    teachers.push({
      id: data[i][0],
      name: data[i][1],
      email: data[i][2],
      whatsapp: data[i][3],
      assignedClasses: JSON.parse(data[i][4] || "[]"),
      isClassTeacher: data[i][5] ? JSON.parse(data[i][5]) : undefined
    });
  }
  return jsonResponse("success", { teachers: teachers });
}

function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) {
    var sheet = ss.insertSheet(SUBMISSIONS_SHEET);
    var headers = ["Timestamp", "Week Starting", "Teacher Name", "Teacher Email", "Class", "Section", "Subject", "Chapter", "Topics", "Homework"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#003399").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  if (!ss.getSheetByName(REGISTRY_SHEET)) {
    var reg = ss.insertSheet(REGISTRY_SHEET);
    var regHeaders = ["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"];
    reg.getRange(1, 1, 1, regHeaders.length).setValues([regHeaders]).setBackground("#333333").setFontColor("#FFFFFF");
  }
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (!folders.hasNext()) DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function handleSyncRegistry(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  sheet.clearContents();
  var headers = ["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  data.teachers.forEach(function(t) {
    sheet.appendRow([
      t.id, t.name, t.email, t.whatsapp || "",
      JSON.stringify(t.assignedClasses),
      t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""
    ]);
  });
  return jsonResponse("success", "Registry Synced");
}

function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  data.plans.forEach(function(p) {
    sheet.appendRow([new Date(), data.weekStarting, data.teacherName, data.teacherEmail, p.classLevel, p.section, p.subject, p.chapterName, p.topics, p.homework]);
  });
  return jsonResponse("success");
}

function handleWarningEmails(data) {
  var portalLink = data.portalLink || PORTAL_URL;
  data.defaulters.forEach(function(t) {
    var subject = "[URGENT] Weekly Syllabus Submission Required - " + data.weekStarting;
    var body = "Dear " + t.name + ",\n\n" +
      "This is a formal reminder regarding the submission of your weekly syllabus for the academic week beginning " + data.weekStarting + ". Our records indicate that your submission is currently pending.\n\n" +
      "To ensure timely coordination and curriculum planning, please submit your lesson plan via the official portal:\n" +
      portalLink + "\n\n" +
      "Best Regards,\nCoordinator\nSacred Heart School";

    GmailApp.sendEmail(t.email, subject, body, { name: "Sacred Heart School" });
  });
  return jsonResponse("success");
}

function handlePdfDelivery(data) {
  var decoded = Utilities.base64Decode(data.pdfBase64.split(',')[1]);
  var blob = Utilities.newBlob(decoded, 'application/pdf', data.filename);
  var body = "Dear Faculty Member,\n\nPlease find the attached compiled syllabus report for Class " + data.className + ".\n\nBest Regards,\nCoordinator\nSacred Heart School";
  GmailApp.sendEmail(data.recipient, "[OFFICIAL] Compiled Weekly Syllabus - " + data.className, body, { 
    name: "Sacred Heart School",
    attachments: [blob] 
  });
  return jsonResponse("success");
}

function jsonResponse(res, dataOrMsg) {
  var output = { result: res };
  if (typeof dataOrMsg === 'string') output.message = dataOrMsg;
  else Object.assign(output, dataOrMsg);
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

function getNextMondayStr() {
  var d = new Date();
  var diff = (1 - d.getDay() + 7) % 7 || 7;
  var nextMon = new Date(d.setDate(d.getDate() + diff));
  return nextMon.toISOString().split('T')[0];
}

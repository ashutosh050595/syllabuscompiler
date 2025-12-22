
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v3)
 * 24/7 Autonomous Edition
 * 
 * SETUP INSTRUCTIONS:
 * 1. Deploy as Web App (Anyone access).
 * 2. In the Apps Script Editor, go to "Triggers" (Clock icon on left).
 * 3. Add a trigger for 'automatedDailyCheck' -> Time-driven -> Hour timer -> Every hour.
 *    OR run 'setupTriggers()' once from the editor to automate this.
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
    if (action === 'SEND_WARNINGS') return handleWarningEmails(data);
    if (action === 'SEND_COMPILED_PDF') return handlePdfDelivery(data);

    return jsonResponse("error", "Invalid Action");
  } catch (error) {
    return jsonResponse("error", error.toString());
  } finally {
    lock.releaseLock();
  }
}

function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Ensure Submissions sheet
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) {
    var sheet = ss.insertSheet(SUBMISSIONS_SHEET);
    var headers = ["Timestamp", "Week Starting", "Teacher Name", "Teacher Email", "Class", "Section", "Subject", "Chapter", "Topics", "Homework"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#003399").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  // Ensure Registry sheet
  if (!ss.getSheetByName(REGISTRY_SHEET)) {
    var reg = ss.insertSheet(REGISTRY_SHEET);
    var regHeaders = ["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"];
    reg.getRange(1, 1, 1, regHeaders.length).setValues([regHeaders]).setBackground("#333333").setFontColor("#FFFFFF");
  }
  // Ensure Folder
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

/**
 * SERVER-SIDE SCHEDULER
 * This function should be triggered every hour via Apps Script Triggers.
 */
function automatedDailyCheck() {
  var now = new Date();
  var day = now.getDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
  var hour = now.getHours();
  
  // 1. Thursday, Friday, Saturday at 2:00 PM: Send Defaulter Reminders
  if ([4, 5, 6].includes(day) && hour === 14) {
    processServerSideReminders();
  }
  
  // 2. Saturday at 9:00 PM: Compile and Email all Class Reports
  if (day === 6 && hour === 21) {
    processServerSideCompilation();
  }
}

function processServerSideReminders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registry = ss.getSheetByName(REGISTRY_SHEET).getDataRange().getValues();
  var submissions = ss.getSheetByName(SUBMISSIONS_SHEET).getDataRange().getValues();
  var nextMonday = getNextMondayStr();
  
  var submittedEmails = new Set();
  for (var i = 1; i < submissions.length; i++) {
    if (submissions[i][1] === nextMonday) submittedEmails.add(submissions[i][3]);
  }
  
  var defaulters = [];
  for (var j = 1; j < registry.length; j++) {
    var email = registry[j][2];
    if (!submittedEmails.has(email)) {
      defaulters.push({ name: registry[j][1], email: email });
    }
  }
  
  if (defaulters.length > 0) {
    handleWarningEmails({ defaulters: defaulters, weekStarting: nextMonday, isAuto: true, portalLink: PORTAL_URL });
  }
}

function processServerSideCompilation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registry = ss.getSheetByName(REGISTRY_SHEET).getDataRange().getValues();
  var submissions = ss.getSheetByName(SUBMISSIONS_SHEET).getDataRange().getValues();
  var week = getNextMondayStr();
  
  // Group 1: Identify all unique classes (V-A, VI-B, etc)
  var classTeachers = [];
  for (var i = 1; i < registry.length; i++) {
    if (registry[i][5]) {
      classTeachers.push({
        name: registry[i][1],
        email: registry[i][2],
        info: JSON.parse(registry[i][5])
      });
    }
  }
  
  classTeachers.forEach(function(ct) {
    var cls = ct.info.classLevel;
    var sec = ct.info.section;
    
    // Filter submissions for this specific class
    var classPlans = [];
    for (var k = 1; k < submissions.length; k++) {
      if (submissions[k][1] === week && submissions[k][4] === cls && submissions[k][5] === sec) {
        classPlans.push({
          subject: submissions[k][6],
          teacherName: submissions[k][2],
          chapter: submissions[k][7],
          topics: submissions[k][8],
          homework: submissions[k][9]
        });
      }
    }
    
    if (classPlans.length > 0) {
      generateAndSendCloudPdf(ct, classPlans, week);
    }
  });
}

function generateAndSendCloudPdf(ct, plans, week) {
  var html = "<html><body style='font-family: Arial, sans-serif; padding: 20px;'>" +
    "<h1 style='color: #003399; text-align: center; margin: 0;'>SACRED HEART SCHOOL</h1>" +
    "<h3 style='text-align: center; color: #666; margin: 5px 0;'>WEEKLY SYLLABUS REPORT</h3>" +
    "<hr/>" +
    "<p><b>Class:</b> " + ct.info.classLevel + "-" + ct.info.section + " &nbsp;&nbsp; <b>Week Starting:</b> " + week + "</p>" +
    "<p><b>Class Teacher:</b> " + ct.name + "</p>" +
    "<table border='1' style='width: 100%; border-collapse: collapse; margin-top: 20px;'>" +
    "<tr style='background: #003399; color: white;'><th>Subject</th><th>Faculty</th><th>Chapter</th><th>Topics</th><th>Homework</th></tr>";
    
  plans.forEach(function(p) {
    html += "<tr><td style='padding: 8px;'>" + p.subject + "</td>" +
            "<td style='padding: 8px;'>" + p.teacherName + "</td>" +
            "<td style='padding: 8px;'>" + p.chapter + "</td>" +
            "<td style='padding: 8px; font-size: 11px;'>" + p.topics + "</td>" +
            "<td style='padding: 8px; font-size: 11px;'>" + p.homework + "</td></tr>";
  });
  
  html += "</table><p style='font-size: 10px; color: #999; margin-top: 30px;'>Cloud Generated Academic Report - Sacred Heart School Automation</p></body></html>";
  
  var blob = Utilities.newBlob(html, "text/html", "Report.html");
  var pdf = blob.getAs("application/pdf").setName("Syllabus_" + ct.info.classLevel + ct.info.section + "_" + week + ".pdf");
  
  // Archive in Drive
  var folder = DriveApp.getFoldersByName(ROOT_FOLDER_NAME).next();
  folder.createFile(pdf);
  
  // Send Email
  GmailApp.sendEmail(ct.email, "AUTOGENERATED: Weekly Syllabus - Class " + ct.info.classLevel + "-" + ct.info.section, 
    "Dear Class Teacher,\n\nPlease find the autogenerated weekly syllabus attached.\n\nRegards,\nSHS Cloud System", {
    attachments: [pdf]
  });
}

function handleWarningEmails(data) {
  data.defaulters.forEach(function(t) {
    GmailApp.sendEmail(t.email, "URGENT: Lesson Plan Pending", 
      "Dear " + t.name + ",\n\nYour lesson plan for week " + data.weekStarting + " is pending.\n\nSubmit here: " + (data.portalLink || PORTAL_URL));
  });
  return jsonResponse("success");
}

function handlePdfDelivery(data) {
  var decoded = Utilities.base64Decode(data.pdfBase64.split(',')[1]);
  var blob = Utilities.newBlob(decoded, 'application/pdf', data.filename);
  GmailApp.sendEmail(data.recipient, "Syllabus Report", "Report attached.", { attachments: [blob] });
  return jsonResponse("success");
}

function jsonResponse(res, msg) {
  return ContentService.createTextOutput(JSON.stringify({ result: res, message: msg || "" })).setMimeType(ContentService.MimeType.JSON);
}

function getNextMondayStr() {
  var d = new Date();
  var day = d.getDay();
  var diff = (1 - day + 7) % 7 || 7;
  var nextMon = new Date(d.setDate(d.getDate() + diff));
  return nextMon.toISOString().split('T')[0];
}

/** Utility to setup triggers via code - Run this ONCE manually in editor */
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('automatedDailyCheck').timeBased().everyHours(1).create();
}

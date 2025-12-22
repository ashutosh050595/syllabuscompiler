
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v3.5)
 * Professional Communication & Multi-Device Sync
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
    if (action === 'REQUEST_RESUBMIT') return handleResubmitRequest(data);
    if (action === 'APPROVE_RESUBMIT') return handleResubmitApproval(data);

    return jsonResponse("error", "Invalid Action");
  } catch (error) {
    return jsonResponse("error", error.toString());
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return handleGetRegistry();
}

function handleGetRegistry() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  if (!sheet) return jsonResponse("error", "Registry not found");
  
  var data = sheet.getDataRange().getValues();
  var teachers = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
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

function handleResubmitRequest(data) {
  // Logic to notify admin can be added here (e.g., logging to a hidden sheet or email)
  return jsonResponse("success", "Request Logged");
}

function handleResubmitApproval(data) {
  var subject = "Permission Granted: Weekly Syllabus Resubmission - " + data.weekStarting;
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear " + data.teacherName + ",</p>" +
    "<p>Your request for resubmitting the lesson plan for the week <b>" + data.weekStarting + "</b> has been <b>APPROVED</b> by the administrator.</p>" +
    "<p>Your previous submission has been cleared. You can now log into the portal and submit your updated syllabus details:</p>" +
    "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #003399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Open Syllabus Portal</a></p>" +
    "<p>Please ensure the updated plan is synchronized as soon as possible.</p>" +
    "<br><p>Best Regards,</p>" +
    "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
    "</div>";

  GmailApp.sendEmail(data.teacherEmail, subject, "", {
    name: "Sacred Heart School",
    htmlBody: htmlBody
  });
  
  // Optional: Code to actually delete rows from Submissions sheet matching email & week starting
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] === data.weekStarting && rows[i][3].toLowerCase() === data.teacherEmail.toLowerCase()) {
      sheet.deleteRow(i + 1);
    }
  }

  return jsonResponse("success", "Approval Sent & Data Cleared");
}

function handleWarningEmails(data) {
  var portalLink = data.portalLink || PORTAL_URL;
  data.defaulters.forEach(function(t) {
    var subject = "[URGENT] Academic Submission Required - Week: " + data.weekStarting;
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + t.name + ",</p>" +
      "<p>This is a formal reminder regarding the <b>Weekly Syllabus Submission</b> for the academic period beginning <b>" + data.weekStarting + "</b>.</p>" +
      "<p>Our records indicate that your lesson plans for this period have not yet been synchronized with the central registry. To ensure seamless academic coordination, please finalize your submission via the portal:</p>" +
      "<p style='text-align: center;'><a href='" + portalLink + "' style='background: #003399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Open Syllabus Portal</a></p>" +
      "<p>Your cooperation in maintaining academic timelines is highly appreciated.</p>" +
      "<br><p>Best Regards,</p>" +
      "<p><b>Coordinator</b><br>Sacred Heart School</p>" +
      "</div>";

    GmailApp.sendEmail(t.email, subject, "", {
      name: "Sacred Heart School",
      htmlBody: htmlBody
    });
  });
  return jsonResponse("success");
}

function handlePdfDelivery(data) {
  var decoded = Utilities.base64Decode(data.pdfBase64.split(',')[1]);
  var blob = Utilities.newBlob(decoded, 'application/pdf', data.filename);
  
  var subject = "[OFFICIAL] Compiled Weekly Syllabus - Class " + data.className;
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear Faculty,</p>" +
    "<p>Please find the attached <b>Official Compiled Syllabus Report</b> for <b>Class " + data.className + "</b> for the upcoming academic week.</p>" +
    "<p>This document consolidates all subject plans for your reference and records. Should there be any discrepancies, please coordinate with the respective department heads immediately.</p>" +
    "<p>Access the live dashboard here: <a href='" + PORTAL_URL + "'>Syllabus Portal</a></p>" +
    "<br><p>Best Regards,</p>" +
    "<p><b>Coordinator</b><br>Sacred Heart School</p>" +
    "</div>";

  GmailApp.sendEmail(data.recipient, subject, "", { 
    name: "Sacred Heart School",
    htmlBody: htmlBody,
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

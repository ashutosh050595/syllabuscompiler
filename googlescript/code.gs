
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v4.4)
 * 
 * IMPORTANT:
 * 1. Paste this entire code into your Google Apps Script editor.
 * 2. Save the project.
 * 3. Run the function 'setupTriggers' ONCE manually from the toolbar.
 * 4. Deploy as Web App -> Execute as: Me -> Who can access: Anyone.
 */

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SUBMISSIONS_SHEET = "Submissions";
const REGISTRY_SHEET = "Registry";
const REQUESTS_SHEET = "Requests";
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
    if (action === 'RESET_SUBMISSION') return handleResetSubmission(data);

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

// ==========================================
// AUTOMATION TRIGGERS (Run 'setupTriggers' once manually)
// ==========================================

function setupTriggers() {
  ensureEnvironment();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  ScriptApp.newTrigger('autoCheckAndSendWarnings')
      .timeBased()
      .everyDays(1)
      .atHour(14)
      .create();

  ScriptApp.newTrigger('autoSendCompilations')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SATURDAY)
      .atHour(21)
      .create();
      
  console.log("Triggers setup complete. Sheets checked/created.");
}

function getNextMondayDate() {
  var d = new Date();
  var day = d.getDay();
  var diff = (7 - day + 1) % 7;
  if (diff === 0) diff = 7;
  var nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return Utilities.formatDate(nextMon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function autoCheckAndSendWarnings() {
  var today = new Date();
  var day = today.getDay(); 
  if (day !== 4 && day !== 5 && day !== 6) return;

  var nextWeekMonday = getNextMondayDate();
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  var regData = regSheet.getDataRange().getValues();
  var subData = subSheet.getDataRange().getValues();
  
  var submittedEmails = [];
  for (var i = 1; i < subData.length; i++) {
    if (subData[i][1] === nextWeekMonday) {
      submittedEmails.push(String(subData[i][3]).toLowerCase().trim());
    }
  }
  
  for (var i = 1; i < regData.length; i++) {
    var name = regData[i][1];
    var email = String(regData[i][2]).toLowerCase().trim();
    if (email && submittedEmails.indexOf(email) === -1) {
      sendWarningEmail(name, regData[i][2], nextWeekMonday);
    }
  }
}

function sendWarningEmail(name, email, weekStarting) {
    var subject = "[URGENT] Automated Reminder: Syllabus Submission Due";
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + name + ",</p>" +
      "<p>This is an automated system reminder.</p>" +
      "<p>The syllabus plan for the upcoming week commencing <b>" + weekStarting + "</b> is pending submission.</p>" +
      "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #d32f2f; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Submit Now</a></p>" +
      "</div>";

    GmailApp.sendEmail(email, subject, "", { name: "Sacred Heart School", htmlBody: htmlBody });
}

function autoSendCompilations() {
  var nextWeekMonday = getNextMondayDate();
  var startDate = new Date(nextWeekMonday);
  var endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 5);
  var endDateStr = Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var weekRange = nextWeekMonday + " to " + endDateStr;
  
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  var regData = regSheet.getDataRange().getValues();
  var subData = subSheet.getDataRange().getValues();
  
  var submissions = [];
  for (var i = 1; i < subData.length; i++) {
    if (subData[i][1] === nextWeekMonday) {
      submissions.push({
        classLevel: subData[i][4],
        section: subData[i][5],
        subject: subData[i][6],
        teacherName: subData[i][2],
        chapter: subData[i][7],
        topics: subData[i][8],
        homework: subData[i][9]
      });
    }
  }

  for (var i = 1; i < regData.length; i++) {
    var teacherName = regData[i][1];
    var teacherEmail = regData[i][2];
    var classTeacherJson = regData[i][5];

    if (classTeacherJson) {
      try {
        var ctInfo = JSON.parse(classTeacherJson);
        var targetClass = ctInfo.classLevel;
        var targetSection = ctInfo.section;
        var classPlans = submissions.filter(function(s) {
          return s.classLevel == targetClass && s.section == targetSection;
        });

        if (classPlans.length > 0) {
          var pdfBlob = createSyllabusPDF(targetClass, targetSection, weekRange, teacherName, classPlans);
          var fileName = "Class_" + targetClass + "_" + targetSection + "_" + nextWeekMonday + ".pdf";
          pdfBlob.setName(fileName);
          var file = folder.createFile(pdfBlob);
          var fileUrl = file.getUrl();
          sendFormalCompilationEmail(teacherName, teacherEmail, targetClass, targetSection, weekRange, fileUrl, pdfBlob, fileName);
        }
      } catch (e) { console.error(e); }
    }
  }
}

function createSyllabusPDF(cls, sec, weekRange, teacherName, plans) {
  var html = "<html><body style='font-family: Arial, sans-serif; padding: 20px;'>";
  html += "<div style='text-align: center; margin-bottom: 20px;'><h1 style='color: #003399;'>SACRED HEART SCHOOL</h1><h2 style='text-decoration: underline;'>WEEKLY SYLLABUS REPORT</h2></div>";
  html += "<p><b>Week:</b> " + weekRange + " | <b>Class:</b> " + cls + " - " + sec + " | <b>Class Teacher:</b> " + teacherName + "</p>";
  html += "<table style='width: 100%; border-collapse: collapse; border: 1px solid #000;'>";
  html += "<tr style='background-color: #003399; color: white;'><th>SUBJECT</th><th>FACULTY</th><th>CHAPTER</th><th>TOPICS</th><th>HOMEWORK</th></tr>";
  for (var i = 0; i < plans.length; i++) {
    html += "<tr><td style='border:1px solid #000;padding:8px;'>" + plans[i].subject + "</td><td style='border:1px solid #000;padding:8px;'>" + plans[i].teacherName + "</td><td style='border:1px solid #000;padding:8px;'>" + plans[i].chapter + "</td><td style='border:1px solid #000;padding:8px;'>" + plans[i].topics.replace(/\n/g, "<br>") + "</td><td style='border:1px solid #000;padding:8px;'>" + plans[i].homework.replace(/\n/g, "<br>") + "</td></tr>";
  }
  html += "</table></body></html>";
  return Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
}

function sendFormalCompilationEmail(name, email, cls, sec, weekRange, driveLink, pdfBlob, fileName) {
  var subject = "[OFFICIAL] Compiled Weekly Syllabus: Class " + cls + "-" + sec;
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + name + ",</p>" +
      "<p>Please find the attached <b>Official Compiled Syllabus Report</b> for <b>Class " + cls + "-" + sec + "</b> covering the week of <b>" + weekRange + "</b>.</p>" +
      "<p>This document has been archived in the school cloud repository.</p>" +
      "<p><a href='" + driveLink + "' style='background-color: #003399; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold;'>View in Google Drive</a></p>" +
      "<br><p>Best Regards,</p>" +
      "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
      "</div>";
  GmailApp.sendEmail(email, subject, "", { name: "Sacred Heart School", htmlBody: htmlBody, attachments: [pdfBlob] });
}

function handleGetRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var reqSheet = ss.getSheetByName(REQUESTS_SHEET);
  if (!regSheet) return jsonResponse("error", "Registry not found");
  
  var data = regSheet.getDataRange().getValues();
  var teachers = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    teachers.push({
      id: data[i][0], name: data[i][1], email: data[i][2], whatsapp: data[i][3],
      assignedClasses: JSON.parse(data[i][4] || "[]"), isClassTeacher: data[i][5] ? JSON.parse(data[i][5]) : undefined
    });
  }
  var requests = [];
  if (reqSheet) {
    var reqData = reqSheet.getDataRange().getValues();
    for (var i = 1; i < reqData.length; i++) {
      if (!reqData[i][0]) continue;
      var week = reqData[i][4];
      if (week instanceof Date) week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      requests.push({
        id: reqData[i][0], teacherId: reqData[i][1], teacherName: reqData[i][2], teacherEmail: reqData[i][3],
        weekStarting: week, timestamp: reqData[i][5], status: reqData[i][6]
      });
    }
  }
  return jsonResponse("success", { teachers: teachers, requests: requests });
}

function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) {
    var sheet = ss.insertSheet(SUBMISSIONS_SHEET);
    sheet.appendRow(["Timestamp", "Week Starting", "Teacher Name", "Teacher Email", "Class", "Section", "Subject", "Chapter", "Topics", "Homework"]);
  }
  if (!ss.getSheetByName(REGISTRY_SHEET)) {
    var reg = ss.insertSheet(REGISTRY_SHEET);
    reg.appendRow(["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"]);
  }
  if (!ss.getSheetByName(REQUESTS_SHEET)) {
    var reqSheet = ss.insertSheet(REQUESTS_SHEET);
    reqSheet.appendRow(["ID", "Teacher ID", "Name", "Email", "Week Starting", "Timestamp", "Status"]);
  }
}

function handleSyncRegistry(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  sheet.clearContents();
  sheet.appendRow(["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"]);
  data.teachers.forEach(function(t) {
    sheet.appendRow([t.id, t.name, t.email, t.whatsapp || "", JSON.stringify(t.assignedClasses), t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""]);
  });
  return jsonResponse("success", "Registry Synced");
}

function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  data.plans.forEach(function(p) {
    sheet.appendRow([new Date(), data.weekStarting, data.teacherName, data.teacherEmail, p.classLevel, p.section, p.subject, p.chapterName, p.topics, p.homework]);
  });
  
  // Formal Confirmation Email
  try {
    var startDate = new Date(data.weekStarting);
    var endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 5); 
    var dateToStr = endDate.toISOString().split('T')[0];

    var subject = "[OFFICIAL] Confirmation: Weekly Syllabus Submission Received";
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + data.teacherName + ",</p>" +
      "<p>This message is to confirm that your lesson plan for the week of <b>" + data.weekStarting + "</b> to <b>" + dateToStr + "</b> has been successfully recorded in the central database.</p>" +
      "<p><b>Subjects Recorded:</b></p><ul>";

    var uniqueSubjects = [];
    var seen = {};
    data.plans.forEach(function(p) {
      var key = "Class " + p.classLevel + "-" + p.section + " (" + p.subject + ")";
      if (!seen[key]) {
        uniqueSubjects.push("<li>" + key + "</li>");
        seen[key] = true;
      }
    });
    
    htmlBody += uniqueSubjects.join("") + "</ul>" +
      "<p>Thank you for your timely contribution to the academic planning process.</p>" +
      "<br><p>Best Regards,</p>" +
      "<p><b>Academic Coordinator</b><br>Sacred Heart School</p>" +
      "</div>";

    GmailApp.sendEmail(data.teacherEmail, subject, "", {
      name: "Sacred Heart School",
      htmlBody: htmlBody
    });
  } catch (e) { console.error(e); }

  return jsonResponse("success");
}

function handleResubmitRequest(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  sheet.appendRow([data.id, data.teacherId, data.teacherName, data.teacherEmail, data.weekStarting, data.timestamp, data.status]);
  return jsonResponse("success", "Request Logged in Cloud");
}

function handleResubmitApproval(data) {
  var reqSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (reqSheet) {
    var reqRows = reqSheet.getDataRange().getValues();
    for (var i = 1; i < reqRows.length; i++) {
      var rowId = reqRows[i][0];
      var rowEmail = reqRows[i][3];
      var rowWeek = reqRows[i][4];
      if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      
      var match = false;
      if (data.requestId && rowId === data.requestId) match = true;
      else if (rowEmail === data.teacherEmail && rowWeek === data.weekStarting && reqRows[i][6] === 'pending') match = true;

      if (match) {
        reqSheet.getRange(i + 1, 7).setValue('approved');
        break;
      }
    }
  }
  
  // Reuse deletion logic
  handleResetSubmission(data, true); 
  
  // Formal Approval Email
  var subject = "[APPROVED] Permission to Resubmit Weekly Syllabus";
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear " + data.teacherName + ",</p>" +
    "<p>We wish to inform you that your request to modify the syllabus submission for the week commencing <b>" + data.weekStarting + "</b> has been <b>GRANTED</b> by the administration.</p>" +
    "<p>Your previous submission has been cleared from the registry. You may now access the portal to submit the updated lesson plan.</p>" +
    "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #003399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Access Portal</a></p>" +
    "<br><p>Best Regards,</p>" +
    "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
    "</div>";

  GmailApp.sendEmail(data.teacherEmail, subject, "", { name: "Sacred Heart School", htmlBody: htmlBody });

  return jsonResponse("success", "Approval Sent");
}

function handleResetSubmission(data, skipEmail) {
  // data needs: weekStarting, teacherEmail
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowWeek = rows[i][1];
    if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (rowWeek === data.weekStarting && rows[i][3].toLowerCase() === data.teacherEmail.toLowerCase()) {
      sheet.deleteRow(i + 1);
    }
  }
  
  // Formal Forced Reset Email (Only if not called from Approval flow)
  if (!skipEmail) {
     try {
       var subject = "[ALERT] Administrative Reset of Syllabus Submission";
       var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
          "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
          "<p>Dear " + data.teacherName + ",</p>" +
          "<p>We wish to inform you that your syllabus submission for the week of <b>" + data.weekStarting + "</b> has been reset by the administrative office due to necessary updates or correction requirements.</p>" +
          "<p>Please log in to the faculty portal and submit your lesson plan again at your earliest convenience.</p>" +
          "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #d32f2f; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Resubmit Plan</a></p>" +
          "<br><p>Best Regards,</p>" +
          "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
          "</div>";
          
       GmailApp.sendEmail(data.teacherEmail, subject, "", { name: "Sacred Heart School", htmlBody: htmlBody });
     } catch(e) { console.error(e); }
  }
  return jsonResponse("success");
}

function jsonResponse(res, dataOrMsg) {
  var output = { result: res };
  if (typeof dataOrMsg === 'string') output.message = dataOrMsg;
  else Object.assign(output, dataOrMsg);
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}


/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v5.1)
 * 
 * INSTRUCTIONS:
 * 1. Paste this code.
 * 2. Save.
 * 3. Run 'setupTriggers' once.
 * 4. Deploy > Manage Deployments > Edit > New Version > Deploy.
 */

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SUBMISSIONS_SHEET = "Submissions";
const REGISTRY_SHEET = "Registry";
const REQUESTS_SHEET = "Requests";
const PORTAL_URL = "https://syllabuscompiler-ruddy.vercel.app/";

function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT).setHeaders(headers);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for other processes to finish.
  lock.tryLock(30000);

  try {
    ensureEnvironment();
    
    var data;
    try {
      // 1. Try parsing postData.contents (standard JSON payload)
      if (e.postData && e.postData.contents) {
        data = JSON.parse(e.postData.contents);
      } 
      // 2. Fallback: sometimes no-cors sends data as a key in parameters if using x-www-form-urlencoded
      else if (e.parameter) {
        // Just in case the whole JSON is keys
        var keys = Object.keys(e.parameter);
        if (keys.length === 1) {
           try { data = JSON.parse(keys[0]); } catch(e){}
        }
      }
      
      // 3. Fallback: if data is still undefined, default to empty
      if (!data) data = {};
      
    } catch (parseErr) {
      return jsonResponse("error", "Failed to parse JSON: " + parseErr.toString());
    }

    var action = data.action;
    var result;

    if (action === 'SUBMIT_PLAN') result = handlePlanSubmission(data);
    else if (action === 'SYNC_REGISTRY') result = handleSyncRegistry(data);
    else if (action === 'GET_REGISTRY') result = handleGetRegistry();
    else if (action === 'SEND_WARNINGS') result = handleWarningEmails(data);
    else if (action === 'SEND_COMPILED_PDF') result = handlePdfDelivery(data);
    else if (action === 'REQUEST_RESUBMIT') result = handleResubmitRequest(data);
    else if (action === 'APPROVE_RESUBMIT') result = handleResubmitApproval(data);
    else if (action === 'RESET_SUBMISSION') result = handleResetSubmission(data);
    else result = jsonResponse("error", "Invalid Action: " + action + " or no data received");

    return result;

  } catch (error) {
    return jsonResponse("error", "Server Error: " + error.toString());
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return handleGetRegistry();
}

// ==========================================
// AUTOMATION TRIGGERS
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
      
  console.log("Triggers setup complete.");
}

function getNextMondayDate() {
  var d = new Date();
  var day = d.getDay();
  var diff = (7 - day + 1) % 7;
  if (diff === 0) diff = 7;
  var nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return Utilities.formatDate(nextMon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ==========================================
// HANDLERS
// ==========================================

function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  // Ensure plans exists and is an array
  if (!data.plans || !Array.isArray(data.plans)) {
    return jsonResponse("error", "No plans provided in payload");
  }

  data.plans.forEach(function(p) {
    sheet.appendRow([
      new Date(), 
      data.weekStarting, 
      data.teacherName, 
      data.teacherEmail, 
      p.classLevel, 
      p.section, 
      p.subject, 
      p.chapterName, 
      p.topics, 
      p.homework
    ]);
  });
  
  // Send Confirmation Email
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
  } catch (e) { console.error("Email failed: " + e.toString()); }

  return jsonResponse("success", "Plans stored successfully");
}

function handleResubmitRequest(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  // Expected columns: ID, Teacher ID, Name, Email, Week Starting, Timestamp, Status
  sheet.appendRow([
    data.id, 
    data.teacherId, 
    data.teacherName, 
    data.teacherEmail, 
    data.weekStarting, 
    data.timestamp, 
    data.status
  ]);
  return jsonResponse("success", "Request Logged");
}

function handleResubmitApproval(data) {
  var reqSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (reqSheet) {
    var reqRows = reqSheet.getDataRange().getValues();
    for (var i = 1; i < reqRows.length; i++) {
      var rowId = reqRows[i][0];
      if (rowId === data.requestId) {
        reqSheet.getRange(i + 1, 7).setValue('approved');
        break;
      }
    }
  }
  
  handleResetSubmission(data, true); 
  
  // Formal Approval Email
  try {
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
  } catch (e) { console.error(e); }

  return jsonResponse("success", "Approval Sent");
}

function handleResetSubmission(data, skipEmail) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  var rowsDeleted = 0;
  // Iterate backwards to delete safely
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowWeek = rows[i][1];
    var rowEmail = rows[i][3];
    if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    // Check if week and email match
    if (String(rowWeek) === String(data.weekStarting) && 
        String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim()) {
      sheet.deleteRow(i + 1);
      rowsDeleted++;
    }
  }
  
  if (!skipEmail) {
     try {
       var subject = "[ALERT] Administrative Reset of Syllabus Submission";
       var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
          "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
          "<p>Dear " + data.teacherName + ",</p>" +
          "<p>We wish to inform you that your syllabus submission for the week of <b>" + data.weekStarting + "</b> has been reset by the administrative office.</p>" +
          "<p>Please log in to the faculty portal and submit your lesson plan again.</p>" +
          "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #d32f2f; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Resubmit Plan</a></p>" +
          "<br><p>Best Regards,</p>" +
          "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
          "</div>";
          
       GmailApp.sendEmail(data.teacherEmail, subject, "", { name: "Sacred Heart School", htmlBody: htmlBody });
     } catch(e) { console.error(e); }
  }
  return jsonResponse("success", "Deleted " + rowsDeleted + " rows");
}

function handleSyncRegistry(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  sheet.clearContents();
  sheet.appendRow(["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"]);
  if(data.teachers && Array.isArray(data.teachers)) {
    data.teachers.forEach(function(t) {
      sheet.appendRow([t.id, t.name, t.email, t.whatsapp || "", JSON.stringify(t.assignedClasses), t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""]);
    });
  }
  return jsonResponse("success", "Registry Synced");
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
    try {
      teachers.push({
        id: data[i][0], 
        name: data[i][1], 
        email: data[i][2], 
        whatsapp: data[i][3],
        assignedClasses: data[i][4] ? JSON.parse(data[i][4]) : [], 
        isClassTeacher: data[i][5] ? JSON.parse(data[i][5]) : undefined
      });
    } catch(e) { console.error("Error parsing row " + i); }
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

function handleWarningEmails(data) {
  var count = 0;
  if (data.defaulters && Array.isArray(data.defaulters)) {
    data.defaulters.forEach(function(d) {
      try {
        sendWarningEmail(d.name, d.email, data.weekStarting);
        count++;
      } catch(e) {}
    });
  }
  return jsonResponse("success", "Sent " + count + " emails");
}

function handlePdfDelivery(data) {
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(data.pdfBase64.split(',')[1]), MimeType.PDF, data.filename);
    
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
        "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
        "<p>Dear Faculty,</p>" +
        "<p>Please find attached the compiled syllabus report for <b>Class " + data.className + "</b> for the week starting <b>" + data.weekStarting + "</b>.</p>" +
        "<br><p><b>Academic Administration</b></p></div>";

    GmailApp.sendEmail(data.recipient, "[OFFICIAL] Syllabus Report: " + data.className, "", {
      htmlBody: htmlBody,
      attachments: [blob],
      name: "Sacred Heart School"
    });
    return jsonResponse("success", "PDF Sent");
  } catch (e) {
    return jsonResponse("error", e.toString());
  }
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

function jsonResponse(res, dataOrMsg) {
  var output = { result: res };
  if (typeof dataOrMsg === 'string') output.message = dataOrMsg;
  else Object.assign(output, dataOrMsg);
  
  // Important for CORS
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({ 
      "Access-Control-Allow-Origin": "*" 
    });
}

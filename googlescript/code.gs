
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v4.2)
 * 
 * IMPORTANT:
 * 1. Paste this entire code into your Google Apps Script editor.
 * 2. Save the project.
 * 3. Run the function 'setupTriggers' ONCE manually from the toolbar.
 *    -> This will create the 'Requests' sheet and fix the missing data issue.
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
  // 1. Initialize Sheets immediately so user sees them
  ensureEnvironment();

  // 2. Clear existing triggers to prevent duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // 3. Warning Emails: Run daily at 2 PM (Logic inside function filters for Thu/Fri/Sat)
  ScriptApp.newTrigger('autoCheckAndSendWarnings')
      .timeBased()
      .everyDays(1)
      .atHour(14)
      .create();

  // 4. Compilation Emails: Run every Saturday at 9 PM
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
  // 0=Sun, 1=Mon...6=Sat
  // Days until next Monday:
  var diff = (7 - day + 1) % 7;
  if (diff === 0) diff = 7;
  
  var nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return Utilities.formatDate(nextMon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function autoCheckAndSendWarnings() {
  var today = new Date();
  var day = today.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

  // Only run on Thursday(4), Friday(5), and Saturday(6)
  if (day !== 4 && day !== 5 && day !== 6) {
    console.log("Skipping warnings. Today is not Thu, Fri, or Sat.");
    return;
  }

  var nextWeekMonday = getNextMondayDate();
  
  // Fetch Data
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  var regData = regSheet.getDataRange().getValues();
  var subData = subSheet.getDataRange().getValues();
  
  // 1. Get Submitted Emails for Next Week
  var submittedEmails = [];
  // Skip header, index 1 is weekStarting, index 3 is email
  for (var i = 1; i < subData.length; i++) {
    if (subData[i][1] === nextWeekMonday) {
      submittedEmails.push(String(subData[i][3]).toLowerCase().trim());
    }
  }
  
  // 2. Check each teacher in registry
  // Skip header, index 1 name, index 2 email
  for (var i = 1; i < regData.length; i++) {
    var name = regData[i][1];
    var email = String(regData[i][2]).toLowerCase().trim();
    
    if (email && submittedEmails.indexOf(email) === -1) {
      sendWarningEmail(name, regData[i][2], nextWeekMonday); // Use original case email for sending
    }
  }
}

function sendWarningEmail(name, email, weekStarting) {
    var subject = "[URGENT] Automated Reminder: Syllabus Submission Due";
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + name + ",</p>" +
      "<p>This is an automated system reminder.</p>" +
      "<p>The syllabus plan for the upcoming week commencing <b>" + weekStarting + "</b> is pending submission. Please ensure you update the registry by end of day today to facilitate the weekly compilation process.</p>" +
      "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #d32f2f; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Submit Now</a></p>" +
      "<br><p>Best Regards,</p>" +
      "<p><b>Coordinator</b><br>Sacred Heart School</p>" +
      "</div>";

    GmailApp.sendEmail(email, subject, "", {
      name: "Sacred Heart School",
      htmlBody: htmlBody
    });
}

function autoSendCompilations() {
  var nextWeekMonday = getNextMondayDate();
  
  // Calculate Week Range (Mon to Sat)
  var startDate = new Date(nextWeekMonday);
  var endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 5);
  var endDateStr = Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var weekRange = nextWeekMonday + " to " + endDateStr;
  
  // Google Drive Setup
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  var regData = regSheet.getDataRange().getValues();
  var subData = subSheet.getDataRange().getValues();
  
  // Parse Submissions
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

  // Iterate Registry to find Class Teachers
  for (var i = 1; i < regData.length; i++) {
    var teacherName = regData[i][1];
    var teacherEmail = regData[i][2];
    var classTeacherJson = regData[i][5];

    if (classTeacherJson) {
      try {
        var ctInfo = JSON.parse(classTeacherJson);
        var targetClass = ctInfo.classLevel;
        var targetSection = ctInfo.section;
        
        // Filter submissions for this class
        var classPlans = submissions.filter(function(s) {
          return s.classLevel == targetClass && s.section == targetSection;
        });

        if (classPlans.length > 0) {
          // 1. Generate PDF
          var pdfBlob = createSyllabusPDF(targetClass, targetSection, weekRange, teacherName, classPlans);
          // Requirement: Attachment pdf name should be like Class_Sec_Weekdate
          var fileName = "Class_" + targetClass + "_" + targetSection + "_" + nextWeekMonday + ".pdf";
          pdfBlob.setName(fileName);
          
          // 2. Save to Drive
          var file = folder.createFile(pdfBlob);
          // Requirement: make changes to store pdf on google drive along with link of the pdf in the attachment
          var fileUrl = file.getUrl();
          
          // 3. Send Email
          sendFormalCompilationEmail(teacherName, teacherEmail, targetClass, targetSection, weekRange, fileUrl, pdfBlob, fileName);
        }
      } catch (e) {
        console.error("Error processing class teacher " + teacherName + ": " + e.toString());
      }
    }
  }
}

function createSyllabusPDF(cls, sec, weekRange, teacherName, plans) {
  var html = "<html><body style='font-family: Arial, sans-serif; padding: 20px;'>";
  html += "<div style='text-align: center; margin-bottom: 20px;'>";
  html += "<h1 style='color: #003399; margin: 0; font-size: 24px;'>SACRED HEART SCHOOL</h1>";
  html += "<p style='margin: 5px 0; font-size: 12px; color: #555;'>(Affiliated to CBSE, New Delhi, upto +2 Level)</p>";
  html += "<h2 style='margin-top: 15px; font-size: 18px; text-decoration: underline;'>WEEKLY SYLLABUS REPORT</h2>";
  html += "</div>";
  
  html += "<div style='margin-bottom: 15px; font-size: 14px;'>";
  html += "<p><b>Week:</b> " + weekRange + "</p>";
  html += "<p><b>Class:</b> " + cls + " - " + sec + "</p>";
  html += "<p><b>Class Teacher:</b> " + teacherName + "</p>";
  html += "</div>";
  
  html += "<table style='width: 100%; border-collapse: collapse; border: 1px solid #000;'>";
  html += "<tr style='background-color: #003399; color: white;'>";
  html += "<th style='border: 1px solid #000; padding: 10px; font-size: 12px;'>SUBJECT</th>";
  html += "<th style='border: 1px solid #000; padding: 10px; font-size: 12px;'>FACULTY</th>";
  html += "<th style='border: 1px solid #000; padding: 10px; font-size: 12px;'>CHAPTER</th>";
  html += "<th style='border: 1px solid #000; padding: 10px; font-size: 12px;'>TOPICS</th>";
  html += "<th style='border: 1px solid #000; padding: 10px; font-size: 12px;'>HOMEWORK</th>";
  html += "</tr>";
  
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i];
    html += "<tr>";
    html += "<td style='border: 1px solid #000; padding: 8px; font-size: 11px; font-weight: bold;'>" + p.subject + "</td>";
    html += "<td style='border: 1px solid #000; padding: 8px; font-size: 11px;'>" + p.teacherName + "</td>";
    html += "<td style='border: 1px solid #000; padding: 8px; font-size: 11px;'>" + p.chapter + "</td>";
    html += "<td style='border: 1px solid #000; padding: 8px; font-size: 10px;'>" + p.topics.replace(/\n/g, "<br>") + "</td>";
    html += "<td style='border: 1px solid #000; padding: 8px; font-size: 10px;'>" + p.homework.replace(/\n/g, "<br>") + "</td>";
    html += "</tr>";
  }
  
  html += "</table>";
  html += "<div style='margin-top: 30px; text-align: right; font-size: 10px; color: #888;'>";
  html += "<p>Generated by Sacred Heart Academic Automation System</p>";
  html += "</div>";
  html += "</body></html>";
  
  var blob = Utilities.newBlob(html, MimeType.HTML);
  return blob.getAs(MimeType.PDF);
}

function sendFormalCompilationEmail(name, email, cls, sec, weekRange, driveLink, pdfBlob, fileName) {
  // Requirement: formal message
  var subject = "[OFFICIAL] Compiled Weekly Syllabus: Class " + cls + "-" + sec;
  
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px; border: 1px solid #eee;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear " + name + ",</p>" +
    "<p>Please find the compiled PDF of the lesson plan in the attachment for the week of <b>" + weekRange + "</b> for <b>Class " + cls + "-" + sec + "</b>.</p>" +
    "<p>For your records, the file has also been archived to the school cloud drive.</p>" +
    "<p><a href='" + driveLink + "' style='background-color: #003399; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold;'>View in Google Drive</a></p>" +
    "<br>" +
    "<p>Best Regards,</p>" +
    "<p><b>Coordinator</b><br>Sacred Heart School</p>" +
    "</div>";
    
  GmailApp.sendEmail(email, subject, "", {
    name: "Sacred Heart School",
    htmlBody: htmlBody,
    attachments: [pdfBlob]
  });
}

// ==========================================
// CORE FUNCTIONS
// ==========================================

function handleGetRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var reqSheet = ss.getSheetByName(REQUESTS_SHEET);

  if (!regSheet) return jsonResponse("error", "Registry not found");
  
  // Teachers
  var data = regSheet.getDataRange().getValues();
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

  // Requests
  var requests = [];
  if (reqSheet) {
    var reqData = reqSheet.getDataRange().getValues();
    for (var i = 1; i < reqData.length; i++) {
      if (!reqData[i][0]) continue;
      
      var week = reqData[i][4];
      if (week instanceof Date) {
        week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      requests.push({
        id: reqData[i][0],
        teacherId: reqData[i][1],
        teacherName: reqData[i][2],
        teacherEmail: reqData[i][3],
        weekStarting: week,
        timestamp: reqData[i][5],
        status: reqData[i][6]
      });
    }
  }

  return jsonResponse("success", { teachers: teachers, requests: requests });
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
  if (!ss.getSheetByName(REQUESTS_SHEET)) {
    var reqSheet = ss.insertSheet(REQUESTS_SHEET);
    var reqHeaders = ["ID", "Teacher ID", "Name", "Email", "Week Starting", "Timestamp", "Status"];
    reqSheet.getRange(1, 1, 1, reqHeaders.length).setValues([reqHeaders]).setBackground("#FF9800").setFontColor("#FFFFFF");
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

  // SEND CONFIRMATION EMAIL TO TEACHER
  try {
    var startDate = new Date(data.weekStarting);
    var endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 5); 
    var dateToStr = endDate.toISOString().split('T')[0];

    var subject = "Confirmation: Lesson Plan Submitted (" + data.weekStarting + " to " + dateToStr + ")";
    var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
      "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
      "<p>Dear " + data.teacherName + ",</p>" +
      "<p>Your lesson plan for the week <b>" + data.weekStarting + "</b> to <b>" + dateToStr + "</b> has been successfully submitted.</p>" +
      "<p><b>Classes Included:</b></p><ul>";

    var uniqueSubjects = [];
    var seen = {};
    data.plans.forEach(function(p) {
      var key = p.classLevel + "-" + p.section + ": " + p.subject;
      if (!seen[key]) {
        uniqueSubjects.push("<li>" + key + "</li>");
        seen[key] = true;
      }
    });
    
    htmlBody += uniqueSubjects.join("") + "</ul>" +
      "<p>This is an automated confirmation. You can view your submission history in the portal.</p>" +
      "<br><p>Best Regards,</p>" +
      "<p><b>Coordinator</b><br>Sacred Heart School</p>" +
      "</div>";

    GmailApp.sendEmail(data.teacherEmail, subject, "", {
      name: "Sacred Heart School",
      htmlBody: htmlBody
    });
  } catch (e) {
    console.error("Error sending confirmation email: " + e.toString());
  }

  return jsonResponse("success");
}

function handleResubmitRequest(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  // data contains: id, teacherId, teacherName, teacherEmail, weekStarting, timestamp, status
  sheet.appendRow([data.id, data.teacherId, data.teacherName, data.teacherEmail, data.weekStarting, data.timestamp, data.status]);
  return jsonResponse("success", "Request Logged in Cloud");
}

function handleResubmitApproval(data) {
  // 1. Mark as Approved in Requests Sheet
  var reqSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (reqSheet) {
    var reqRows = reqSheet.getDataRange().getValues();
    // Locate the request. We look for ID (col 0) if provided, or fallback to email+week.
    // data.requestId is sent from frontend now (we will ensure it).
    for (var i = 1; i < reqRows.length; i++) {
      var rowId = reqRows[i][0];
      var rowEmail = reqRows[i][3];
      var rowWeek = reqRows[i][4];
      if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");

      var match = false;
      if (data.requestId && rowId === data.requestId) {
        match = true;
      } else if (rowEmail === data.teacherEmail && rowWeek === data.weekStarting && reqRows[i][6] === 'pending') {
        match = true;
      }

      if (match) {
        reqSheet.getRange(i + 1, 7).setValue('approved'); // Column 7 is Status
        break; // Stop after first match
      }
    }
  }

  // 2. Send Email
  var subject = "Permission Granted: Weekly Syllabus Resubmission - " + data.weekStarting;
  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear " + data.teacherName + ",</p>" +
    "<p>Your request for resubmitting the lesson plan for the week <b>" + data.weekStarting + "</b> has been <b>APPROVED</b> by the administrator.</p>" +
    "<p>Your previous submission has been cleared. You can now log into the portal and submit your updated syllabus details.</p>" +
    "<p style='text-align: center;'><a href='" + PORTAL_URL + "' style='background: #003399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Open Syllabus Portal</a></p>" +
    "<br><p>Best Regards,</p>" +
    "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
    "</div>";

  GmailApp.sendEmail(data.teacherEmail, subject, "", {
    name: "Sacred Heart School",
    htmlBody: htmlBody
  });
  
  // 3. Clear Submission
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  // Iterate backwards to safely delete
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowWeek = rows[i][1];
    if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    if (rowWeek === data.weekStarting && rows[i][3].toLowerCase() === data.teacherEmail.toLowerCase()) {
      sheet.deleteRow(i + 1);
    }
  }

  return jsonResponse("success", "Approval Sent, Request Updated, Data Cleared");
}

function handleWarningEmails(data) {
  var portalLink = data.portalLink || PORTAL_URL;
  data.defaulters.forEach(function(t) {
    sendWarningEmail(t.name, t.email, data.weekStarting);
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
    "<p>Please find the attached <b>Official Compiled Syllabus Report</b> for <b>Class " + data.className + "</b>.</p>" +
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

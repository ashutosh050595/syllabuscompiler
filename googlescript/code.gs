
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v4.0)
 * 
 * IMPORTANT:
 * 1. Paste this entire code into your Google Apps Script editor.
 * 2. Save the project.
 * 3. Run the function 'setupTriggers' ONCE manually from the toolbar to activate automation.
 * 4. Deploy as Web App -> Execute as: Me -> Who can access: Anyone.
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

// ==========================================
// AUTOMATION TRIGGERS (Run 'setupTriggers' once manually)
// ==========================================

function setupTriggers() {
  // Clear existing triggers to prevent duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // 1. Warning Emails: Run daily at 2 PM (Logic inside function filters for Thu/Fri/Sat)
  ScriptApp.newTrigger('autoCheckAndSendWarnings')
      .timeBased()
      .everyDays(1)
      .atHour(14)
      .create();

  // 2. Compilation Emails: Run every Saturday at 8 PM
  ScriptApp.newTrigger('autoSendCompilations')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SATURDAY)
      .atHour(20)
      .create();
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
      "<p><b>Academic Automation System</b><br>Sacred Heart School</p>" +
      "</div>";

    GmailApp.sendEmail(email, subject, "", {
      name: "Sacred Heart School",
      htmlBody: htmlBody
    });
}

function autoSendCompilations() {
  var nextWeekMonday = getNextMondayDate();
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  var regData = regSheet.getDataRange().getValues();
  var subData = subSheet.getDataRange().getValues();
  
  // Parse Submissions
  // [Timestamp, WeekStarting, TeacherName, TeacherEmail, Class, Section, Subject, Chapter, Topics, Homework]
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
    var classTeacherJson = regData[i][5]; // Column F

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
          sendCompilationEmail(teacherName, teacherEmail, targetClass, targetSection, nextWeekMonday, classPlans);
        }
      } catch (e) {
        console.error("Error parsing class teacher info for " + teacherName);
      }
    }
  }
}

function sendCompilationEmail(name, email, classLevel, section, weekStarting, plans) {
  var subject = "[AUTO-REPORT] Weekly Syllabus Summary: Class " + classLevel + "-" + section;
  
  // Build HTML Table
  var tableRows = plans.map(function(p) {
    return "<tr>" +
      "<td style='padding:8px; border:1px solid #ddd; font-weight:bold;'>" + p.subject + "</td>" +
      "<td style='padding:8px; border:1px solid #ddd;'>" + p.teacherName + "</td>" +
      "<td style='padding:8px; border:1px solid #ddd;'>" + p.chapter + "</td>" +
      "<td style='padding:8px; border:1px solid #ddd; font-size:12px;'>" + p.topics + "</td>" +
      "<td style='padding:8px; border:1px solid #ddd; font-size:12px;'>" + p.homework + "</td>" +
      "</tr>";
  }).join("");

  var htmlBody = "<div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; border: 1px solid #eee; padding: 20px;'>" +
    "<h2 style='color: #003399;'>Sacred Heart School</h2>" +
    "<p>Dear " + name + ",</p>" +
    "<p>Here is the automated syllabus compilation for <b>Class " + classLevel + "-" + section + "</b> for the week of <b>" + weekStarting + "</b>.</p>" +
    "<table style='width:100%; border-collapse:collapse; margin-top:15px;'>" +
    "<tr style='background-color:#003399; color:white;'>" +
    "<th style='padding:10px; border:1px solid #ddd;'>Subject</th>" +
    "<th style='padding:10px; border:1px solid #ddd;'>Faculty</th>" +
    "<th style='padding:10px; border:1px solid #ddd;'>Chapter</th>" +
    "<th style='padding:10px; border:1px solid #ddd;'>Topics</th>" +
    "<th style='padding:10px; border:1px solid #ddd;'>Homework</th>" +
    "</tr>" +
    tableRows +
    "</table>" +
    "<br><p><i>Note: This is an auto-generated summary. For the official signed PDF, please access the portal.</i></p>" +
    "<p>Best Regards,</p>" +
    "<p><b>Academic Automation System</b></p>" +
    "</div>";

  GmailApp.sendEmail(email, subject, "", {
    name: "Sacred Heart School",
    htmlBody: htmlBody
  });
}

// ==========================================
// CORE FUNCTIONS
// ==========================================

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
      "<p><b>Academic Administration</b><br>Sacred Heart School</p>" +
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
  return jsonResponse("success", "Request Logged");
}

function handleResubmitApproval(data) {
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

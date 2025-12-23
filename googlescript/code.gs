
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v8.0 - SYNC & FEATURE RESTORE)
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
  lock.tryLock(30000);

  try {
    ensureEnvironment();
    
    var data;
    // Enhanced parsing for cross-device reliability
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch(ex) {
        // Handle no-cors specific payloads where JSON is the first key
        var contents = e.postData.contents;
        if (contents.indexOf('=') > -1) {
          var decoded = decodeURIComponent(contents.split('=')[0]);
          data = JSON.parse(decoded);
        }
      }
    } else if (e.parameter) {
      var keys = Object.keys(e.parameter);
      if (keys.length > 0) {
        try {
          data = JSON.parse(keys[0]);
        } catch(ex) {
          data = e.parameter;
        }
      }
    }
    
    if (!data || !data.action) {
      return jsonResponse("error", "No valid action found in payload");
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
    else result = jsonResponse("error", "Invalid Action: " + action);

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

function handleGetRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var reqSheet = ss.getSheetByName(REQUESTS_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);

  var teachers = [];
  var emailToId = {};
  if (regSheet) {
    var regData = regSheet.getDataRange().getValues();
    for (var i = 1; i < regData.length; i++) {
      if (!regData[i][0]) continue;
      var t = {
        id: regData[i][0], name: regData[i][1], email: regData[i][2], whatsapp: regData[i][3],
        assignedClasses: regData[i][4] ? JSON.parse(regData[i][4]) : [],
        isClassTeacher: regData[i][5] ? JSON.parse(regData[i][5]) : undefined
      };
      teachers.push(t);
      emailToId[t.email.toLowerCase().trim()] = t.id;
    }
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

  var submissions = [];
  if (subSheet) {
    var subData = subSheet.getDataRange().getValues();
    var map = {};
    for (var i = 1; i < subData.length; i++) {
      var r = subData[i];
      if (!r[2]) continue;
      var week = r[1];
      if (week instanceof Date) week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      var email = String(r[3]).toLowerCase().trim();
      var key = email + "_" + week;
      if (!map[key]) {
        map[key] = { id: key, teacherId: emailToId[email] || "ext", teacherName: r[2], teacherEmail: r[3], weekStarting: week, timestamp: r[0], plans: [] };
      }
      map[key].plans.push({ classLevel: r[4], section: r[5], subject: r[6], chapterName: r[7], topics: r[8], homework: r[9] });
    }
    for (var k in map) submissions.push(map[k]);
  }
  
  return jsonResponse("success", { teachers: teachers, requests: requests, submissions: submissions });
}

function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  data.plans.forEach(function(p) {
    sheet.appendRow([new Date(), data.weekStarting, data.teacherName, data.teacherEmail, p.classLevel, p.section, p.subject, p.chapterName, p.topics, p.homework]);
  });
  return jsonResponse("success", "Plan Saved");
}

function handleResubmitRequest(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  sheet.appendRow([data.id, data.teacherId, data.teacherName, data.teacherEmail, data.weekStarting, data.timestamp, data.status]);
  return jsonResponse("success", "Request Logged");
}

function handleResubmitApproval(data) {
  var reqSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (reqSheet) {
    var reqRows = reqSheet.getDataRange().getValues();
    for (var i = 1; i < reqRows.length; i++) {
      if (reqRows[i][0] === data.requestId) {
        reqSheet.getRange(i + 1, 7).setValue('approved');
        break;
      }
    }
  }
  handleResetSubmission(data, true); 
  return jsonResponse("success", "Approved");
}

function handleResetSubmission(data, skipEmail) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowWeek = rows[i][1];
    var rowEmail = rows[i][3];
    if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (String(rowWeek) === String(data.weekStarting) && String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim()) {
      sheet.deleteRow(i + 1);
    }
  }
  return jsonResponse("success", "Deleted");
}

function handleSyncRegistry(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
  sheet.clearContents();
  sheet.appendRow(["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo"]);
  if(data.teachers) {
    data.teachers.forEach(function(t) {
      sheet.appendRow([t.id, t.name, t.email, t.whatsapp||"", JSON.stringify(t.assignedClasses), t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""]);
    });
  }
  return jsonResponse("success", "Synced");
}

function handleWarningEmails(data) {
  if (data.defaulters) {
    data.defaulters.forEach(function(d) {
      try {
        var html = "<h3>Sacred Heart School</h3><p>Dear " + d.name + ", your syllabus for " + data.weekStarting + " is pending.</p>";
        GmailApp.sendEmail(d.email, "[REMINDER] Syllabus Pending", "", { htmlBody: html, name: "SHS Portal" });
      } catch(e) {}
    });
  }
  return jsonResponse("success", "Sent");
}

function handlePdfDelivery(data) {
  var blob = Utilities.newBlob(Utilities.base64Decode(data.pdfBase64.split(',')[1]), MimeType.PDF, data.filename);
  GmailApp.sendEmail(data.recipient, "[OFFICIAL] Syllabus Report", "Report attached.", { attachments: [blob], name: "SHS Portal" });
  return jsonResponse("success", "Sent");
}

function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) ss.insertSheet(SUBMISSIONS_SHEET).appendRow(["Timestamp", "Week", "Name", "Email", "Class", "Sec", "Sub", "Chap", "Topics", "HW"]);
  if (!ss.getSheetByName(REGISTRY_SHEET)) ss.insertSheet(REGISTRY_SHEET).appendRow(["ID", "Name", "Email", "WA", "Ass", "CT"]);
  if (!ss.getSheetByName(REQUESTS_SHEET)) ss.insertSheet(REQUESTS_SHEET).appendRow(["ID", "TID", "Name", "Email", "Week", "Time", "Stat"]);
}

function jsonResponse(res, dataOrMsg) {
  var output = { result: res };
  if (typeof dataOrMsg === 'string') output.message = dataOrMsg;
  else Object.assign(output, dataOrMsg);
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON).setHeaders({ "Access-Control-Allow-Origin": "*" });
}

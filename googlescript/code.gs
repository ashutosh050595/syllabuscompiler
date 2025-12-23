
/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGER CLOUD BACKEND (v6.0 - SYNC FIX)
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
        var keys = Object.keys(e.parameter);
        if (keys.length === 1) {
           try { data = JSON.parse(keys[0]); } catch(e){}
        }
      }
      
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
// HANDLERS
// ==========================================

function handleGetRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName(REGISTRY_SHEET);
  var reqSheet = ss.getSheetByName(REQUESTS_SHEET);
  var subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);

  if (!regSheet) return jsonResponse("error", "Registry not found");
  
  // 1. Get Teachers
  var regData = regSheet.getDataRange().getValues();
  var teachers = [];
  var emailToId = {}; // Map for linking submissions later
  
  for (var i = 1; i < regData.length; i++) {
    if (!regData[i][0]) continue;
    try {
      var t = {
        id: regData[i][0], 
        name: regData[i][1], 
        email: regData[i][2], 
        whatsapp: regData[i][3],
        assignedClasses: regData[i][4] ? JSON.parse(regData[i][4]) : [], 
        isClassTeacher: regData[i][5] ? JSON.parse(regData[i][5]) : undefined
      };
      teachers.push(t);
      if(t.email) emailToId[t.email.toLowerCase().trim()] = t.id;
    } catch(e) { console.error("Error parsing row " + i); }
  }
  
  // 2. Get Requests
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

  // 3. Get Submissions (CRITICAL FOR SYNC)
  var submissions = [];
  if (subSheet) {
    var subData = subSheet.getDataRange().getValues();
    var submissionMap = {}; // Key: email_week

    for (var i = 1; i < subData.length; i++) {
      var row = subData[i];
      // Skip empty rows
      if (!row[2]) continue;

      var week = row[1];
      if (week instanceof Date) week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      
      var email = String(row[3]).toLowerCase().trim();
      var key = email + "_" + week;

      if (!submissionMap[key]) {
        submissionMap[key] = {
          id: key, // Synthetic ID
          teacherId: emailToId[email] || "unknown",
          teacherName: row[2],
          teacherEmail: row[3],
          weekStarting: week,
          timestamp: row[0],
          plans: []
        };
      }

      submissionMap[key].plans.push({
        classLevel: row[4],
        section: row[5],
        subject: row[6],
        chapterName: row[7],
        topics: row[8],
        homework: row[9]
      });
    }
    
    // Convert map to array
    for (var k in submissionMap) {
      submissions.push(submissionMap[k]);
    }
  }
  
  return jsonResponse("success", { teachers: teachers, requests: requests, submissions: submissions });
}

function handlePlanSubmission(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  if (!data.plans || !Array.isArray(data.plans)) return jsonResponse("error", "No plans");

  data.plans.forEach(function(p) {
    sheet.appendRow([new Date(), data.weekStarting, data.teacherName, data.teacherEmail, p.classLevel, p.section, p.subject, p.chapterName, p.topics, p.homework]);
  });
  
  try {
    var subject = "[OFFICIAL] Confirmation: Weekly Syllabus Submission";
    GmailApp.sendEmail(data.teacherEmail, subject, "Your syllabus plan has been received.", { name: "Sacred Heart School" });
  } catch (e) {}

  return jsonResponse("success", "Plans stored");
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
  try {
    GmailApp.sendEmail(data.teacherEmail, "[APPROVED] Resubmit Syllabus", "Your request to resubmit has been approved.", { name: "Sacred Heart School" });
  } catch (e) {}
  return jsonResponse("success", "Approval Sent");
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
  sheet.appendRow(["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"]);
  if(data.teachers) {
    data.teachers.forEach(function(t) {
      sheet.appendRow([t.id, t.name, t.email, t.whatsapp||"", JSON.stringify(t.assignedClasses), t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""]);
    });
  }
  return jsonResponse("success", "Registry Synced");
}

function handleWarningEmails(data) {
  if (data.defaulters) {
    data.defaulters.forEach(function(d) {
      try { sendWarningEmail(d.name, d.email, data.weekStarting); } catch(e) {}
    });
  }
  return jsonResponse("success", "Sent emails");
}

function handlePdfDelivery(data) {
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(data.pdfBase64.split(',')[1]), MimeType.PDF, data.filename);
    GmailApp.sendEmail(data.recipient, "[OFFICIAL] Syllabus Report", "Please find attached report.", { attachments: [blob], name: "Sacred Heart School" });
    return jsonResponse("success", "PDF Sent");
  } catch (e) { return jsonResponse("error", e.toString()); }
}

function ensureEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) ss.insertSheet(SUBMISSIONS_SHEET).appendRow(["Timestamp", "Week", "Name", "Email", "Class", "Section", "Subject", "Chapter", "Topics", "Homework"]);
  if (!ss.getSheetByName(REGISTRY_SHEET)) ss.insertSheet(REGISTRY_SHEET).appendRow(["Teacher ID", "Name", "Email", "WhatsApp", "Assignments JSON", "Class Teacher Info JSON"]);
  if (!ss.getSheetByName(REQUESTS_SHEET)) ss.insertSheet(REQUESTS_SHEET).appendRow(["ID", "Teacher ID", "Name", "Email", "Week", "Timestamp", "Status"]);
}

function jsonResponse(res, dataOrMsg) {
  var output = { result: res };
  if (typeof dataOrMsg === 'string') output.message = dataOrMsg;
  else Object.assign(output, dataOrMsg);
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON).setHeaders({ "Access-Control-Allow-Origin": "*" });
}

function setupTriggers() {
  console.log("Setup done");
}

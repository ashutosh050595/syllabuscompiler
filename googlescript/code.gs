/**
 * SACRED HEART SCHOOL - SYLLABUS MANAGEMENT SYSTEM (v11.3 - MULTI-DEVICE SYNC EDITION)
 * COMPLETE BACKEND WITH REAL-TIME SYNC ACROSS ALL DEVICES
 */

// ==========================================
// EMAIL & SCHOOL CONFIGURATION
// ==========================================

const SCHOOL_NAME = "Sacred Heart School, Koderma";
const ADMIN_EMAIL = "admin@sacredheartkoderma.org";
const CC_EMAIL_GAUTAM = "gautam663@gmail.com";
const CC_EMAIL_PSHARMA = "psharma@sacredheartkoderma.org";
const EMAIL_SENDER_NAME = "Sacred Heart School [Auto Syllabus System]";
const REPLY_TO_EMAIL = "admin@sacredheartkoderma.org";
const ACADEMIC_EMAIL = "academic@sacredheartkoderma.org";

// ==========================================
// SYSTEM CONSTANTS
// ==========================================

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SUBMISSIONS_SHEET = "Submissions";
const REGISTRY_SHEET = "Registry";
const REQUESTS_SHEET = "Requests";
const BACKUP_SHEET = "SUBMISSIONS_BACKUP";
const AUDIT_SHEET = "AUDIT_LOG";
const RAW_BACKUP_SHEET = "RAW_BACKUP";
const DEVICE_LOG_SHEET = "DEVICE_LOG";
const SYNC_LOG_SHEET = "SYNC_LOG";
const PORTAL_URL = "https://syllabuscompiler-ruddy.vercel.app/";

// WhatsApp Configuration
const WHATSAPP_CONFIG = {
  enabled: true,
  useCallMeBot: true,
  callmebotApiKey: 'YOUR_CALLMEBOT_API_KEY',
  
  useTwilio: false,
  twilioAccountSid: 'YOUR_TWILIO_ACCOUNT_SID',
  twilioAuthToken: 'YOUR_TWILIO_AUTH_TOKEN',
  twilioWhatsAppNumber: 'whatsapp:+14155238886',
  
  useWhatsAppBusiness: false,
  whatsappBusinessToken: 'YOUR_WHATSAPP_BUSINESS_TOKEN',
  whatsappBusinessPhoneId: 'YOUR_PHONE_ID'
};

// ==========================================
// HTTP HANDLERS
// ==========================================

// function doOptions(e) {
//   var headers = {
//     "Access-Control-Allow-Origin": "*",
//     "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
//     "Access-Control-Allow-Headers": "Content-Type, X-Device-Type, X-Submission-ID, X-Requested-With, X-Device-ID",
//     "Access-Control-Max-Age": "86400",
//     "Access-Control-Allow-Credentials": "true"
//   };
  
//   var output = ContentService.createTextOutput("");
//   output.setMimeType(ContentService.MimeType.TEXT);

function doOptions(e) {
  // Google Apps Script does NOT support setting custom headers
  // CORS is handled automatically when the Web App is public
  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}


//   // Set headers individually
//   for (var key in headers) {
//     output.setHeader(key, headers[key]);
//   }
  
//   return output;
// }


function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureEnvironment();

    let data = extractDataFromAnyFormat(e);
    saveRawBackup(e);

    if (!data || !data.action) {
      data = extractBasicSubmission(e);
    }

    if (!data || !data.action) {
      return jsonResponse("success", {
        message: "Data stored as raw backup",
        backupId: "RAW_" + Date.now()
      });
    }

    /* ---------- DEVICE LOGGING ---------- */
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || data._device || 'desktop';
    logDeviceActivity(deviceId, deviceType, data.action);

    /* ---------- AUDIT ---------- */
    const submissionId = data._sid || generateId();
    saveToAuditLog(data, submissionId, e);

    let result;
    const action = data.action;

    /* ---------- WRITE ACTIONS ONLY ---------- */
    if (action === 'SUBMIT_PLAN')
      result = handlePlanSubmission(data, submissionId);

    else if (action === 'SYNC_REGISTRY')
      result = handleSyncRegistry(data);

    else if (action === 'SEND_WARNINGS')
      result = handleWarningEmails(data);

    else if (action === 'SEND_COMPILED_PDF')
      result = handlePdfDelivery(data);

    else if (action === 'REQUEST_RESUBMIT')
      result = handleResubmitRequest(data);

    else if (action === 'APPROVE_RESUBMIT')
      result = handleApproveResubmit(data);

    else if (action === 'RESET_SUBMISSION')
      result = handleResetSubmission(data);

    else if (action === 'DELETE_TEACHER')
      result = handleDeleteTeacher(data);

    else if (action === 'UPDATE_TEACHER')
      result = handleUpdateTeacher(data);

    else if (action === 'GET_SUBMISSION_DETAILS')
      result = handleGetSubmissionDetails(data);

    else if (action === 'GET_REQUESTS')
      result = handleGetRequests(data);

    else if (action === 'TEST_WHATSAPP')
      result = handleTestWhatsApp(data);

    else if (action === 'FORCE_SYNC')
      result = handleForceSync(data);

    /* ---------- BLOCK READ ACTIONS ---------- */
    else if (action === 'GET_REGISTRY') {
      // IMPORTANT: Registry must be fetched via doGet
      result = jsonResponse("success", {
        message: "Use GET endpoint for registry",
        redirect: "GET"
      });
    }

    else {
      result = jsonResponse("error", "Invalid Action: " + action);
    }

    return result;

  } catch (error) {
    return jsonResponse("error", "Server Error: " + error.message);
  } finally {
    lock.releaseLock();
  }
}


// function doPost(e) {
//   var lock = LockService.getScriptLock();
//   lock.tryLock(30000);

//   try {
//     ensureEnvironment();
    
//     var data = extractDataFromAnyFormat(e);
//     saveRawBackup(e);
    
//     if (!data || !data.action) {
//       data = extractBasicSubmission(e);
//     }
    
//     if (!data || !data.action) {
//       return jsonResponse("success", { 
//         message: "Data received in backup storage", 
//         backupId: "RAW_" + new Date().getTime()
//       });
//     }
    
//     // Log device info
//     const deviceId = data._deviceId || 'unknown';
//     const deviceType = data._deviceType || (data._device || 'desktop');
//     logDeviceActivity(deviceId, deviceType, data.action);
    
//     const submissionId = data._sid || generateId();
//     saveToAuditLog(data, submissionId, e);
    
//     var action = data.action;
//     var result;

//     if (action === 'SUBMIT_PLAN') result = handlePlanSubmission(data, submissionId);
//     else if (action === 'SYNC_REGISTRY') result = handleSyncRegistry(data);
//     else if (action === 'GET_REGISTRY') result = handleGetRegistry(data);
//     else if (action === 'SEND_WARNINGS') result = handleWarningEmails(data);
//     else if (action === 'SEND_COMPILED_PDF') result = handlePdfDelivery(data);
//     else if (action === 'REQUEST_RESUBMIT') result = handleResubmitRequest(data);
//     else if (action === 'APPROVE_RESUBMIT') result = handleApproveResubmit(data);
//     else if (action === 'RESET_SUBMISSION') result = handleResetSubmission(data);
//     else if (action === 'DELETE_TEACHER') result = handleDeleteTeacher(data);
//     else if (action === 'UPDATE_TEACHER') result = handleUpdateTeacher(data);
//     else if (action === 'GET_SUBMISSION_DETAILS') result = handleGetSubmissionDetails(data);
//     else if (action === 'GET_REQUESTS') result = handleGetRequests(data);
//     else if (action === 'TEST_WHATSAPP') result = handleTestWhatsApp(data);
//     else if (action === 'FORCE_SYNC') result = handleForceSync(data);
//     else result = jsonResponse("error", "Invalid Action: " + action);

//     return result;

//   } catch (error) {
//     return jsonResponse("error", "Server Error: " + error.toString());
//   } finally {
//     lock.releaseLock();
//   }
// }

function doGet(e) {
  const params = e.parameter || {};
  const deviceId = params.d || 'unknown';
  const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(e.queryString || '')
    ? 'mobile'
    : 'desktop';

  // Log device access (safe)
  logDeviceActivity(deviceId, deviceType, 'GET_REGISTRY');

  /* ---------------- VERIFY MODE ---------------- */
  if (params.verify) {
    return verifySubmissionById(params.verify);
  }

  /* ---------------- LEGACY SIMPLE MODE ---------------- */
  if (params.simple && params.data) {
    try {
      const data = JSON.parse(params.data);
      if (data.action === 'SUBMIT_PLAN') {
        // Keep your existing fallback
        handlePlanSubmission(data, 'GET_' + generateId());
        return ContentService
          .createTextOutput("OK")
          .setMimeType(ContentService.MimeType.TEXT);
      }
    } catch (err) {
      saveRawBackup({
        error: err.message,
        raw: params.data,
        deviceId,
        time: new Date().toISOString()
      });
    }
  }

  /* ---------------- AUTHORITATIVE REGISTRY RESPONSE ---------------- */
  const ss = SpreadsheetApp.getActive();

  const response = {
    ok: true,
    serverTime: new Date().toISOString(),
    device: {
      id: deviceId,
      type: deviceType
    },
    registry: {
      teachers: readSheet(ss, 'Teachers'),
      submissions: readSheet(ss, 'Submissions'),
      resubmitRequests: readSheet(ss, 'ResubmitRequests')
    }
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}


// function doGet(e) {
//   const params = e.parameter || {};
//   const deviceId = params.d || 'unknown';
//   const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(e.queryString || '') ? 'mobile' : 'desktop';
  
//   // Log device access
//   logDeviceActivity(deviceId, deviceType, 'GET_REGISTRY');
  
//   if (params.verify) {
//     return verifySubmissionById(params.verify);
//   }
  
//   if (params.simple && params.data) {
//     try {
//       const data = JSON.parse(params.data);
//       if (data.action === 'SUBMIT_PLAN') {
//         handlePlanSubmission(data, 'GET_' + generateId());
//         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
//       }
//     } catch(e) {
//       saveRawBackup(e);
//     }
//   }
  
//   if (params.force) {
//     // Force refresh data
//     return handleGetRegistry({ _deviceId: deviceId, _force: true });
//   }
  
//   return handleGetRegistry({ _deviceId: deviceId });
// }

// ==========================================
// DEVICE TRACKING FUNCTIONS
// ==========================================

function logDeviceActivity(deviceId, deviceType, action) {
  try {
    ensureSheetExists(DEVICE_LOG_SHEET, ['Timestamp', 'DeviceID', 'DeviceType', 'Action', 'IP', 'UserAgent']);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DEVICE_LOG_SHEET);
    
    sheet.appendRow([
      new Date().toISOString(),
      deviceId,
      deviceType,
      action,
      ScriptProperties.getProperty('last_ip') || 'unknown',
      ScriptProperties.getProperty('last_ua') || 'unknown'
    ]);
    
    // Keep only last 1000 entries
    const maxRows = 1000;
    const lastRow = sheet.getLastRow();
    if (lastRow > maxRows) {
      sheet.deleteRows(2, lastRow - maxRows);
    }
    
  } catch (error) {
    // Silent fail
  }
}

function logSyncActivity(deviceId, deviceType, action, result) {
  try {
    ensureSheetExists(SYNC_LOG_SHEET, ['Timestamp', 'DeviceID', 'DeviceType', 'Action', 'Result', 'DataSize']);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SYNC_LOG_SHEET);
    
    sheet.appendRow([
      new Date().toISOString(),
      deviceId,
      deviceType,
      action,
      result,
      JSON.stringify(result).length
    ]);
    
    // Keep only last 500 entries
    const maxRows = 500;
    const lastRow = sheet.getLastRow();
    if (lastRow > maxRows) {
      sheet.deleteRows(2, lastRow - maxRows);
    }
    
  } catch (error) {
    // Silent fail
  }
}

// ==========================================
// DATA EXTRACTION & BACKUP
// ==========================================

function extractDataFromAnyFormat(e) {
  var data = null;
  
  const methods = [
    () => e.postData?.contents ? JSON.parse(e.postData.contents) : null,
    () => e.parameter?.payload ? JSON.parse(e.parameter.payload) : null,
    () => {
      const keys = Object.keys(e.parameter || {});
      for (const key of keys) {
        try {
          const parsed = JSON.parse(key);
          if (parsed && parsed.action) return parsed;
        } catch(ex) {}
        
        try {
          const parsed = JSON.parse(e.parameter[key]);
          if (parsed && parsed.action) return parsed;
        } catch(ex) {}
      }
      return null;
    },
    () => reconstructFromFormData(e.parameter),
    () => {
      const raw = e.postData?.contents || '';
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(raw.substring(start, end + 1));
        } catch(ex) {}
      }
      return null;
    }
  ];
  
  for (const method of methods) {
    try {
      data = method();
      if (data && data.action) break;
    } catch (e) {}
  }
  
  // Store IP and UserAgent for logging
  if (data) {
    ScriptProperties.setProperty('last_ip', e.parameter?.__ip || 'unknown');
    ScriptProperties.setProperty('last_ua', e.parameter?.__ua || 'unknown');
  }
  
  return data;
}

function reconstructFromFormData(params) {
  if (!params) return null;
  
  const result = {};
  for (const key in params) {
    if (key.startsWith('_')) continue;
    
    if (key.includes('[') && key.includes(']')) {
      const match = key.match(/(\w+)\[(\d+)\]\[(\w+)\]/);
      if (match) {
        const [, arrayName, index, property] = match;
        if (!result[arrayName]) result[arrayName] = [];
        if (!result[arrayName][index]) result[arrayName][index] = {};
        result[arrayName][index][property] = params[key];
      }
    } else if (key.includes('.')) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          if (!isNaN(parts[i + 1])) {
            current[part] = [];
          } else {
            current[part] = {};
          }
        }
        current = current[part];
      }
      current[parts[parts.length - 1]] = params[key];
    } else {
      result[key] = params[key];
    }
  }
  
  return result;
}

function extractBasicSubmission(e) {
  if (!e.parameter) return null;
  
  const result = { action: 'SUBMIT_PLAN' };
  result.teacherName = e.parameter.teacherName || e.parameter.name || 'Unknown';
  result.teacherEmail = e.parameter.teacherEmail || e.parameter.email || 'unknown@example.com';
  result.weekStarting = e.parameter.weekStarting || e.parameter.week || new Date().toISOString().split('T')[0];
  
  if (e.parameter.classLevel || e.parameter.subject) {
    result.plans = [{
      classLevel: e.parameter.classLevel || '',
      section: e.parameter.section || '',
      subject: e.parameter.subject || '',
      chapterName: e.parameter.chapterName || e.parameter.chapter || '',
      topics: e.parameter.topics || '',
      homework: e.parameter.homework || ''
    }];
  }
  
  return result.plans ? result : null;
}

function saveRawBackup(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let backupSheet = ss.getSheetByName(RAW_BACKUP_SHEET);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(RAW_BACKUP_SHEET);
      backupSheet.appendRow(['Timestamp', 'Method', 'ContentType', 'IP', 'UserAgent', 'QueryString', 'RawData']);
    }
    
    const ip = e.parameter?.__ip || e.parameter?.ip || (e.postData ? 'POST' : 'GET') + '_' + new Date().getTime();
    const userAgent = e.parameter?.__ua || e.parameter?.userAgent || e.parameter?.ua || 'unknown';
    
    backupSheet.appendRow([
      new Date().toISOString(),
      e.postData ? 'POST' : 'GET',
      e.postData?.type || 'N/A',
      ip,
      userAgent.substring(0, 200),
      e.queryString || '',
      JSON.stringify({
        parameters: e.parameter,
        postData: e.postData ? e.postData.contents.substring(0, 5000) : null,
        contextPath: e.contextPath
      }).substring(0, 40000)
    ]);
    
    const maxRows = 10000;
    const lastRow = backupSheet.getLastRow();
    if (lastRow > maxRows) {
      backupSheet.deleteRows(2, lastRow - maxRows);
    }
    
  } catch (error) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheets()[0];
      sheet.appendRow(['BACKUP_FAILED', new Date().toISOString(), error.toString().substring(0, 100)]);
    } catch (e) {}
  }
}

function saveToAuditLog(data, submissionId, e) {
  try {
    ensureSheetExists(AUDIT_SHEET, ['Timestamp', 'Action', 'SubmissionID', 'Teacher', 'Email', 'Week', 'IP', 'Device', 'DeviceID', 'Status']);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName(AUDIT_SHEET);
    
    auditSheet.appendRow([
      new Date().toISOString(),
      data.action,
      submissionId,
      data.teacherName || data.name || 'N/A',
      data.teacherEmail || data.email || 'N/A',
      data.weekStarting || 'N/A',
      e.parameter?.__ip || 'unknown',
      data._device || data._deviceType || (e.parameter?.__ua ? 'mobile' : 'desktop'),
      data._deviceId || 'unknown',
      'RECEIVED'
    ]);
  } catch (error) {}
}

function ensureSheetExists(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function generateId() {
  return 'id_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==========================================
// CORE HANDLERS (UPDATED FOR MULTI-DEVICE SYNC)
// ==========================================

function handleGetRegistry(data) {
  try {
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
          id: regData[i][0], 
          name: regData[i][1], 
          email: regData[i][2], 
          whatsapp: regData[i][3],
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
        var status = reqData[i][6] || 'pending';
        
        // ONLY return pending requests, not approved ones
        if (status === 'pending') {
          requests.push({
            id: reqData[i][0], 
            teacherId: reqData[i][1], 
            teacherName: reqData[i][2], 
            teacherEmail: reqData[i][3],
            weekStarting: week, 
            timestamp: reqData[i][5], 
            status: status, 
            reason: reqData[i][7] || ''
          });
        }
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
          map[key] = { 
            id: key, 
            teacherId: emailToId[email] || "ext_" + email, 
            teacherName: r[2], 
            teacherEmail: r[3], 
            weekStarting: week, 
            timestamp: r[0], 
            device: r[11] || 'unknown',
            deviceId: r[12] || 'unknown',
            plans: [] 
          };
        }
        map[key].plans.push({ 
          classLevel: r[4], 
          section: r[5], 
          subject: r[6], 
          chapterName: r[7], 
          topics: r[8], 
          homework: r[9] 
        });
      }
      for (var k in map) submissions.push(map[k]);
    }
    
    // Log sync activity
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || 'desktop';
    logSyncActivity(deviceId, deviceType, 'GET_REGISTRY', {
      teachers: teachers.length,
      requests: requests.length,
      submissions: submissions.length
    });
    
    return jsonResponse("success", { 
      teachers: teachers, 
      requests: requests, 
      submissions: submissions,
      serverTime: new Date().toISOString(),
      version: "v11.3",
      syncId: "sync_" + new Date().getTime(),
      forceSync: data._force || false
    });
    
  } catch (error) {
    return jsonResponse("error", "Failed to get registry: " + error.toString());
  }
}

function handleForceSync(data) {
  try {
    // Clear cache and force rebuild
    const deviceId = data._deviceId || 'unknown';
    logSyncActivity(deviceId, 'server', 'FORCE_SYNC', { forced: true });
    
    return handleGetRegistry(data);
    
  } catch (error) {
    return jsonResponse("error", "Force sync failed: " + error.toString());
  }
}

function handlePlanSubmission(data, submissionId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    
    let weekStarting = data.weekStarting;
    if (weekStarting && !(weekStarting instanceof Date)) {
      try {
        weekStarting = new Date(weekStarting);
      } catch(e) {
        weekStarting = new Date();
      }
    } else if (!weekStarting) {
      weekStarting = new Date();
    }
    
    const timestamp = new Date();
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || data._device || 'unknown';
    
    if (data.plans && Array.isArray(data.plans)) {
      for (let i = 0; i < data.plans.length; i++) {
        const p = data.plans[i];
        sheet.appendRow([
          timestamp,
          weekStarting,
          data.teacherName || 'Unknown',
          data.teacherEmail || 'unknown@example.com',
          p.classLevel || '',
          p.section || '',
          p.subject || '',
          p.chapterName || '',
          p.topics || '',
          p.homework || '',
          submissionId,
          deviceType,
          deviceId,
          'SUCCESS'
        ]);
      }
    } else {
      sheet.appendRow([
        timestamp,
        weekStarting,
        data.teacherName || 'Unknown',
        data.teacherEmail || 'unknown@example.com',
        data.classLevel || '',
        data.section || '',
        data.subject || '',
        data.chapterName || '',
        data.topics || '',
        data.homework || '',
        submissionId,
        deviceType,
        deviceId,
        'SUCCESS'
      ]);
    }
    
    SpreadsheetApp.flush();
    saveToBackupSheet(data, submissionId);
    
    // Log device submission
    logDeviceActivity(deviceId, deviceType, 'SUBMIT_PLAN_' + (data.plans ? data.plans.length : 1));
    
    if (data.sendConfirmation !== false) {
      sendConfirmationEmail(data, submissionId);
    }
    
    return jsonResponse("success", { 
      message: "Syllabus plan saved successfully", 
      submissionId: submissionId,
      count: data.plans ? data.plans.length : 1,
      deviceId: deviceId,
      synced: true
    });
    
  } catch (error) {
    saveToBackupSheet(data, submissionId);
    return jsonResponse("partial_success", { 
      message: "Saved to backup system. Error: " + error.toString(),
      submissionId: submissionId,
      backup: true
    });
  }
}

function saveToBackupSheet(data, submissionId) {
  try {
    ensureSheetExists(BACKUP_SHEET, ['Timestamp', 'SubmissionID', 'Action', 'Teacher', 'Email', 'Week', 'FullData']);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const backupSheet = ss.getSheetByName(BACKUP_SHEET);
    
    backupSheet.appendRow([
      new Date().toISOString(),
      submissionId,
      data.action || 'UNKNOWN',
      data.teacherName || 'Unknown',
      data.teacherEmail || 'unknown@example.com',
      data.weekStarting || new Date().toISOString().split('T')[0],
      JSON.stringify(data).substring(0, 40000)
    ]);
    
  } catch (error) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ss.getSheetByName('Submissions').appendRow([
        new Date(), 'BACKUP_FAILED', error.toString().substring(0, 50), submissionId
      ]);
    } catch (e) {}
  }
}

function handleResubmitRequest(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REQUESTS_SHEET);
    
    const requestId = data.id || 'req_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
    const timestamp = data.timestamp || new Date().toISOString();
    const status = data.status || 'pending';
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || data._device || 'unknown';
    
    sheet.appendRow([
      requestId,
      data.teacherId,
      data.teacherName,
      data.teacherEmail,
      data.weekStarting,
      timestamp,
      status,
      data.reason || 'Modification requested'
    ]);
    
    SpreadsheetApp.flush(); // Ensure write is committed
    
    // Log device activity
    logDeviceActivity(deviceId, deviceType, 'REQUEST_RESUBMIT');
    
    // Send notification to admin about resubmission request
    sendResubmitRequestNotification(data, requestId);
    
    return jsonResponse("success", { 
      message: "Resubmit request logged", 
      requestId: requestId,
      deviceId: deviceId
    });
    
  } catch (error) {
    saveToBackupSheet({...data, action: 'REQUEST_RESUBMIT'}, 'req_' + new Date().getTime());
    return jsonResponse("success", { 
      message: "Request saved to backup due to error: " + error.toString(),
      backup: true
    });
  }
}

function handleApproveResubmit(data) {
  try {
    Logger.log(`🔄 Starting approval process for request: ${data.requestId}`);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reqSheet = ss.getSheetByName(REQUESTS_SHEET);
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || 'desktop';
    
    // 1. Update request status to approved
    let requestUpdated = false;
    if (reqSheet) {
      const reqRows = reqSheet.getDataRange().getValues();
      for (let i = 1; i < reqRows.length; i++) {
        if (reqRows[i][0] === data.requestId) {
          reqSheet.getRange(i + 1, 7).setValue('approved');
          reqSheet.getRange(i + 1, 8).setValue('Approved at: ' + new Date().toISOString() + ' by ' + deviceId);
          requestUpdated = true;
          
          // Extract teacher data if not provided
          if (!data.teacherEmail && reqRows[i][3]) {
            data.teacherEmail = reqRows[i][3];
          }
          if (!data.teacherName && reqRows[i][2]) {
            data.teacherName = reqRows[i][2];
          }
          if (!data.weekStarting && reqRows[i][4]) {
            data.weekStarting = reqRows[i][4];
            if (data.weekStarting instanceof Date) {
              data.weekStarting = Utilities.formatDate(data.weekStarting, Session.getScriptTimeZone(), "yyyy-MM-dd");
            }
          }
          
          Logger.log(`✅ Request ${data.requestId} marked as approved by device ${deviceId}`);
          break;
        }
      }
    }
    
    if (!requestUpdated) {
      Logger.log(`⚠️ Request ${data.requestId} not found in Requests sheet`);
    }
    
    // 2. Clear previous submission
    const resetData = {
      teacherEmail: data.teacherEmail,
      teacherName: data.teacherName,
      weekStarting: data.weekStarting,
      _deviceId: deviceId,
      _deviceType: deviceType
    };
    
    let resetResult = { deletedCount: 0 };
    try {
      resetResult = handleResetSubmission(resetData, true); // true = skip email (we'll send approval email instead)
      Logger.log(`✅ Previous submission cleared: ${resetResult.deletedCount || 0} records deleted`);
    } catch (resetError) {
      Logger.log(`⚠️ Reset submission failed: ${resetError.toString()}`);
    }
    
    // 3. Send approval email to teacher
    let emailSent = false;
    try {
      emailSent = sendApprovalEmail(data);
      if (emailSent) {
        Logger.log(`✅ Approval email sent to ${data.teacherEmail}`);
      } else {
        Logger.log(`❌ Failed to send approval email to ${data.teacherEmail}`);
      }
    } catch (emailError) {
      Logger.log(`❌ Error sending approval email: ${emailError.toString()}`);
    }
    
    // 4. Log the approval action
    logApprovalAction(data, resetResult.deletedCount || 0, emailSent, deviceId);
    
    // 5. Force flush all changes
    SpreadsheetApp.flush();
    
    // 6. Return success response
    return jsonResponse("success", { 
      message: "Request approved successfully",
      requestId: data.requestId,
      teacherEmail: data.teacherEmail,
      weekStarting: data.weekStarting,
      previousSubmissionCleared: resetResult.deletedCount || 0,
      approvalEmailSent: emailSent,
      approvedByDevice: deviceId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    Logger.log(`❌ Approval process failed: ${error.toString()}`);
    return jsonResponse("error", "Approval failed: " + error.toString());
  }
}

function handleResetSubmission(data, skipEmail) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
    if (!sheet) return jsonResponse("error", "Submissions sheet not found");
    
    const rows = sheet.getDataRange().getValues();
    let deletedCount = 0;
    
    for (var i = rows.length - 1; i >= 1; i--) {
      var rowWeek = rows[i][1];
      var rowEmail = rows[i][3];
      
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      var targetWeek = data.weekStarting;
      if (targetWeek instanceof Date) {
        targetWeek = Utilities.formatDate(targetWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      if (String(rowWeek) === String(targetWeek) && 
          String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim()) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    
    // Force flush to ensure changes are committed
    if (deletedCount > 0) {
      SpreadsheetApp.flush();
    }
    
    // Log device activity
    const deviceId = data._deviceId || 'unknown';
    const deviceType = data._deviceType || 'desktop';
    logDeviceActivity(deviceId, deviceType, 'RESET_SUBMISSION_' + deletedCount);
    
    if (!skipEmail && deletedCount > 0) {
      sendResetNotification(data, deletedCount);
    }
    
    return jsonResponse("success", { 
      message: `Submission reset complete. Deleted ${deletedCount} records.`,
      deletedCount: deletedCount,
      teacherEmail: data.teacherEmail,
      week: data.weekStarting,
      resetByDevice: deviceId
    });
  } catch (error) {
    return jsonResponse("error", "Reset failed: " + error.toString());
  }
}

function handleDeleteTeacher(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REGISTRY_SHEET);
    
    if (!sheet) return jsonResponse("error", "Registry sheet not found");
    
    const rows = sheet.getDataRange().getValues();
    var deleted = false;
    
    for (var i = rows.length - 1; i >= 1; i--) {
      var rowId = rows[i][0];
      var rowEmail = rows[i][2];
      
      if ((data.teacherId && String(rowId) === String(data.teacherId)) ||
          (data.teacherEmail && String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim())) {
        sheet.deleteRow(i + 1);
        deleted = true;
        break;
      }
    }
    
    if (deleted) {
      SpreadsheetApp.flush();
      return jsonResponse("success", { 
        message: "Teacher deleted from registry",
        teacherId: data.teacherId,
        teacherEmail: data.teacherEmail
      });
    } else {
      return jsonResponse("error", "Teacher not found in registry");
    }
  } catch (error) {
    return jsonResponse("error", "Delete failed: " + error.toString());
  }
}

function handleUpdateTeacher(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REGISTRY_SHEET);
    
    if (!sheet) return jsonResponse("error", "Registry sheet not found");
    
    const rows = sheet.getDataRange().getValues();
    var updated = false;
    
    for (var i = 1; i < rows.length; i++) {
      var rowId = rows[i][0];
      var rowEmail = rows[i][2];
      
      if ((data.teacherId && String(rowId) === String(data.teacherId)) ||
          (data.teacherEmail && String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim())) {
        
        sheet.getRange(i + 1, 2).setValue(data.name || rows[i][1]);
        sheet.getRange(i + 1, 3).setValue(data.email || rows[i][2]);
        sheet.getRange(i + 1, 4).setValue(data.whatsapp || rows[i][3]);
        sheet.getRange(i + 1, 5).setValue(data.assignedClasses ? JSON.stringify(data.assignedClasses) : rows[i][4]);
        sheet.getRange(i + 1, 6).setValue(data.isClassTeacher ? JSON.stringify(data.isClassTeacher) : rows[i][5]);
        
        updated = true;
        break;
      }
    }
    
    if (updated) {
      SpreadsheetApp.flush();
      return jsonResponse("success", { 
        message: "Teacher updated successfully",
        teacherId: data.teacherId
      });
    } else {
      var newId = 'T' + new Date().getTime();
      sheet.appendRow([newId, data.name, data.email, data.whatsapp || '', 
                       data.assignedClasses ? JSON.stringify(data.assignedClasses) : '[]',
                       data.isClassTeacher ? JSON.stringify(data.isClassTeacher) : '']);
      
      SpreadsheetApp.flush();
      return jsonResponse("success", { 
        message: "New teacher added to registry",
        teacherId: newId
      });
    }
  } catch (error) {
    return jsonResponse("error", "Update failed: " + error.toString());
  }
}

function handleGetSubmissionDetails(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    
    if (!sheet) return jsonResponse("error", "Submissions sheet not found");
    
    const rows = sheet.getDataRange().getValues();
    var submissions = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var rowWeek = row[1];
      var rowEmail = row[3];
      
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      if (String(rowWeek) === String(data.weekStarting) && 
          String(rowEmail).toLowerCase().trim() === String(data.teacherEmail).toLowerCase().trim()) {
        
        submissions.push({
          timestamp: row[0],
          weekStarting: rowWeek,
          teacherName: row[2],
          teacherEmail: row[3],
          classLevel: row[4],
          section: row[5],
          subject: row[6],
          chapterName: row[7],
          topics: row[8],
          homework: row[9],
          device: row[11] || 'unknown',
          deviceId: row[12] || 'unknown'
        });
      }
    }
    
    return jsonResponse("success", { 
      submissions: submissions,
      count: submissions.length,
      teacherEmail: data.teacherEmail,
      weekStarting: data.weekStarting
    });
  } catch (error) {
    return jsonResponse("error", "Failed to get submission details: " + error.toString());
  }
}

function handleGetRequests(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(REQUESTS_SHEET);
    
    if (!sheet) return jsonResponse("success", { requests: [] });
    
    const rows = sheet.getDataRange().getValues();
    var requests = [];
    
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row[0]) continue;
      
      var week = row[4];
      if (week instanceof Date) {
        week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      var status = row[6] || 'pending';
      
      // Only return pending requests
      if (status === 'pending') {
        requests.push({
          id: row[0],
          teacherId: row[1],
          teacherName: row[2],
          teacherEmail: row[3],
          weekStarting: week,
          timestamp: row[5],
          status: status,
          reason: row[7] || ''
        });
      }
    }
    
    return jsonResponse("success", { 
      requests: requests,
      count: requests.length
    });
  } catch (error) {
    return jsonResponse("error", "Failed to get requests: " + error.toString());
  }
}

function handleSyncRegistry(data) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRY_SHEET);
    if (!sheet) {
      const newSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(REGISTRY_SHEET);
      newSheet.appendRow(["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo"]);
    }
    
    sheet.clearContents();
    sheet.appendRow(["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo"]);
    
    if(data.teachers) {
      data.teachers.forEach(function(t) {
        sheet.appendRow([t.id, t.name, t.email, t.whatsapp||"", JSON.stringify(t.assignedClasses), t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""]);
      });
    }
    
    SpreadsheetApp.flush();
    return jsonResponse("success", { 
      message: "Registry Synced",
      teacherCount: data.teachers ? data.teachers.length : 0
    });
  } catch (error) {
    return jsonResponse("error", "Sync failed: " + error.toString());
  }
}

function handleWarningEmails(data) {
  try {
    if (data.defaulters && Array.isArray(data.defaulters)) {
      var sentCount = 0;
      var failedCount = 0;
      
      data.defaulters.forEach(function(d) {
        try {
          var subject = "[REMINDER] Syllabus Submission Pending - Week of " + data.weekStarting;
          var html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">${SCHOOL_NAME}</h2>
                <p style="margin: 5px 0 0 0;">Syllabus Management System</p>
              </div>
              <div style="padding: 30px; background: #f9fafb;">
                <h3 style="color: #1f2937;">Pending Syllabus Submission</h3>
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                  <p style="margin: 0 0 10px 0;"><strong>Dear ${d.name},</strong></p>
                  <p style="margin: 0 0 15px 0;">Your syllabus plan for <strong>${data.weekStarting}</strong> is still pending.</p>
                  <a href="${data.portalLink || PORTAL_URL}" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
                    Submit Syllabus Now
                  </a>
                </div>
              </div>
            </div>
          `;
          
          GmailApp.sendEmail(d.email, subject, "", { 
            htmlBody: html, 
            name: EMAIL_SENDER_NAME,
            replyTo: REPLY_TO_EMAIL,
            cc: CC_EMAIL_GAUTAM
          });
          
          sentCount++;
          Utilities.sleep(500);
          
        } catch(e) {
          failedCount++;
          console.error("Failed to send warning email to " + d.email + ": " + e.toString());
        }
      });
      
      return jsonResponse("success", { 
        message: "Warning emails sent",
        sent: sentCount,
        failed: failedCount
      });
    } else {
      return jsonResponse("error", "No defaulters list provided");
    }
  } catch (error) {
    return jsonResponse("error", "Failed to send warnings: " + error.toString());
  }
}

function handlePdfDelivery(data) {
  try {
    if (!data.pdfBase64 || !data.recipient) {
      return jsonResponse("error", "Missing PDF data or recipient");
    }
    
    var base64Data = data.pdfBase64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }
    
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.PDF, data.filename);
    
    var subject = data.subject || "[OFFICIAL] Syllabus Report - Week of " + (data.weekStarting || getCurrentWeekMonday());
    var className = data.className ? " for " + data.className : "";
    
    var htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #059669; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">${SCHOOL_NAME}</h2>
          <p style="margin: 5px 0 0 0;">Academic Department</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h3 style="color: #1f2937;">Official Syllabus Report${className}</h3>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 15px 0;">Please find attached the official syllabus report${className} for the week of <strong>${data.weekStarting || 'current week'}</strong>.</p>
            <p style="margin: 0 0 15px 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 0;">This document is generated automatically by the SHS Syllabus Management System.</p>
          </div>
        </div>
      </div>
    `;
    
    GmailApp.sendEmail(data.recipient, subject, "", { 
      htmlBody: htmlBody, 
      attachments: [blob], 
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: CC_EMAIL_PSHARMA  // COMPILED PDF ALWAYS CC TO PSHARMA
    });
    
    return jsonResponse("success", { 
      message: "PDF delivered successfully",
      recipient: data.recipient,
      filename: data.filename
    });
  } catch (error) {
    return jsonResponse("error", "Failed to send PDF: " + error.toString());
  }
}

function handleTestWhatsApp(data) {
  try {
    if (!data.phoneNumber) {
      return jsonResponse("error", "Phone number required");
    }
    
    const message = data.message || "Test message from SHS Syllabus System";
    const result = sendSingleWhatsApp(data.phoneNumber, message);
    
    if (result.success) {
      return jsonResponse("success", { 
        message: "WhatsApp test sent successfully",
        phone: data.phoneNumber
      });
    } else {
      return jsonResponse("error", "WhatsApp test failed: " + result.error);
    }
  } catch (error) {
    return jsonResponse("error", "WhatsApp test failed: " + error.toString());
  }
}

// ==========================================
// EMAIL FUNCTIONS WITH CONFIGURED ADDRESSES
// ==========================================

function sendConfirmationEmail(data, submissionId) {
  try {
    const teacherEmail = data.teacherEmail;
    const teacherName = data.teacherName || 'Teacher';
    const weekStarting = data.weekStarting || 'current week';
    const deviceType = data._deviceType || data._device || 'device';
    
    const subject = `✓ Syllabus Submitted Successfully - ${weekStarting}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981, #34d399); color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">${SCHOOL_NAME}</h2>
          <p style="margin: 5px 0 0 0;">Syllabus Submission Confirmed</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0 0 10px 0;"><strong>Dear ${teacherName},</strong></p>
            <p style="margin: 0 0 15px 0;">Your syllabus plan for <strong>${weekStarting}</strong> has been successfully submitted.</p>
            <p style="margin: 0 0 15px 0;"><strong>Submission ID:</strong> ${submissionId}</p>
            <p style="margin: 0 0 15px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 0 0 15px 0;"><strong>Submitted from:</strong> ${deviceType}</p>
            <p style="margin: 0 0 15px 0;"><strong>Number of Classes:</strong> ${data.plans ? data.plans.length : 1}</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
              View in Portal
            </a>
          </div>
          <p style="font-size: 12px; color: #6b7280; text-align: center;">
            This is an automated confirmation email from ${SCHOOL_NAME}
          </p>
        </div>
      </div>
    `;
    
    GmailApp.sendEmail(teacherEmail, subject, "", { 
      htmlBody: htmlBody, 
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: CC_EMAIL_GAUTAM
    });
    
  } catch (error) {
    console.error("Confirmation email failed:", error);
  }
}

function sendResubmitRequestNotification(data, requestId) {
  try {
    const subject = `[ACTION REQUIRED] Resubmit Request - ${data.teacherName} - ${data.weekStarting}`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
          .header { background: #8b5cf6; color: white; padding: 25px; text-align: center; }
          .content { padding: 30px; background: #f9fafb; }
          .details { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
          .action { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b; }
          .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          td:first-child { font-weight: 600; color: #374151; width: 140px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0;">📝 Resubmit Request Pending</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${SCHOOL_NAME}</p>
        </div>
        
        <div class="content">
          <h2 style="color: #1f2937; margin-top: 0;">Teacher Requested Syllabus Modification</h2>
          
          <div class="details">
            <h3 style="color: #4c1d95; margin-top: 0;">Request Details</h3>
            <table>
              <tr><td>Teacher:</td><td>${data.teacherName}</td></tr>
              <tr><td>Email:</td><td>${data.teacherEmail}</td></tr>
              <tr><td>Week:</td><td>${data.weekStarting}</td></tr>
              <tr><td>Request ID:</td><td>${requestId}</td></tr>
              <tr><td>Timestamp:</td><td>${new Date().toLocaleString()}</td></tr>
              <tr><td>Reason:</td><td>${data.reason || 'Modification requested'}</td></tr>
            </table>
          </div>
          
          <div class="action">
            <h3 style="color: #92400e; margin-top: 0;">⚠️ Action Required</h3>
            <p>The teacher <strong>${data.teacherName}</strong> has requested permission to resubmit their syllabus for <strong>${data.weekStarting}</strong>.</p>
            <p><strong>Current Status:</strong> The teacher cannot submit until you approve this request.</p>
            <p><strong>Your Action:</strong> Review and approve/reject this request in the admin panel.</p>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${PORTAL_URL}" class="button">Go to Admin Panel</a>
            </div>
            
            <p style="font-size: 14px; color: #92400e;">
              <strong>Note:</strong> Upon approval, the teacher's existing submission will be deleted and they can submit a new plan.
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #6b7280;">
            <p style="margin: 5px 0;">
              This notification was generated automatically by the Syllabus Management System.
            </p>
            <p style="margin: 5px 0;">
              Request ID: ${requestId} | Generated at: ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const plainText = `
RESUBMIT REQUEST PENDING - ${SCHOOL_NAME}

Teacher: ${data.teacherName}
Email: ${data.teacherEmail}
Week: ${data.weekStarting}
Request ID: ${requestId}
Timestamp: ${new Date().toLocaleString()}
Reason: ${data.reason || 'Modification requested'}

ACTION REQUIRED:
The teacher has requested permission to resubmit their syllabus. 
You must approve this request in the admin panel before they can submit again.

Upon approval, the teacher's existing submission will be deleted.

Admin Panel: ${PORTAL_URL}

This is an automated notification.
    `;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, plainText, { 
      htmlBody: htmlBody, 
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: CC_EMAIL_GAUTAM  // CC to Gautam for resubmit requests
    });
    
    Logger.log(`✅ Resubmit request notification sent to admin for request ${requestId}`);
    
  } catch (error) {
    Logger.log(`❌ Failed to send resubmit notification: ${error.toString()}`);
  }
}

function sendApprovalEmail(data) {
  try {
    const teacherEmail = data.teacherEmail;
    if (!teacherEmail) {
      Logger.log("No teacher email provided, skipping approval email.");
      return false;
    }

    const teacherName = data.teacherName || 'Teacher';
    const weekStarting = data.weekStarting || 'current week';
    const requestId = data.requestId || 'N/A';
    
    const subject = `✅ Resubmission Request APPROVED - Week of ${weekStarting}`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #10b981, #34d399); color: white; padding: 25px; text-align: center; }
          .content { padding: 30px; background: #f9fafb; }
          .status { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
          .details { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
          .action { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0ea5e9; }
          .button { display: inline-block; background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          td:first-child { font-weight: 600; color: #374151; width: 160px; }
          .note { background: #fee2e2; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0;">✅ Resubmission APPROVED</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${SCHOOL_NAME}</p>
        </div>
        
        <div class="content">
          <h2 style="color: #1f2937; margin-top: 0;">Dear ${teacherName},</h2>
          
          <div class="status">
            <h3 style="color: #065f46; margin-top: 0;">✓ Request Status: APPROVED</h3>
            <p>Your request to resubmit the syllabus has been reviewed and approved by the administration.</p>
          </div>
          
          <div class="details">
            <h3 style="color: #1d4ed8; margin-top: 0;">Approval Details</h3>
            <table>
              <tr><td>Request ID:</td><td>${requestId}</td></tr>
              <tr><td>Week Starting:</td><td>${weekStarting}</td></tr>
              <tr><td>Approval Date:</td><td>${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
              <tr><td>Approval Time:</td><td>${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td></tr>
            </table>
          </div>
          
          <div class="note">
            <h4 style="color: #991b1b; margin-top: 0;">⚠️ Important Note</h4>
            <p>Your previous submission for <strong>${weekStarting}</strong> has been cleared from the system.</p>
            <p><strong>You must submit a new syllabus plan</strong> using the link below.</p>
          </div>
          
          <div class="action">
            <h3 style="color: #0369a1; margin-top: 0;">🚀 Next Steps - Required Action</h3>
            <p>Please submit your updated syllabus plan at your earliest convenience:</p>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${PORTAL_URL}" class="button">📝 Submit Updated Syllabus Now</a>
            </div>
            
            <p style="text-align: center; color: #6b7280;">
              or visit: <a href="${PORTAL_URL}">${PORTAL_URL}</a>
            </p>
          </div>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              <strong>Need Help?</strong><br>
              Contact academic department: <a href="mailto:${ACADEMIC_EMAIL}">${ACADEMIC_EMAIL}</a>
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #6b7280;">
            <p style="margin: 5px 0;">
              This is an automated notification from the ${SCHOOL_NAME} Syllabus Management System.
            </p>
            <p style="margin: 5px 0;">
              Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const plainText = `
RESUBMISSION REQUEST APPROVED - ${SCHOOL_NAME}

Dear ${teacherName},

Your request to resubmit the syllabus for ${weekStarting} has been APPROVED.

✅ REQUEST STATUS: APPROVED
📋 REQUEST ID: ${requestId}
📅 WEEK: ${weekStarting}
⏰ APPROVAL TIME: ${new Date().toLocaleString()}

⚠ IMPORTANT:
Your previous submission for ${weekStarting} has been cleared from the system.
You MUST submit a new syllabus plan.

🚀 NEXT STEPS:
1. Log in to the portal: ${PORTAL_URL}
2. Navigate to "Submit Syllabus" section
3. Select week: ${weekStarting}
4. Enter complete details for each class
5. Submit your updated syllabus plan

You will receive a confirmation email after submission.

Need Help? Contact academic department: ${ACADEMIC_EMAIL}

This is an automated notification. Please do not reply.

${SCHOOL_NAME}
    `;
    
    // Send email to teacher
    GmailApp.sendEmail(teacherEmail, subject, plainText, {
      htmlBody: htmlBody,
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: CC_EMAIL_GAUTAM  // CC to Gautam for approval notifications
    });
    
    Logger.log(`✅ Approval email sent to ${teacherEmail} for request ${requestId}`);
    
    // Also send a copy to admin for record
    sendApprovalConfirmationToAdmin(data, teacherEmail);
    
    return true;
    
  } catch (error) {
    Logger.log(`❌ Failed to send approval email to ${data.teacherEmail}: ${error.toString()}`);
    
    // Try a simpler email as fallback
    try {
      const simpleSubject = `Resubmission Approved - ${data.weekStarting}`;
      const simpleBody = `Dear ${data.teacherName},\n\nYour resubmission request for ${data.weekStarting} has been approved.\n\nPlease submit your updated syllabus at: ${PORTAL_URL}\n\n${SCHOOL_NAME}`;
      
      GmailApp.sendEmail(data.teacherEmail, simpleSubject, simpleBody, {
        cc: CC_EMAIL_GAUTAM
      });
      Logger.log(`✅ Fallback approval email sent to ${data.teacherEmail}`);
      return true;
    } catch (fallbackError) {
      Logger.log(`❌ Fallback email also failed: ${fallbackError.toString()}`);
      return false;
    }
  }
}

function sendApprovalConfirmationToAdmin(data, teacherEmail) {
  try {
    const subject = `[CONFIRMATION] Resubmission Approved - ${data.teacherName} - ${data.weekStarting}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">Resubmission Approval Confirmation</h2>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${SCHOOL_NAME} - Administrator Copy</p>
        </div>
        
        <div style="padding: 30px; background: #f9fafb;">
          <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0;">Approval Details</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Teacher:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${data.teacherName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Email:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${teacherEmail}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Week:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${data.weekStarting}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Request ID:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${data.requestId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Approved At:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${new Date().toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Approved By Device:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${data._deviceId || 'Admin Panel'}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: 600; color: #374151;">Previous Submission:</td>
                <td style="padding: 10px; color: #dc2626; font-weight: 600;">DELETED</td>
              </tr>
            </table>
            
            <div style="background: #d1fae5; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; color: #065f46; font-weight: 600;">
                ✅ Action Completed:
              </p>
              <p style="margin: 5px 0 0 0; color: #065f46;">
                • Request marked as "approved" in Requests sheet<br>
                • Previous submission deleted<br>
                • Confirmation email sent to teacher<br>
                • Teacher can now submit updated syllabus
              </p>
            </div>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #6b7280;">
            <p style="margin: 5px 0;">
              This confirmation is automatically generated when a resubmission request is approved.
            </p>
            <p style="margin: 5px 0;">
              ${SCHOOL_NAME} Syllabus Management System
            </p>
          </div>
        </div>
      </div>
    `;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, "", {
      htmlBody: htmlBody,
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: CC_EMAIL_GAUTAM
    });
    
    Logger.log(`✅ Admin confirmation sent for approval of request ${data.requestId}`);
    
  } catch (error) {
    Logger.log(`❌ Failed to send admin confirmation: ${error.toString()}`);
  }
}

function sendResetNotification(data, deletedCount) {
  try {
    const subject = `[SYSTEM] Submission Reset - ${data.teacherName} - ${data.weekStarting}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif;">
        <h3>Submission Reset Completed</h3>
        <p><strong>Teacher:</strong> ${data.teacherName} (${data.teacherEmail})</p>
        <p><strong>Week:</strong> ${data.weekStarting}</p>
        <p><strong>Records Deleted:</strong> ${deletedCount}</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Action:</strong> Manual reset by administrator</p>
        <p><strong>Reset by Device:</strong> ${data._deviceId || 'unknown'}</p>
      </div>
    `;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, "", { 
      htmlBody: htmlBody,
      cc: CC_EMAIL_GAUTAM
    });
    
  } catch (error) {
    console.error("Reset notification failed:", error);
  }
}

// ==========================================
// AUTOMATION FUNCTIONS
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
  
  ScriptApp.newTrigger('autoCleanupBackupSheets')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(3)
      .create();
}

function autoCheckAndSendWarnings() {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Send reminders ONLY on Thursday(4), Friday(5), Saturday(6)
    if (dayOfWeek < 4 || dayOfWeek > 6) {
      Logger.log('Not a reminder day (Thursday/Friday/Saturday). Today is: ' + dayOfWeek);
      return;
    }
    
    // Always target NEXT Monday (upcoming week)
    const targetWeek = getNextMondayDate();
    
    Logger.log(`Running auto warnings for UPCOMING week: ${targetWeek}`);
    
    // Get all teachers and their assignments
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(REGISTRY_SHEET);
    const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    
    if (!regSheet || !subSheet) {
      Logger.log("Sheets not found");
      return;
    }
    
    // Get all active teachers
    const teachers = [];
    const regData = regSheet.getDataRange().getValues();
    for (let i = 1; i < regData.length; i++) {
      if (regData[i][0] && regData[i][2]) {
        try {
          teachers.push({
            id: regData[i][0],
            name: regData[i][1],
            email: regData[i][2],
            whatsapp: regData[i][3],
            assignedClasses: regData[i][4] ? JSON.parse(regData[i][4]) : [],
            isClassTeacher: regData[i][5] ? JSON.parse(regData[i][5]) : undefined
          });
        } catch (e) {
          Logger.log(`Error parsing teacher ${i}: ${e}`);
        }
      }
    }
    
    // Get submissions for the UPCOMING week
    const submittedEmails = new Set();
    const subData = subSheet.getDataRange().getValues();
    
    for (let i = 1; i < subData.length; i++) {
      let rowWeek = subData[i][1];
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      if (rowWeek === targetWeek && subData[i][3]) {
        submittedEmails.add(subData[i][3].toLowerCase().trim());
      }
    }
    
    // Find defaulters
    const defaulters = teachers.filter(teacher => 
      !submittedEmails.has(teacher.email.toLowerCase().trim())
    );
    
    Logger.log(`Total teachers: ${teachers.length}`);
    Logger.log(`Already submitted for ${targetWeek}: ${submittedEmails.size}`);
    Logger.log(`Defaulters for ${targetWeek}: ${defaulters.length}`);
    
    // Send warning emails to defaulters
    if (defaulters.length > 0) {
      let sentCount = 0;
      let failedCount = 0;
      
      for (const defaulter of defaulters) {
        try {
          // Get assigned classes
          let classesText = 'All assigned classes';
          if (defaulter.assignedClasses && defaulter.assignedClasses.length > 0) {
            classesText = defaulter.assignedClasses
              .map(cls => `${cls.classLevel}${cls.section ? `-${cls.section}` : ''} (${cls.subject})`)
              .join(', ');
          }
          
          const subject = `[REMINDER] Syllabus for UPCOMING Week (${targetWeek}) Pending`;
          
          const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">${SCHOOL_NAME}</h2>
                <p style="margin: 5px 0 0 0;">Syllabus Reminder for UPCOMING Week</p>
              </div>
              <div style="padding: 30px; background: #f9fafb;">
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                  <p style="margin: 0 0 10px 0;"><strong>Dear ${defaulter.name},</strong></p>
                  <p style="margin: 0 0 15px 0;">Your syllabus plan for the <strong>upcoming week (${targetWeek})</strong> is still pending.</p>
                  <p style="margin: 0 0 15px 0;"><strong>Classes:</strong> ${classesText}</p>
                  <a href="${PORTAL_URL}" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
                    Submit Syllabus for ${targetWeek}
                  </a>
                </div>
              </div>
            </div>
          `;
          
          GmailApp.sendEmail(defaulter.email, subject, "", {
            htmlBody: htmlBody,
            name: EMAIL_SENDER_NAME,
            replyTo: REPLY_TO_EMAIL,
            cc: CC_EMAIL_GAUTAM
          });
          
          sentCount++;
          Utilities.sleep(1000);
          
        } catch (e) {
          failedCount++;
          Logger.log(`Failed to send to ${defaulter.email}: ${e}`);
        }
      }
      
      Logger.log(`Auto warnings sent: ${sentCount} successful, ${failedCount} failed`);
      logAutoWarnings(targetWeek, defaulters.length, sentCount, failedCount, dayOfWeek);
      
    } else {
      Logger.log(`No defaulters found for upcoming week ${targetWeek}`);
    }
    
  } catch (error) {
    Logger.log("Error in autoCheckAndSendWarnings: " + error.toString());
    sendErrorNotification("Auto Warnings", error.toString());
  }
}

function autoSendCompilations() {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Run only on Saturday (6) at 9 PM
    if (dayOfWeek !== 6) {
      Logger.log('Not Saturday. Today is: ' + getDayName(dayOfWeek));
      return;
    }
    
    // Target CURRENT week (that just ended)
    const targetWeek = getCurrentWeekMonday();
    const weekRange = getWeekDateRange(targetWeek);
    
    Logger.log(`Running auto compilations for week: ${targetWeek} (${weekRange})`);
    
    // Get ALL data
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(REGISTRY_SHEET);
    const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    
    if (!regSheet || !subSheet) {
      Logger.log("Sheets not found");
      return;
    }
    
    // 1. Get all teachers with their assignments
    const allTeachers = [];
    const classTeachers = {};
    
    const regData = regSheet.getDataRange().getValues();
    for (let i = 1; i < regData.length; i++) {
      if (regData[i][0] && regData[i][2]) {
        try {
          const teacher = {
            id: regData[i][0],
            name: regData[i][1],
            email: regData[i][2],
            whatsapp: regData[i][3] || '',
            assignedClasses: regData[i][4] ? JSON.parse(regData[i][4]) : [],
            isClassTeacher: regData[i][5] ? JSON.parse(regData[i][5]) : undefined
          };
          
          allTeachers.push(teacher);
          
          // Store class teacher information
          if (teacher.isClassTeacher) {
            teacher.isClassTeacher.forEach(ct => {
              const classKey = `${ct.classLevel}${ct.section ? `-${ct.section}` : ''}`;
              if (!classTeachers[classKey]) {
                classTeachers[classKey] = [];
              }
              classTeachers[classKey].push({
                name: teacher.name,
                email: teacher.email,
                whatsapp: teacher.whatsapp
              });
            });
          }
        } catch (e) {
          Logger.log(`Error parsing teacher ${i}: ${e}`);
        }
      }
    }
    
    // 2. Get all submissions for CURRENT week
    const submissions = [];
    const subData = subSheet.getDataRange().getValues();
    
    for (let i = 1; i < subData.length; i++) {
      let rowWeek = subData[i][1];
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      
      if (rowWeek === targetWeek) {
        submissions.push({
          teacherEmail: subData[i][3].toLowerCase().trim(),
          teacherName: subData[i][2],
          classLevel: subData[i][4],
          section: subData[i][5],
          subject: subData[i][6],
          chapterName: subData[i][7],
          topics: subData[i][8],
          homework: subData[i][9],
          timestamp: subData[i][0]
        });
      }
    }
    
    // 3. Create class-wise comprehensive reports
    const reports = createClassWiseReports(allTeachers, submissions, targetWeek, weekRange);
    
    if (reports.length === 0) {
      Logger.log("No classes found for compilation");
      sendNoDataNotification(targetWeek);
      return;
    }
    
    // 4. Send reports to class teachers
    let totalSent = 0;
    let totalFailed = 0;
    let whatsappSent = 0;
    let whatsappFailed = 0;
    
    for (const report of reports) {
      const className = report.className;
      const classTeacherInfo = classTeachers[className] || [];
      
      // Prepare recipients
      const recipients = new Set();
      const whatsappNumbers = [];
      
      // Add class teachers
      classTeacherInfo.forEach(ct => {
        if (ct.email) recipients.add(ct.email);
        if (ct.whatsapp) whatsappNumbers.push(ct.whatsapp);
      });
      
      // Always include admin
      recipients.add(ADMIN_EMAIL);
      
      // Send email with PDF attachment (CC to PSHARMA for compiled PDFs)
      for (const recipient of recipients) {
        try {
          const emailResult = sendClassReportEmail(recipient, report, targetWeek, weekRange);
          if (emailResult.success) {
            totalSent++;
          } else {
            totalFailed++;
          }
          Utilities.sleep(500);
        } catch (emailError) {
          totalFailed++;
          Logger.log(`Email error: ${emailError}`);
        }
      }
      
      // Send WhatsApp messages to class teachers
      if (whatsappNumbers.length > 0 && WHATSAPP_CONFIG.enabled) {
        const whatsappResult = sendClassReportWhatsApp(whatsappNumbers, report, targetWeek, weekRange);
        if (whatsappResult.success) {
          whatsappSent += whatsappResult.sent;
          whatsappFailed += whatsappResult.failed;
        }
      }
    }
    
    // 5. Send summary to admin (CC to Gautam)
    sendCompilationSummary(reports, targetWeek, weekRange, totalSent, totalFailed, whatsappSent, whatsappFailed);
    
    // 6. Log everything
    logAutoCompilations(targetWeek, reports.length, totalSent, totalFailed, whatsappSent, whatsappFailed);
    
    Logger.log(`Auto compilations completed for ${targetWeek}`);
    Logger.log(`Emails: ${totalSent} sent, ${totalFailed} failed`);
    Logger.log(`WhatsApp: ${whatsappSent} sent, ${whatsappFailed} failed`);
    
  } catch (error) {
    Logger.log("Error in autoSendCompilations: " + error.toString());
    sendErrorNotification("Auto Compilations", error.toString());
  }
}

// ==========================================
// COMPILATION HELPER FUNCTIONS
// ==========================================

function getDayName(dayIndex) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dayIndex];
}

function getWeekDateRange(startDate) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  
  const format = (date) => Utilities.formatDate(date, Session.getScriptTimeZone(), "dd-MMM");
  return `${format(start)}_to_${format(end)}`;
}

function createClassWiseReports(allTeachers, submissions, targetWeek, weekRange) {
  // Group all assignments by class
  const classAssignments = {};
  
  // First, collect ALL assignments from all teachers
  allTeachers.forEach(teacher => {
    teacher.assignedClasses.forEach(assignment => {
      const className = `${assignment.classLevel}${assignment.section ? `-${assignment.section}` : ''}`;
      const subjectKey = assignment.subject;
      
      if (!classAssignments[className]) {
        classAssignments[className] = {
          className: className,
          classLevel: assignment.classLevel,
          section: assignment.section || '',
          subjects: {},
          totalSubjects: 0,
          submittedCount: 0,
          missingCount: 0
        };
      }
      
      if (!classAssignments[className].subjects[subjectKey]) {
        classAssignments[className].subjects[subjectKey] = [];
        classAssignments[className].totalSubjects++;
      }
      
      classAssignments[className].subjects[subjectKey].push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        teacherWhatsapp: teacher.whatsapp || '',
        isSubmitted: false,
        submissionData: null
      });
    });
  });
  
  // Match with submissions
  submissions.forEach(submission => {
    const className = `${submission.classLevel}${submission.section ? `-${submission.section}` : ''}`;
    const subjectKey = submission.subject;
    
    if (classAssignments[className] && classAssignments[className].subjects[subjectKey]) {
      const teacherIndex = classAssignments[className].subjects[subjectKey]
        .findIndex(t => t.teacherEmail.toLowerCase() === submission.teacherEmail.toLowerCase());
      
      if (teacherIndex !== -1) {
        classAssignments[className].subjects[subjectKey][teacherIndex].isSubmitted = true;
        classAssignments[className].subjects[subjectKey][teacherIndex].submissionData = {
          chapterName: submission.chapterName,
          topics: submission.topics,
          homework: submission.homework,
          timestamp: submission.timestamp
        };
        classAssignments[className].submittedCount++;
      }
    }
  });
  
  // Calculate missing counts and create reports
  const reports = [];
  
  for (const className in classAssignments) {
    const classData = classAssignments[className];
    classData.missingCount = classData.totalSubjects - classData.submittedCount;
    classData.submissionRate = classData.totalSubjects > 0 ? 
      Math.round((classData.submittedCount / classData.totalSubjects) * 100) : 0;
    
    // Create PDF for this class
    const pdfContent = createClassPdfContent(classData, targetWeek, weekRange);
    const pdfFilename = `${className.replace('-', '_')}_${weekRange}.pdf`;
    const pdfBlob = createPdfBlob(pdfContent, pdfFilename);
    
    reports.push({
      className: className,
      classLevel: classData.classLevel,
      section: classData.section,
      week: targetWeek,
      weekRange: weekRange,
      totalSubjects: classData.totalSubjects,
      submittedCount: classData.submittedCount,
      missingCount: classData.missingCount,
      submissionRate: classData.submissionRate,
      subjects: classData.subjects,
      pdfBlob: pdfBlob,
      pdfFilename: pdfFilename
    });
  }
  
  return reports;
}

function createClassPdfContent(classData, targetWeek, weekRange) {
  const now = new Date().toLocaleString();
  const className = classData.className;
  
  let content = `
    ${SCHOOL_NAME} - SYLLABUS REPORT
    ${'='.repeat(50)}
    
    Class: ${className}
    Week: ${targetWeek} (${weekRange})
    Generated: ${now}
    Report Type: Complete Weekly Syllabus
    
    SUMMARY
    ${'-'.repeat(30)}
    Total Subjects: ${classData.totalSubjects}
    Submitted: ${classData.submittedCount}
    Missing: ${classData.missingCount}
    Completion Rate: ${classData.submissionRate}%
    
    ${'='.repeat(50)}
    
    DETAILED SYLLABUS PLAN
    ${'-'.repeat(30)}
    
  `;
  
  // Sort subjects alphabetically
  const sortedSubjects = Object.keys(classData.subjects).sort();
  
  sortedSubjects.forEach((subject, subjectIndex) => {
    const teachers = classData.subjects[subject];
    
    teachers.forEach((teacher, teacherIndex) => {
      content += `
    ${subjectIndex + 1}.${teacherIndex + 1} ${subject}
       Teacher: ${teacher.teacherName}
       Status: ${teacher.isSubmitted ? '✓ SUBMITTED' : '✗ NOT SUBMITTED'}
      `;
      
      if (teacher.isSubmitted && teacher.submissionData) {
        const sub = teacher.submissionData;
        content += `
       Chapter: ${sub.chapterName || 'N/A'}
       Topics: ${sub.topics || 'N/A'}
       Homework: ${sub.homework || 'N/A'}
       Submitted: ${sub.timestamp || 'N/A'}
        `;
      } else {
        content += `
       Chapter: Not Submitted
       Topics: Not Submitted
       Homework: Not Submitted
       Submitted: Not Submitted
        `;
      }
      
      content += `\n`;
    });
  });
  
  content += `
    ${'='.repeat(50)}
    
    NOTES:
    • This report is generated automatically every Saturday at 9 PM
    • Includes ALL subjects for class ${className}
    • Missing entries indicate syllabus not submitted
    • Class teacher should share this with students/parents
    
    ${'='.repeat(50)}
    
    ${SCHOOL_NAME}
    Academic Department
    Generated by Syllabus Management System
    ${now}
  `;
  
  return content;
}

function createPdfBlob(content, filename) {
  try {
    // Create a Google Doc and convert to PDF
    const doc = DocumentApp.create(`Temp_Report_${Date.now()}`);
    const body = doc.getBody();
    body.setText(content);
    doc.saveAndClose();
    
    const pdf = doc.getAs(MimeType.PDF);
    pdf.setName(filename);
    
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    return pdf;
    
  } catch (error) {
    // Fallback to text blob
    Logger.log('PDF creation failed, using text fallback:', error);
    return Utilities.newBlob(content, MimeType.PLAIN_TEXT, filename.replace('.pdf', '.txt'));
  }
}

function sendClassReportEmail(recipient, report, targetWeek, weekRange) {
  try {
    const subject = `[CLASS REPORT] Syllabus for ${report.className} - Week ${weekRange}`;
    const isClassTeacher = recipient !== ADMIN_EMAIL;
    
    let greeting = "Dear Administrator,";
    let instructions = "Please find attached the class-wise syllabus report.";
    
    if (isClassTeacher) {
      greeting = `Dear Class Teacher of ${report.className},`;
      instructions = `
        Please find attached the complete syllabus report for your class.
        You should review and share it with your class students/parents.
      `;
    }
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #059669; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">${SCHOOL_NAME}</h2>
          <p style="margin: 5px 0 0 0;">Class Syllabus Report</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937;">${report.className} - Week of ${targetWeek}</h3>
            <p>${greeting}</p>
            <p>${instructions}</p>
            <p><strong>File:</strong> ${report.pdfFilename}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;
    
    // For compiled PDFs, CC to PSHARMA, for others use appropriate CC
    const ccEmail = isClassTeacher ? CC_EMAIL_GAUTAM : CC_EMAIL_PSHARMA;
    
    GmailApp.sendEmail(recipient, subject, "", {
      htmlBody: htmlBody,
      attachments: [report.pdfBlob],
      name: EMAIL_SENDER_NAME,
      replyTo: REPLY_TO_EMAIL,
      cc: ccEmail
    });
    
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ==========================================
// WHATSAPP FUNCTIONS
// ==========================================

function sendClassReportWhatsApp(whatsappNumbers, report, targetWeek, weekRange) {
  let sentCount = 0;
  let failedCount = 0;
  
  if (!WHATSAPP_CONFIG.enabled) {
    return { success: false, sent: 0, failed: 0, error: "Disabled" };
  }
  
  const className = report.className;
  const message = `📚 *${SCHOOL_NAME} Syllabus Report*\n\nClass: ${className}\nWeek: ${weekRange}\nSubjects: ${report.submittedCount}/${report.totalSubjects} submitted\n\nYour class syllabus report has been emailed to you. Please review and share with students.\n\n*${SCHOOL_NAME}*`;
  
  for (const phoneNumber of whatsappNumbers) {
    try {
      let result = false;
      
      if (WHATSAPP_CONFIG.useCallMeBot) {
        result = sendWhatsAppViaCallMeBot(phoneNumber, message, WHATSAPP_CONFIG.callmebotApiKey);
      } else if (WHATSAPP_CONFIG.useTwilio) {
        result = sendWhatsAppViaTwilio(phoneNumber, message, WHATSAPP_CONFIG);
      } else if (WHATSAPP_CONFIG.useWhatsAppBusiness) {
        result = sendWhatsAppViaBusinessAPI(phoneNumber, message, WHATSAPP_CONFIG);
      }
      
      if (result) {
        sentCount++;
        Logger.log(`WhatsApp sent to ${phoneNumber} for ${className}`);
      } else {
        failedCount++;
      }
      
      Utilities.sleep(2000);
      
    } catch (error) {
      failedCount++;
      Logger.log(`WhatsApp error: ${error}`);
    }
  }
  
  return { success: true, sent: sentCount, failed: failedCount };
}

function sendSingleWhatsApp(phoneNumber, message) {
  try {
    let result = false;
    
    if (WHATSAPP_CONFIG.useCallMeBot) {
      result = sendWhatsAppViaCallMeBot(phoneNumber, message, WHATSAPP_CONFIG.callmebotApiKey);
    } else if (WHATSAPP_CONFIG.useTwilio) {
      result = sendWhatsAppViaTwilio(phoneNumber, message, WHATSAPP_CONFIG);
    } else if (WHATSAPP_CONFIG.useWhatsAppBusiness) {
      result = sendWhatsAppViaBusinessAPI(phoneNumber, message, WHATSAPP_CONFIG);
    }
    
    return { success: result, error: result ? null : "Failed to send" };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sendWhatsAppViaCallMeBot(phoneNumber, message, apiKey) {
  try {
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    const url = `https://api.callmebot.com/whatsapp.php`;
    
    const payload = {
      'phone': cleanNumber,
      'text': message,
      'apikey': apiKey
    };
    
    const options = {
      'method': 'post',
      'payload': payload,
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      return true;
    } else {
      Logger.log(`CallMeBot failed: ${responseCode}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`CallMeBot error: ${error}`);
    return false;
  }
}

function sendWhatsAppViaTwilio(phoneNumber, message, config) {
  try {
    const cleanNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
    const toNumber = `whatsapp:${cleanNumber}`;
    
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
    
    const payload = {
      'To': toNumber,
      'From': config.twilioWhatsAppNumber,
      'Body': message
    };
    
    const options = {
      'method': 'post',
      'headers': {
        'Authorization': 'Basic ' + Utilities.base64Encode(`${config.twilioAccountSid}:${config.twilioAuthToken}`)
      },
      'payload': payload,
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200 || responseCode === 201) {
      return true;
    } else {
      Logger.log(`Twilio failed: ${responseCode}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`Twilio error: ${error}`);
    return false;
  }
}

function sendWhatsAppViaBusinessAPI(phoneNumber, message, config) {
  try {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    const url = `https://graph.facebook.com/v17.0/${config.whatsappBusinessPhoneId}/messages`;
    
    const payload = {
      'messaging_product': 'whatsapp',
      'to': cleanNumber,
      'type': 'text',
      'text': {
        'body': message
      }
    };
    
    const options = {
      'method': 'post',
      'headers': {
        'Authorization': `Bearer ${config.whatsappBusinessToken}`,
        'Content-Type': 'application/json'
      },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      return true;
    } else {
      Logger.log(`WhatsApp Business API failed: ${responseCode}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`WhatsApp Business API error: ${error}`);
    return false;
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function ensureEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Core sheets
  if (!ss.getSheetByName(SUBMISSIONS_SHEET)) {
    const subSheet = ss.insertSheet(SUBMISSIONS_SHEET);
    subSheet.appendRow(["Timestamp", "Week", "Name", "Email", "Class", "Sec", "Sub", "Chap", "Topics", "HW", "SubmissionID", "Device", "DeviceID", "Status"]);
  }
  
  if (!ss.getSheetByName(REGISTRY_SHEET)) {
    const regSheet = ss.insertSheet(REGISTRY_SHEET);
    regSheet.appendRow(["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo", "LastUpdated"]);
  }
  
  if (!ss.getSheetByName(REQUESTS_SHEET)) {
    const reqSheet = ss.insertSheet(REQUESTS_SHEET);
    reqSheet.appendRow(["ID", "TeacherID", "Name", "Email", "Week", "Timestamp", "Status", "Reason"]);
  }
  
  // Backup sheets
  try {
    ensureSheetExists(BACKUP_SHEET, ['Timestamp', 'SubmissionID', 'Action', 'Teacher', 'Email', 'Week', 'FullData']);
    ensureSheetExists(AUDIT_SHEET, ['Timestamp', 'Action', 'SubmissionID', 'Teacher', 'Email', 'Week', 'IP', 'Device', 'DeviceID', 'Status']);
    ensureSheetExists(DEVICE_LOG_SHEET, ['Timestamp', 'DeviceID', 'DeviceType', 'Action', 'IP', 'UserAgent']);
    ensureSheetExists(SYNC_LOG_SHEET, ['Timestamp', 'DeviceID', 'DeviceType', 'Action', 'Result', 'DataSize']);
    ensureSheetExists('EMAIL_LOGS', ['Timestamp', 'Type', 'Week', 'Sent', 'Failed', 'Total']);
    ensureSheetExists('PDF_LOGS', ['Timestamp', 'Recipient', 'Filename', 'Week', 'Status']);
  } catch (e) {}
}

function jsonResponse(res, dataOrMsg) {
  var output = { 
    result: res,
    serverTime: new Date().toISOString(),
    version: "v11.3"
  };
  
  if (typeof dataOrMsg === 'string') {
    output.message = dataOrMsg;
  } else {
    Object.assign(output, dataOrMsg);
  }
  
  var response = ContentService.createTextOutput(JSON.stringify(output));
  response.setMimeType(ContentService.MimeType.JSON);
  
  // Set CORS headers individually
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  
  return response;
}

function getCurrentWeekMonday() {
  var d = new Date();
  var day = d.getDay();
  var diff = d.getDate() - day + (day === 0 ? -6 : 1);
  var monday = new Date(d.setDate(diff));
  return Utilities.formatDate(monday, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getNextMondayDate() {
  var d = new Date();
  var day = d.getDay();
  var diff = (7 - day + 1) % 7;
  if (diff === 0) diff = 7;
  var nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return Utilities.formatDate(nextMon, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function verifySubmissionById(submissionId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    if (subSheet) {
      const subData = subSheet.getDataRange().getValues();
      for (let i = 1; i < subData.length; i++) {
        if (subData[i][10] === submissionId) {
          return jsonResponse("success", { 
            verified: true, 
            foundIn: 'PRIMARY',
            timestamp: subData[i][0],
            teacher: subData[i][2],
            device: subData[i][11] || 'unknown'
          });
        }
      }
    }
    
    const backupSheet = ss.getSheetByName(BACKUP_SHEET);
    if (backupSheet) {
      const backupData = backupSheet.getDataRange().getValues();
      for (let i = 1; i < backupData.length; i++) {
        if (backupData[i][1] === submissionId) {
          return jsonResponse("success", { 
            verified: true, 
            foundIn: 'BACKUP',
            timestamp: backupData[i][0]
          });
        }
      }
    }
    
    return jsonResponse("success", { 
      verified: false, 
      message: "Submission not found"
    });
    
  } catch (error) {
    return jsonResponse("error", "Verification failed: " + error.toString());
  }
}

// ==========================================
// LOGGING & NOTIFICATION FUNCTIONS
// ==========================================

function logAutoWarnings(week, totalDefaulters, sent, failed, dayOfWeek) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('AUTO_WARNINGS_LOG');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('AUTO_WARNINGS_LOG');
      logSheet.appendRow(['Timestamp', 'Day', 'Week', 'Total Defaulters', 'Emails Sent', 'Emails Failed', 'Status', 'Notes']);
    }
    
    const status = failed === 0 ? 'COMPLETE' : 'PARTIAL';
    const notes = `Reminder for UPCOMING week sent on ${getDayName(dayOfWeek)}`;
    
    logSheet.appendRow([
      new Date().toISOString(),
      getDayName(dayOfWeek),
      week,
      totalDefaulters,
      sent,
      failed,
      status,
      notes
    ]);
    
    const maxRows = 1000;
    if (logSheet.getLastRow() > maxRows) {
      logSheet.deleteRows(2, logSheet.getLastRow() - maxRows);
    }
    
  } catch (e) {
    Logger.log("Failed to log warnings: " + e);
  }
}

function logAutoCompilations(week, classCount, emailSent, emailFailed, whatsappSent, whatsappFailed) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('AUTO_COMPILATIONS_LOG');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('AUTO_COMPILATIONS_LOG');
      logSheet.appendRow(['Timestamp', 'Week', 'Classes', 'Email Sent', 'Email Failed', 'WhatsApp Sent', 'WhatsApp Failed', 'Total Sent', 'Status']);
    }
    
    const totalSent = emailSent + whatsappSent;
    const status = emailFailed === 0 && whatsappFailed === 0 ? 'COMPLETE' : 'PARTIAL';
    
    logSheet.appendRow([
      new Date().toISOString(),
      week,
      classCount,
      emailSent,
      emailFailed,
      whatsappSent,
      whatsappFailed,
      totalSent,
      status
    ]);
    
    const maxRows = 1000;
    if (logSheet.getLastRow() > maxRows) {
      logSheet.deleteRows(2, logSheet.getLastRow() - maxRows);
    }
    
  } catch (e) {
    Logger.log("Failed to log compilations: " + e);
  }
}

function logApprovalAction(data, deletedCount, emailSent, deviceId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('APPROVAL_LOGS');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('APPROVAL_LOGS');
      logSheet.appendRow([
        'Timestamp', 'RequestID', 'Teacher', 'Email', 'Week', 
        'Deleted Records', 'Email Status', 'Approved By Device', 'IP Address'
      ]);
    }
    
    logSheet.appendRow([
      new Date().toISOString(),
      data.requestId || 'N/A',
      data.teacherName || 'Unknown',
      data.teacherEmail || 'unknown',
      data.weekStarting || 'N/A',
      deletedCount,
      emailSent ? 'SENT' : 'FAILED',
      deviceId || 'unknown',
      data._ip || 'unknown'
    ]);
    
    const maxRows = 1000;
    if (logSheet.getLastRow() > maxRows) {
      logSheet.deleteRows(2, logSheet.getLastRow() - maxRows);
    }
    
  } catch (e) {
    Logger.log(`Failed to log approval: ${e.toString()}`);
  }
}

function sendErrorNotification(type, error) {
  try {
    const subject = `[SYSTEM ERROR] ${type} Failed - ${SCHOOL_NAME}`;
    const body = `The ${type} system encountered an error:\n\n${error}\n\nTime: ${new Date().toLocaleString()}\n\nSystem: ${SCHOOL_NAME}`;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, body, {
      cc: CC_EMAIL_GAUTAM
    });
  } catch (e) {}
}

function sendNoDataNotification(week) {
  try {
    const subject = `[AUTO-COMPILATION] No Submissions Found - ${week}`;
    const body = `The automatic compilation for ${week} found no submissions.\n\nTime: ${new Date().toLocaleString()}\n\n${SCHOOL_NAME}`;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, body, {
      cc: CC_EMAIL_GAUTAM
    });
  } catch (e) {}
}

function sendCompilationSummary(reports, targetWeek, weekRange, emailSent, emailFailed, whatsappSent, whatsappFailed) {
  try {
    const subject = `[SUMMARY] Weekly Compilation Complete - ${targetWeek} - ${SCHOOL_NAME}`;
    
    let reportDetails = '';
    reports.forEach((report, index) => {
      reportDetails += `
      ${index + 1}. ${report.className}
         Subjects: ${report.totalSubjects} | Submitted: ${report.submittedCount} | Missing: ${report.missingCount}
         File: ${report.pdfFilename}
      `;
    });
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #8b5cf6; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">Weekly Compilation Summary</h2>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${SCHOOL_NAME}</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937;">Compilation Statistics - ${targetWeek}</h3>
            <p><strong>Classes Compiled:</strong> ${reports.length}</p>
            <p><strong>Emails Sent:</strong> ${emailSent} (${emailFailed} failed)</p>
            <p><strong>WhatsApp Sent:</strong> ${whatsappSent} (${whatsappFailed} failed)</p>
            <p><strong>Week Range:</strong> ${weekRange}</p>
            <pre style="background: #f8fafc; padding: 15px; border-radius: 6px; font-size: 12px;">${reportDetails}</pre>
          </div>
        </div>
      </div>
    `;
    
    GmailApp.sendEmail(ADMIN_EMAIL, subject, "", { 
      htmlBody: htmlBody,
      cc: CC_EMAIL_GAUTAM
    });
    
  } catch (error) {
    Logger.log(`Failed to send summary: ${error}`);
  }
}

function autoCleanupBackupSheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const rawSheet = ss.getSheetByName(RAW_BACKUP_SHEET);
    if (rawSheet && rawSheet.getLastRow() > 5000) {
      const rowsToDelete = rawSheet.getLastRow() - 5000;
      rawSheet.deleteRows(2, rowsToDelete);
    }
    
    const auditSheet = ss.getSheetByName(AUDIT_SHEET);
    if (auditSheet) {
      const auditData = auditSheet.getDataRange().getValues();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      for (let i = auditData.length - 1; i >= 1; i--) {
        const timestamp = new Date(auditData[i][0]);
        if (timestamp < thirtyDaysAgo) {
          auditSheet.deleteRow(i + 1);
        }
      }
    }
    
    const deviceLogSheet = ss.getSheetByName(DEVICE_LOG_SHEET);
    if (deviceLogSheet && deviceLogSheet.getLastRow() > 2000) {
      const rowsToDelete = deviceLogSheet.getLastRow() - 1000;
      deviceLogSheet.deleteRows(2, rowsToDelete);
    }
    
  } catch (error) {}
}

// ==========================================
// TEST FUNCTIONS
// ==========================================

function testAutoWarnings() {
  Logger.log("Testing auto warnings...");
  autoCheckAndSendWarnings();
}

function testAutoCompilations() {
  Logger.log("Testing auto compilations...");
  autoSendCompilations();
}

function testWhatsApp() {
  Logger.log("Testing WhatsApp...");
  const result = sendSingleWhatsApp("+919876543210", "Test message from " + SCHOOL_NAME);
  Logger.log("Result: " + JSON.stringify(result));
}

function testApprovalEmail() {
  const testData = {
    teacherEmail: "teacher@example.com",
    teacherName: "John Doe",
    weekStarting: "2024-12-01",
    requestId: "test_req_123456",
    _deviceId: "test_device_123"
  };
  
  Logger.log("Testing approval email...");
  const result = sendApprovalEmail(testData);
  Logger.log(`Test result: ${result ? "SUCCESS" : "FAILED"}`);
}

function testResubmitRequest() {
  const testData = {
    teacherEmail: "teacher@example.com",
    teacherName: "John Doe",
    weekStarting: "2024-12-01",
    teacherId: "T123",
    reason: "Test resubmit request",
    _deviceId: "test_device_mobile"
  };
  
  Logger.log("Testing resubmit request...");
  const result = handleResubmitRequest(testData);
  Logger.log(`Test result: ${JSON.stringify(result)}`);
}

function manualCompileWeek() {
  const targetWeek = getCurrentWeekMonday();
  Logger.log("Manually compiling current week: " + targetWeek);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  
  if (!subSheet) {
    Logger.log("Submissions sheet not found");
    return;
  }
  
  const subData = subSheet.getDataRange().getValues();
  let count = 0;
  
  for (let i = 1; i < subData.length; i++) {
    let rowWeek = subData[i][1];
    if (rowWeek instanceof Date) {
      rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    
    if (rowWeek === targetWeek) {
      count++;
    }
  }
  
  Logger.log(`Found ${count} submissions for week ${targetWeek}`);
  
  const reportContent = `${SCHOOL_NAME} Syllabus Report\nWeek: ${targetWeek}\nTotal Submissions: ${count}\nGenerated: ${new Date().toLocaleString()}`;
  const blob = Utilities.newBlob(reportContent, MimeType.PLAIN_TEXT, `Report_${targetWeek}.txt`);
  
  GmailApp.sendEmail(ADMIN_EMAIL, `[MANUAL] Syllabus Report - ${targetWeek}`, "", {
    attachments: [blob],
    cc: CC_EMAIL_PSHARMA
  });
  
  Logger.log("Manual compilation completed");
}

function viewDeviceLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DEVICE_LOG_SHEET);
    
    if (!sheet) {
      Logger.log("Device log sheet not found");
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log(`Found ${data.length - 1} device log entries`);
    
    // Group by device
    const deviceStats = {};
    for (let i = 1; i < data.length; i++) {
      const deviceId = data[i][1];
      if (!deviceStats[deviceId]) {
        deviceStats[deviceId] = { count: 0, lastSeen: data[i][0], type: data[i][2] };
      }
      deviceStats[deviceId].count++;
    }
    
    Logger.log("=== DEVICE STATISTICS ===");
    for (const deviceId in deviceStats) {
      Logger.log(`${deviceId} (${deviceStats[deviceId].type}): ${deviceStats[deviceId].count} actions, last: ${deviceStats[deviceId].lastSeen}`);
    }
    
    return deviceStats;
    
  } catch (error) {
    Logger.log(`Error viewing device logs: ${error}`);
  }
}

function clearAllDeviceLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DEVICE_LOG_SHEET);
    
    if (sheet) {
      sheet.clear();
      sheet.appendRow(['Timestamp', 'DeviceID', 'DeviceType', 'Action', 'IP', 'UserAgent']);
      Logger.log("Device logs cleared");
    }
    
  } catch (error) {
    Logger.log(`Error clearing logs: ${error}`);
  }
}

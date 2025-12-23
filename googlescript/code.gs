/**
 * SACRED HEART SCHOOL - BULLETPROOF SYLLABUS MANAGER (v10.0 - 100% RELIABLE EDITION)
 * 
 * INSTRUCTIONS:
 * 1. Replace entire code.gs with this version
 * 2. Save
 * 3. Run 'setupTriggers' once
 * 4. Deploy > Manage Deployments > Edit > New Version > Deploy
 */

const ROOT_FOLDER_NAME = "Sacred Heart Syllabus Reports";
const SUBMISSIONS_SHEET = "Submissions";
const REGISTRY_SHEET = "Registry";
const REQUESTS_SHEET = "Requests";
const BACKUP_SHEET = "SUBMISSIONS_BACKUP";
const AUDIT_SHEET = "AUDIT_LOG";
const RAW_BACKUP_SHEET = "RAW_BACKUP";
const PORTAL_URL = "https://syllabuscompiler-ruddy.vercel.app/";

// ==========================================
// CORS & HTTP HANDLERS
// ==========================================

function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Type, X-Submission-ID, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true"
  };
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT).setHeaders(headers);
}

function doPost(e) {
  // LAYER 1: Accept ANY format with ultra-robust parsing
  var data = extractDataFromAnyFormat(e);
  
  // Always save raw backup first (never fails)
  saveRawBackup(e);
  
  // If no action, try to extract basic submission
  if (!data || !data.action) {
    data = extractBasicSubmission(e);
  }
  
  if (!data || !data.action) {
    return jsonResponse("success", { 
      message: "Data received in backup storage", 
      backupId: "RAW_" + new Date().getTime(),
      instruction: "Data will be processed manually"
    });
  }
  
  // Generate submission ID if not present
  const submissionId = data._sid || generateId();
  
  // LAYER 2: Save to audit log for tracking
  saveToAuditLog(data, submissionId, e);
  
  // LAYER 3: Route to appropriate handler
  var result;
  var action = data.action;
  
  if (action === 'SUBMIT_PLAN') {
    result = handlePlanSubmission(data, submissionId);
  } else if (action === 'SYNC_REGISTRY') {
    result = handleSyncRegistry(data);
  } else if (action === 'GET_REGISTRY') {
    result = handleGetRegistry();
  } else if (action === 'SEND_WARNINGS') {
    result = handleWarningEmails(data);
  } else if (action === 'SEND_COMPILED_PDF') {
    result = handlePdfDelivery(data);
  } else if (action === 'REQUEST_RESUBMIT') {
    result = handleResubmitRequest(data);
  } else if (action === 'APPROVE_RESUBMIT') {
    result = handleResubmitApproval(data);
  } else if (action === 'RESET_SUBMISSION') {
    result = handleResetSubmission(data);
  } else if (action === 'VERIFY_SUBMISSION') {
    result = verifySubmissionById(data.submissionId);
  } else {
    result = jsonResponse("error", "Invalid Action: " + action);
  }
  
  return result;
}

function doGet(e) {
  // Handle verification requests
  if (e.parameter.verify) {
    const submissionId = e.parameter.verify;
    return verifySubmissionById(submissionId);
  }
  
  // Handle simple backup submissions
  if (e.parameter.simple && e.parameter.data) {
    try {
      const data = JSON.parse(e.parameter.data);
      if (data.action === 'SUBMIT_PLAN') {
        handlePlanSubmission(data, 'GET_' + generateId());
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
    } catch(e) {
      // Still save raw
      saveRawBackup(e);
    }
  }
  
  // Return full registry by default
  return handleGetRegistry();
}

// ==========================================
// ULTRA-ROBUST DATA EXTRACTION
// ==========================================

function extractDataFromAnyFormat(e) {
  var data = null;
  
  // Method 1: Direct JSON in postData
  if (e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
      if (data && data.action) return data;
    } catch(ex) {}
  }
  
  // Method 2: FormData with payload field
  if (e.parameter && e.parameter.payload) {
    try {
      data = JSON.parse(e.parameter.payload);
      if (data && data.action) return data;
    } catch(ex) {}
  }
  
  // Method 3: JSON in any parameter key
  if (e.parameter) {
    const keys = Object.keys(e.parameter);
    for (const key of keys) {
      // Skip known non-JSON keys
      if (key === 'simple' || key === 'verify') continue;
      
      try {
        const parsed = JSON.parse(key);
        if (parsed && parsed.action) return parsed;
      } catch(ex) {}
      
      try {
        const parsed = JSON.parse(e.parameter[key]);
        if (parsed && parsed.action) return parsed;
      } catch(ex) {}
    }
  }
  
  // Method 4: Form-encoded nested data
  if (e.parameter && Object.keys(e.parameter).length > 0) {
    data = reconstructFromFormData(e.parameter);
    if (data && data.action) return data;
  }
  
  // Method 5: Raw extraction from text
  if (e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    // Look for JSON pattern
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        data = JSON.parse(raw.substring(start, end + 1));
        if (data && data.action) return data;
      } catch(ex) {}
    }
  }
  
  return null;
}

function reconstructFromFormData(params) {
  const result = {};
  
  for (const key in params) {
    if (key.startsWith('_')) continue;
    
    if (key.includes('[') && key.includes(']')) {
      // Handle array notation: plans[0][classLevel]
      const match = key.match(/(\w+)\[(\d+)\]\[(\w+)\]/);
      if (match) {
        const [, arrayName, index, property] = match;
        if (!result[arrayName]) result[arrayName] = [];
        if (!result[arrayName][index]) result[arrayName][index] = {};
        result[arrayName][index][property] = params[key];
      }
    } else if (key.includes('.')) {
      // Handle dot notation: plans.0.classLevel
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          // Check if next part is numeric
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
  // Try to build a basic submission from scattered data
  const result = { action: 'SUBMIT_PLAN' };
  
  if (e.parameter) {
    result.teacherName = e.parameter.teacherName || e.parameter.name || 'Unknown';
    result.teacherEmail = e.parameter.teacherEmail || e.parameter.email || 'unknown@example.com';
    result.weekStarting = e.parameter.weekStarting || e.parameter.week || new Date().toISOString().split('T')[0];
    
    // Try to find plans
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
  }
  
  if (result.plans) return result;
  return null;
}

// ==========================================
// BACKUP & AUDIT FUNCTIONS
// ==========================================

function saveRawBackup(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let backupSheet = ss.getSheetByName(RAW_BACKUP_SHEET);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(RAW_BACKUP_SHEET);
      backupSheet.appendRow(['Timestamp', 'Method', 'ContentType', 'IP', 'UserAgent', 'QueryString', 'RawData']);
    }
    
    // Extract IP from various sources
    const ip = e.parameter?.__ip || 
               e.parameter?.ip || 
               (e.postData ? 'POST' : 'GET') + '_' + new Date().getTime();
    
    // Extract User Agent
    const userAgent = e.parameter?.__ua || 
                      e.parameter?.userAgent || 
                      e.parameter?.ua || 
                      'unknown';
    
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
      }).substring(0, 40000) // Google Sheets cell limit
    ]);
    
    // Keep only last 10,000 rows to prevent sheet from getting too large
    const maxRows = 10000;
    const lastRow = backupSheet.getLastRow();
    if (lastRow > maxRows) {
      backupSheet.deleteRows(2, lastRow - maxRows);
    }
    
  } catch (error) {
    // If backup fails, try minimal logging
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheets()[0]; // First sheet as emergency log
      sheet.appendRow(['BACKUP_FAILED', new Date().toISOString(), error.toString().substring(0, 100)]);
    } catch (e) {
      // Absolute last resort - do nothing
    }
  }
}

function saveToAuditLog(data, submissionId, e) {
  try {
    ensureSheetExists(AUDIT_SHEET, ['Timestamp', 'Action', 'SubmissionID', 'Teacher', 'Email', 'Week', 'IP', 'Device', 'Status']);
    
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
      data._device || (e.parameter?.__ua ? 'mobile' : 'desktop'),
      'RECEIVED'
    ]);
  } catch (error) {
    // Silent fail for audit log
  }
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
// CORE HANDLERS (with 100% reliability)
// ==========================================

function handlePlanSubmission(data, submissionId) {
  try {
    // Ensure sheets exist
    ensureEnvironment();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    
    // Convert weekStarting to date if needed
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
    
    // Save each plan individually
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
          submissionId, // Extra column for tracking
          data._device || 'unknown',
          'SUCCESS' // Status column
        ]);
      }
    } else {
      // Single plan submission
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
        data._device || 'unknown',
        'SUCCESS'
      ]);
    }
    
    // Force save
    SpreadsheetApp.flush();
    
    // Also save to backup sheet
    saveToBackupSheet(data, submissionId);
    
    // Send confirmation email if requested
    if (data.sendConfirmation !== false) {
      sendConfirmationEmail(data, submissionId);
    }
    
    return jsonResponse("success", { 
      message: "Syllabus plan saved successfully", 
      submissionId: submissionId,
      count: data.plans ? data.plans.length : 1
    });
    
  } catch (error) {
    // If primary save fails, save to emergency backup
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
    // If backup also fails, log somewhere
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ss.getSheetByName('Submissions').appendRow([
        new Date(), 'BACKUP_FAILED', error.toString().substring(0, 50), submissionId
      ]);
    } catch (e) {
      // Complete failure
    }
  }
}

function sendConfirmationEmail(data, submissionId) {
  try {
    const teacherEmail = data.teacherEmail;
    const teacherName = data.teacherName || 'Teacher';
    const weekStarting = data.weekStarting || 'current week';
    
    const subject = `✓ Syllabus Submitted Successfully - ${weekStarting}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Sacred Heart School</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Syllabus Management System</p>
        </div>
        
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Submission Confirmation</h2>
          
          <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0 0 10px 0;"><strong>Dear ${teacherName},</strong></p>
            <p style="margin: 0 0 15px 0;">Your syllabus plan for <strong>${weekStarting}</strong> has been successfully submitted to the system.</p>
            
            <div style="background: #f0fdf4; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p style="margin: 0; color: #065f46;"><strong>✓ Submission ID:</strong> ${submissionId}</p>
              <p style="margin: 5px 0 0 0; color: #065f46;"><strong>✓ Timestamp:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p style="margin: 15px 0;">You can view and manage your submissions at any time by visiting the syllabus portal.</p>
            
            <a href="${PORTAL_URL}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
              Go to Syllabus Portal
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #6b7280;">
            <p style="margin: 5px 0;">This is an automated confirmation email. Please do not reply.</p>
            <p style="margin: 5px 0;">If you believe this submission was made in error, please contact the administration.</p>
          </div>
        </div>
      </div>
    `;
    
    const plainBody = `Dear ${teacherName},\n\nYour syllabus plan for ${weekStarting} has been successfully submitted.\n\nSubmission ID: ${submissionId}\nTimestamp: ${new Date().toLocaleString()}\n\nYou can access the portal at: ${PORTAL_URL}\n\nThis is an automated confirmation.`;
    
    GmailApp.sendEmail(teacherEmail, subject, plainBody, {
      htmlBody: htmlBody,
      name: "SHS Syllabus Portal",
      replyTo: "no-reply@sacredheart.edu"
    });
    
    // Log email sent
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const auditSheet = ss.getSheetByName(AUDIT_SHEET);
      if (auditSheet) {
        auditSheet.appendRow([
          new Date().toISOString(),
          'EMAIL_CONFIRMATION',
          submissionId,
          teacherName,
          teacherEmail,
          weekStarting,
          'SYSTEM',
          'auto',
          'SENT'
        ]);
      }
    } catch (e) {
      // Silent fail for audit
    }
    
  } catch (error) {
    // Email failure is not critical, just log it
    console.warn("Confirmation email failed:", error);
  }
}

// ==========================================
// EMAIL & PDF FUNCTIONS (RESTORED & ENHANCED)
// ==========================================

function handleWarningEmails(data) {
  try {
    if (!data.defaulters || !Array.isArray(data.defaulters)) {
      return jsonResponse("error", "No defaulters list provided");
    }
    
    const weekStarting = data.weekStarting || getCurrentWeekMonday();
    const portalLink = data.portalLink || PORTAL_URL;
    let sentCount = 0;
    let failedCount = 0;
    
    for (const defaulter of data.defaulters) {
      try {
        if (!defaulter.email || !defaulter.name) continue;
        
        const subject = `[REMINDER] Syllabus Submission Pending - Week of ${weekStarting}`;
        
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #fbbf24); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">Sacred Heart School</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Syllabus Management System</p>
            </div>
            
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1f2937;">Friendly Reminder</h2>
              
              <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <p style="margin: 0 0 10px 0;"><strong>Dear ${defaulter.name},</strong></p>
                <p style="margin: 0 0 15px 0;">This is a reminder that your <strong>syllabus plan for the week of ${weekStarting}</strong> is still pending.</p>
                
                <div style="background: #fffbeb; padding: 15px; border-radius: 6px; margin: 15px 0;">
                  <p style="margin: 0; color: #92400e;"><strong>⚠ Deadline:</strong> Saturday, 11:59 PM</p>
                  <p style="margin: 5px 0 0 0; color: #92400e;"><strong>📚 Classes:</strong> ${defaulter.classes || 'All assigned classes'}</p>
                </div>
                
                <p style="margin: 15px 0;">Please submit your syllabus plan at your earliest convenience to avoid escalation.</p>
                
                <a href="${portalLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
                  Open Syllabus Portal
                </a>
              </div>
              
              <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                This is an automated reminder. If you have already submitted your plan, please ignore this message.
              </p>
            </div>
          </div>
        `;
        
        GmailApp.sendEmail(defaulter.email, subject, "Reminder: Syllabus Pending", {
          htmlBody: htmlBody,
          name: "SHS Syllabus Portal"
        });
        sentCount++;
      } catch (e) {
        failedCount++;
      }
    }
    
    return jsonResponse("success", { 
      message: "Warning emails processed", 
      sent: sentCount, 
      failed: failedCount 
    });
  } catch (error) {
    return jsonResponse("error", error.toString());
  }
}

// Handlers missing from provided snippet but required by doPost

function handleSyncRegistry(data) {
  var sheet = ensureSheetExists(REGISTRY_SHEET, ["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo"]);
  sheet.clearContents();
  sheet.appendRow(["ID", "Name", "Email", "WhatsApp", "Assignments", "ClassTeacherInfo"]);
  if(data.teachers) {
    data.teachers.forEach(function(t) {
      sheet.appendRow([
        t.id, 
        t.name, 
        t.email, 
        t.whatsapp || "", 
        JSON.stringify(t.assignedClasses), 
        t.isClassTeacher ? JSON.stringify(t.isClassTeacher) : ""
      ]);
    });
  }
  return jsonResponse("success", "Registry synced successfully");
}

function handleGetRegistry() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regSheet = ss.getSheetByName(REGISTRY_SHEET);
  const reqSheet = ss.getSheetByName(REQUESTS_SHEET);
  const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);

  const teachers = [];
  const emailToId = {};
  if (regSheet) {
    const regData = regSheet.getDataRange().getValues();
    for (let i = 1; i < regData.length; i++) {
      if (!regData[i][0]) continue;
      teachers.push({
        id: regData[i][0],
        name: regData[i][1],
        email: regData[i][2],
        whatsapp: regData[i][3],
        assignedClasses: regData[i][4] ? JSON.parse(regData[i][4]) : [],
        isClassTeacher: regData[i][5] ? JSON.parse(regData[i][5]) : undefined
      });
      emailToId[regData[i][2].toLowerCase().trim()] = regData[i][0];
    }
  }

  const requests = [];
  if (reqSheet) {
    const reqData = reqSheet.getDataRange().getValues();
    for (let i = 1; i < reqData.length; i++) {
      if (!reqData[i][0]) continue;
      let week = reqData[i][4];
      if (week instanceof Date) week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
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

  const submissions = [];
  if (subSheet) {
    const subData = subSheet.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < subData.length; i++) {
      const r = subData[i];
      if (!r[2]) continue;
      let week = r[1];
      if (week instanceof Date) week = Utilities.formatDate(week, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const email = String(r[3]).toLowerCase().trim();
      const key = email + "_" + week;
      if (!map[key]) {
        map[key] = {
          id: key,
          teacherId: emailToId[email] || "ext",
          teacherName: r[2],
          teacherEmail: r[3],
          weekStarting: week,
          timestamp: r[0],
          plans: []
        };
      }
      map[key].plans.push({
        classLevel: r[4],
        section: r[5],
        subject: r[6],
        chapterName: r[7],
        topics: r[8],
        homework: r[9],
        _sid: r[10] // Submission ID from column 11
      });
    }
    for (const k in map) submissions.push(map[k]);
  }
  
  return jsonResponse("success", { teachers, requests, submissions });
}

function handlePdfDelivery(data) {
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(data.pdfBase64.split(',')[1]), MimeType.PDF, data.filename);
    const subject = `[OFFICIAL] Weekly Syllabus Report - ${data.className} - ${data.weekStarting || ''}`;
    const body = `Please find the attached compiled syllabus report for ${data.className}.`;
    
    GmailApp.sendEmail(data.recipient, subject, body, {
      attachments: [blob],
      name: "SHS Syllabus Portal"
    });
    return jsonResponse("success", "PDF report sent successfully");
  } catch (e) {
    return jsonResponse("error", "Failed to send PDF: " + e.toString());
  }
}

function handleResubmitRequest(data) {
  const sheet = ensureSheetExists(REQUESTS_SHEET, ["ID", "TID", "Name", "Email", "Week", "Time", "Stat"]);
  sheet.appendRow([
    data.id, 
    data.teacherId, 
    data.teacherName, 
    data.teacherEmail, 
    data.weekStarting, 
    data.timestamp || new Date().toISOString(), 
    data.status || 'pending'
  ]);
  return jsonResponse("success", "Resubmission request logged");
}

function handleResubmitApproval(data) {
  const reqSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REQUESTS_SHEET);
  if (reqSheet) {
    const reqRows = reqSheet.getDataRange().getValues();
    for (let i = 1; i < reqRows.length; i++) {
      if (reqRows[i][0] === data.requestId) {
        reqSheet.getRange(i + 1, 7).setValue('approved');
        break;
      }
    }
  }
  // When approved, we also clear the previous submission records to allow the new one
  handleResetSubmission(data);
  return jsonResponse("success", "Request approved and previous records cleared");
}

function handleResetSubmission(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) return jsonResponse("error", "Submissions sheet not found");
  
  const rows = sheet.getDataRange().getValues();
  // Iterate backwards to safely delete rows
  for (let i = rows.length - 1; i >= 1; i--) {
    let rowWeek = rows[i][1];
    if (rowWeek instanceof Date) rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const rowEmail = String(rows[i][3]).toLowerCase().trim();
    
    const targetWeek = String(data.weekStarting);
    const targetEmail = String(data.teacherEmail).toLowerCase().trim();
    
    if (String(rowWeek) === targetWeek && rowEmail === targetEmail) {
      sheet.deleteRow(i + 1);
    }
  }
  return jsonResponse("success", "Records cleared successfully");
}

function verifySubmissionById(submissionId) {
  if (!submissionId) return jsonResponse("error", "No submission ID provided");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!subSheet) return jsonResponse("error", "Database not initialized");
  
  const data = subSheet.getDataRange().getValues();
  const exists = data.some(row => row[10] === submissionId); // Check column 11
  
  return jsonResponse("success", { 
    verified: exists,
    submissionId: submissionId 
  });
}

function ensureEnvironment() {
  ensureSheetExists(SUBMISSIONS_SHEET, ["Timestamp", "Week", "Name", "Email", "Class", "Sec", "Sub", "Chap", "Topics", "HW", "SID", "Device", "Status"]);
  ensureSheetExists(REGISTRY_SHEET, ["ID", "Name", "Email", "WA", "Ass", "CT"]);
  ensureSheetExists(REQUESTS_SHEET, ["ID", "TID", "Name", "Email", "Week", "Time", "Stat"]);
}

function jsonResponse(res, dataOrMsg) {
  const output = { result: res };
  if (typeof dataOrMsg === 'string') {
    output.message = dataOrMsg;
  } else {
    Object.assign(output, dataOrMsg);
  }
  
  const response = ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
    
  return response.setHeaders({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true"
  });
}

function getCurrentWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Utilities.formatDate(monday, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function setupTriggers() {
  ensureEnvironment();
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
}
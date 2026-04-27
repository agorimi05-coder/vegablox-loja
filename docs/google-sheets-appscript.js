const SHEET_NAME = "Pedidos";
const SCRIPT_SECRET = "";

const HEADERS = [
  "createdAt",
  "updatedAt",
  "event",
  "status",
  "transactionId",
  "externalRef",
  "amount",
  "amountCents",
  "productId",
  "productName",
  "robloxUsername",
  "fullName",
  "email",
  "phone",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "ttclid",
  "src",
  "sck"
];

function doPost(e) {
  if (SCRIPT_SECRET && (!e.parameter || e.parameter.secret !== SCRIPT_SECRET)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const payload = JSON.parse(e.postData.contents || "{}");
  const sheet = getOrCreateSheet();
  const row = buildRow(payload);
  const existingRow = findExistingRow(sheet, row);

  if (existingRow > 0) {
    updateExistingRow(sheet, existingRow, row);
  } else {
    sheet.appendRow(row);
  }

  return jsonResponse({ ok: true });
}

function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  return sheet;
}

function buildRow(payload) {
  const now = new Date().toISOString();
  const createdAt = payload.createdAt || payload.receivedAt || now;
  const updatedAt = payload.receivedAt || payload.createdAt || now;

  return HEADERS.map((header) => {
    if (header === "createdAt") return createdAt;
    if (header === "updatedAt") return updatedAt;
    return payload[header] == null ? "" : payload[header];
  });
}

function findExistingRow(sheet, row) {
  const transactionId = String(row[HEADERS.indexOf("transactionId")] || "");
  const externalRef = String(row[HEADERS.indexOf("externalRef")] || "");
  if (!transactionId && !externalRef) return -1;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const transactionIndex = HEADERS.indexOf("transactionId");
  const externalRefIndex = HEADERS.indexOf("externalRef");

  for (let index = 0; index < values.length; index++) {
    const currentTransactionId = String(values[index][transactionIndex] || "");
    const currentExternalRef = String(values[index][externalRefIndex] || "");

    if (
      (transactionId && currentTransactionId === transactionId) ||
      (externalRef && currentExternalRef === externalRef)
    ) {
      return index + 2;
    }
  }

  return -1;
}

function updateExistingRow(sheet, rowNumber, nextRow) {
  const currentRow = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
  const createdAtIndex = HEADERS.indexOf("createdAt");

  const merged = nextRow.map((value, index) => {
    if (index === createdAtIndex) return currentRow[index] || value;
    return value || currentRow[index] || "";
  });

  sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([merged]);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Who may load a new AR report. Uploading syncs the whole AR list (invoices missing from the file are removed
// along with their notes), so it is limited to one person - matched on the part of the login email before the "@".
// Edit this list to change who can.
export const AR_UPLOADER_HANDLES = ["tsulay"];
export const AR_UPLOADER_NAME = "Tyler Sulay";

export function canUploadAr(email: string | null | undefined): boolean {
  if (!email) return false;
  return AR_UPLOADER_HANDLES.includes(email.split("@")[0].toLowerCase());
}

export const AR_UPLOAD_DENIED = `Only ${AR_UPLOADER_NAME} can upload a new AR report.`;

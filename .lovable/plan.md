

User wants to read emails from a specific sender (`amns.customercare@amns.in`) in the connected Outlook inbox (`info@arecacorp.com`). This is a quick read/inspection task — no auto-import, no parsing into tables yet. Just fetch and display.

Best to build a small admin-only viewer in the existing Connections tab so they can:
- Filter by sender (default: `amns.customercare@amns.in`, but editable)
- See last N messages with subject, date, snippet, attachment indicator
- Click a row to expand body + list attachments

## Plan: Outlook sender inbox viewer

### Backend
- New edge function `outlook-list-messages` (admin-only, JWT-validated)
  - Input: `{ sender?: string, top?: number (default 25) }`
  - Calls Microsoft Graph via gateway: `GET /me/messages?$top=N&$filter=from/emailAddress/address eq '{sender}'&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead`
  - Returns array of messages
- New edge function `outlook-get-message` (admin-only)
  - Input: `{ messageId: string }`
  - Returns full body (HTML) + attachments list (id, name, size, contentType) via `/me/messages/{id}` and `/me/messages/{id}/attachments`

### Frontend
- Extend `src/components/admin/ConnectionsTab.tsx` with a new section **"Browse Outlook Inbox"**:
  - Sender input (prefilled `amns.customercare@amns.in`) + "Fetch" button
  - Results table: Date | Subject | Snippet | Attachments | Read
  - Click row → dialog showing full HTML body (sandboxed iframe) + attachment list with sizes

### Out of scope (next steps)
- Downloading/parsing attachment contents into batches/orders
- Polling / auto-import
- Marking as read / replying

### Files
- `supabase/functions/outlook-list-messages/index.ts` (new)
- `supabase/functions/outlook-get-message/index.ts` (new)
- `src/components/admin/ConnectionsTab.tsx` (extend)


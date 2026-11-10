/** Simulator transcript. The agent core doesn't know about channels; this is the simulator's. */
import { getDb } from './db/client';
import { chatMessages } from './db/schema';
import { nowIso } from './clock';

export type Attachment =
  | { type: 'image'; url: string; name: string }
  | { type: 'echo'; requestShortId: string; fields: { label: string; value: string }[] }
  | { type: 'advice'; requestShortId: string }
  | { type: 'approval'; requestShortId: string }
  | { type: 'card'; requestShortId: string }
  | { type: 'receipt'; requestShortId: string }
  | { type: 'filing'; requestShortId: string }
  | { type: 'flagged'; requestShortId: string }
  | { type: 'owed_back'; requestShortId: string }
  | { type: 'error'; detail: string };

export function postMessage(m: {
  pane: 'officer' | 'treasurer';
  author: 'member' | 'agent';
  memberId?: string | null;
  requestId?: number | null;
  body: string;
  attachment?: Attachment;
}): void {
  getDb()
    .insert(chatMessages)
    .values({
      pane: m.pane,
      author: m.author,
      memberId: m.memberId ?? null,
      requestId: m.requestId ?? null,
      body: m.body,
      attachmentJson: m.attachment ? JSON.stringify(m.attachment) : null,
      createdAt: nowIso(),
    })
    .run();
}

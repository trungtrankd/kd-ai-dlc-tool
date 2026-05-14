import * as fs from 'fs';
import * as path from 'path';
import { MailMessage } from '../types';

/**
 * Walks mailbox/<agent>/inbox/*.json and returns all messages sorted by sent_at.
 */
export function readMailbox(workspaceRoot: string): MailMessage[] {
  const mailboxDir = path.join(workspaceRoot, 'mailbox');
  const messages: MailMessage[] = [];

  if (!fs.existsSync(mailboxDir)) {
    return messages;
  }

  let agents: string[];
  try {
    agents = fs.readdirSync(mailboxDir);
  } catch {
    return messages;
  }

  for (const agent of agents) {
    const inboxDir = path.join(mailboxDir, agent, 'inbox');
    if (!fs.existsSync(inboxDir)) {
      continue;
    }

    let files: string[];
    try {
      files = fs.readdirSync(inboxDir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(inboxDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const msg = JSON.parse(raw) as MailMessage;
        // Ensure 'to' is set even if the file only has the directory as context
        if (!msg.to) {
          msg.to = agent;
        }
        messages.push(msg);
      } catch {
        // skip malformed files
      }
    }
  }

  // Sort by sent_at ascending
  messages.sort((a, b) => {
    const ta = a.sent_at || '';
    const tb = b.sent_at || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return messages;
}

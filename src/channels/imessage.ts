import Database from 'better-sqlite3';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { resolveGroupFolderPath } from '../group-folder.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

const execFileAsync = promisify(execFile);

const CHAT_DB = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const POLL_INTERVAL = 3000;
// chat.style 45 = one-to-one; 43 = group chat (ignored)
const DIRECT_CHAT_STYLE = 45;
// Messages stores dates as nanoseconds since 2001-01-01
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

// Text and recipient are passed as argv so message content is never interpolated into the script
const SEND_SCRIPT = `on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 1 of argv) to participant (item 2 of argv) of svc
  end tell
end run`;

interface MessageRow {
  rowid: number;
  guid: string;
  text: string | null;
  attributedBody: Buffer | null;
  date: number;
  handle: string;
  has_attachments: number;
}

interface AttachmentRow {
  filename: string | null;
  mime_type: string | null;
  transfer_name: string | null;
}

/**
 * Extract plain text from an attributedBody blob (NSAttributedString typedstream).
 * Recent macOS leaves message.text NULL and stores the text only here.
 */
export function decodeAttributedBody(blob: Buffer): string | null {
  const marker = blob.indexOf('NSString');
  if (marker === -1) return null;
  // After the class name: a few typedstream bytes, then '+' and the length-prefixed UTF-8 string
  const plus = blob.indexOf(0x2b, marker + 'NSString'.length);
  if (plus === -1) return null;
  let pos = plus + 1;
  let len = blob[pos];
  pos += 1;
  if (len === 0x81) {
    len = blob.readUInt16LE(pos);
    pos += 2;
  } else if (len === 0x82) {
    len = blob.readUInt32LE(pos);
    pos += 4;
  }
  if (pos + len > blob.length) return null;
  return blob.subarray(pos, pos + len).toString('utf-8');
}

/** iMessage shows Markdown literally, so drop the most common markers. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`\n]+)`/g, '$1');
}

export interface IMessageChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class IMessageChannel implements Channel {
  name = 'imessage';

  private db: Database.Database | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastRowId = 0;
  private opts: IMessageChannelOpts;

  constructor(opts: IMessageChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    try {
      this.db = new Database(CHAT_DB, { readonly: true, fileMustExist: true });
      const row = this.db
        .prepare('SELECT MAX(ROWID) AS max FROM message')
        .get() as {
        max: number | null;
      };
      // Only handle messages that arrive from now on, not the existing history
      this.lastRowId = row.max ?? 0;
    } catch (err) {
      // Usually missing Full Disk Access for the node binary
      logger.error(
        { err, path: CHAT_DB },
        'iMessage: cannot open chat.db (grant Full Disk Access to node)',
      );
      this.db = null;
      return;
    }

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
    logger.info({ lastRowId: this.lastRowId }, 'iMessage channel connected');
  }

  private poll(): void {
    if (!this.db) return;
    let rows: MessageRow[];
    try {
      rows = this.db
        .prepare(
          `SELECT m.ROWID AS rowid, m.guid, m.text, m.attributedBody, m.date,
                  h.id AS handle, m.cache_has_attachments AS has_attachments
           FROM message m
           JOIN handle h ON h.ROWID = m.handle_id
           JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
           JOIN chat c ON c.ROWID = cmj.chat_id
           WHERE m.ROWID > ? AND m.is_from_me = 0 AND c.style = ?
           ORDER BY m.ROWID`,
        )
        .all(this.lastRowId, DIRECT_CHAT_STYLE) as MessageRow[];
    } catch (err) {
      logger.error({ err }, 'iMessage: poll failed');
      return;
    }

    for (const row of rows) {
      this.lastRowId = Math.max(this.lastRowId, row.rowid);
      this.handleRow(row).catch((err) =>
        logger.error(
          { err, rowid: row.rowid },
          'iMessage: failed to handle message',
        ),
      );
    }
  }

  private async handleRow(row: MessageRow): Promise<void> {
    const chatJid = `imsg:${row.handle}`;
    const timestamp = new Date(
      APPLE_EPOCH_MS + Math.floor(row.date / 1_000_000),
    ).toISOString();

    this.opts.onChatMetadata(chatJid, timestamp, row.handle, 'imessage', false);

    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.debug({ chatJid }, 'Message from unregistered iMessage chat');
      return;
    }

    let text =
      row.text ??
      (row.attributedBody ? decodeAttributedBody(row.attributedBody) : null) ??
      '';
    // Attachments show up in the text as U+FFFC placeholders
    text = text.replace(/￼/g, '').trim();

    const parts: string[] = [];
    if (row.has_attachments) {
      parts.push(...(await this.saveAttachments(row, group)));
    }
    if (text) parts.push(text);
    if (parts.length === 0) return;

    this.opts.onMessage(chatJid, {
      id: row.guid,
      chat_jid: chatJid,
      sender: row.handle,
      sender_name: group.name,
      content: parts.join(' '),
      timestamp,
      is_from_me: false,
    });
    logger.info({ chatJid, rowid: row.rowid }, 'iMessage message stored');
  }

  /** Copy attachments into the group folder and return placeholders for the agent. */
  private async saveAttachments(
    row: MessageRow,
    group: RegisteredGroup,
  ): Promise<string[]> {
    const attachments = this.db!.prepare(
      `SELECT a.filename, a.mime_type, a.transfer_name
       FROM attachment a
       JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
       WHERE maj.message_id = ?`,
    ).all(row.rowid) as AttachmentRow[];

    const groupDir = resolveGroupFolderPath(group.folder);
    const placeholders: string[] = [];
    for (const [i, att] of attachments.entries()) {
      const name = att.transfer_name || 'file';
      if (!att.filename) {
        placeholders.push(`[Attachment: ${name}]`);
        continue;
      }
      const src = att.filename.replace(/^~/, os.homedir());
      const mime = att.mime_type || '';
      try {
        if (mime.startsWith('image/')) {
          // sips converts HEIC to JPEG and caps the size, matching Telegram's 1600px limit
          const filename = `im-${row.rowid}-${i}.jpg`;
          const imagesDir = path.join(groupDir, 'images');
          fs.mkdirSync(imagesDir, { recursive: true });
          await execFileAsync('sips', [
            '-s',
            'format',
            'jpeg',
            '-Z',
            '1600',
            src,
            '--out',
            path.join(imagesDir, filename),
          ]);
          placeholders.push(`[Photo: /workspace/group/images/${filename}]`);
        } else if (mime.startsWith('audio/')) {
          const filename = `im-${row.rowid}-${i}${path.extname(src)}`;
          const audioDir = path.join(groupDir, 'audio');
          fs.mkdirSync(audioDir, { recursive: true });
          fs.copyFileSync(src, path.join(audioDir, filename));
          placeholders.push(
            `[Voice message: /workspace/group/audio/${filename}]`,
          );
        } else {
          placeholders.push(`[Attachment: ${name}]`);
        }
      } catch (err) {
        logger.error({ err, src }, 'iMessage: failed to copy attachment');
        placeholders.push(`[Attachment - copy failed: ${name}]`);
      }
    }
    return placeholders;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const handle = jid.replace(/^imsg:/, '');
    try {
      await execFileAsync('osascript', [
        '-e',
        SEND_SCRIPT,
        stripMarkdown(text),
        handle,
      ]);
      logger.info({ jid, length: text.length }, 'iMessage message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send iMessage');
    }
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('imsg:');
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.db?.close();
    this.db = null;
    logger.info('iMessage channel stopped');
  }
}

registerChannel('imessage', (opts: ChannelOpts) => {
  if (process.platform !== 'darwin') return null;
  if (!fs.existsSync(CHAT_DB)) {
    logger.warn('iMessage: Messages database not found');
    return null;
  }
  return new IMessageChannel(opts);
});

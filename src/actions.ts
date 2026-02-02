import type { OpenClawConfig } from "openclaw/plugin-sdk";

import { resolveRingCentralAccount, type ResolvedRingCentralAccount } from "./accounts.js";
import {
  listRingCentralPosts,
  sendRingCentralMessage,
  updateRingCentralMessage,
  deleteRingCentralMessage,
  getRingCentralChat,
} from "./api.js";
import type { RingCentralPost, RingCentralAttachment, RingCentralMention } from "./types.js";
import { normalizeRingCentralTarget } from "./targets.js";

export type RingCentralActionClientOpts = {
  accountId?: string;
  cfg: OpenClawConfig;
};

export type RingCentralMessageSummary = {
  id?: string;
  text?: string;
  creatorId?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  attachments?: Array<{
    id?: string;
    type?: string;
    contentUri?: string;
    name?: string;
  }>;
  mentions?: Array<{
    id?: string;
    type?: string;
    name?: string;
  }>;
};

function getAccount(opts: RingCentralActionClientOpts): ResolvedRingCentralAccount {
  return resolveRingCentralAccount({ cfg: opts.cfg, accountId: opts.accountId });
}

function normalizeTarget(raw: string): string {
  const normalized = normalizeRingCentralTarget(raw);
  if (!normalized) {
    throw new Error(`Invalid RingCentral target: ${raw}`);
  }
  return normalized;
}

function toMessageSummary(post: RingCentralPost): RingCentralMessageSummary {
  return {
    id: post.id,
    text: post.text,
    creatorId: post.creatorId,
    creationTime: post.creationTime,
    lastModifiedTime: post.lastModifiedTime,
    attachments: post.attachments?.map((a) => ({
      id: a.id,
      type: a.type,
      contentUri: a.contentUri,
      name: a.name,
    })),
    mentions: post.mentions?.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
    })),
  };
}

/**
 * Read messages from a RingCentral chat/team.
 */
export async function readRingCentralMessages(
  chatId: string,
  opts: RingCentralActionClientOpts & {
    limit?: number;
    pageToken?: string;
  },
): Promise<{ messages: RingCentralMessageSummary[]; hasMore: boolean; nextPageToken?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await listRingCentralPosts({
    account,
    chatId: targetChatId,
    limit: opts.limit,
    pageToken: opts.pageToken,
  });

  return {
    messages: result.records.map(toMessageSummary),
    hasMore: Boolean(result.navigation?.nextPageToken),
    nextPageToken: result.navigation?.nextPageToken,
  };
}

/**
 * Send a message to a RingCentral chat/team.
 */
export async function sendRingCentralMessageAction(
  chatId: string,
  content: string,
  opts: RingCentralActionClientOpts,
): Promise<{ messageId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await sendRingCentralMessage({
    account,
    chatId: targetChatId,
    text: content,
  });

  return { messageId: result?.postId };
}

/**
 * Edit an existing message in a RingCentral chat.
 */
export async function editRingCentralMessage(
  chatId: string,
  messageId: string,
  content: string,
  opts: RingCentralActionClientOpts,
): Promise<{ messageId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await updateRingCentralMessage({
    account,
    chatId: targetChatId,
    postId: messageId,
    text: content,
  });

  return { messageId: result?.postId };
}

/**
 * Delete a message from a RingCentral chat.
 */
export async function deleteRingCentralMessageAction(
  chatId: string,
  messageId: string,
  opts: RingCentralActionClientOpts,
): Promise<void> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  await deleteRingCentralMessage({
    account,
    chatId: targetChatId,
    postId: messageId,
  });
}

/**
 * Get chat/team info.
 */
export async function getRingCentralChatInfo(
  chatId: string,
  opts: RingCentralActionClientOpts,
): Promise<{
  id?: string;
  name?: string;
  type?: string;
  members?: string[];
  description?: string;
} | null> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const chat = await getRingCentralChat({ account, chatId: targetChatId });
  if (!chat) return null;

  return {
    id: chat.id,
    name: chat.name,
    type: chat.type,
    members: chat.members,
    description: chat.description,
  };
}

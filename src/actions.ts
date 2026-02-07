import type { OpenClawConfig } from "openclaw/plugin-sdk";

import { resolveRingCentralAccount, type ResolvedRingCentralAccount } from "./accounts.js";
import {
  listRingCentralPosts,
  sendRingCentralMessage,
  updateRingCentralMessage,
  deleteRingCentralMessage,
  getRingCentralChat,
  listRingCentralTasks,
  createRingCentralTask,
  completeRingCentralTask,
  updateRingCentralTask,
  listRingCentralEvents,
  createRingCentralEvent,
  updateRingCentralEvent,
  deleteRingCentralEvent,
  listRingCentralNotes,
  createRingCentralNote,
  updateRingCentralNote,
} from "./api.js";
import type { RingCentralPost, RingCentralAttachment, RingCentralMention, RingCentralTask, RingCentralEvent, RingCentralNote } from "./types.js";
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

// Task Actions

export type RingCentralTaskSummary = {
  id?: string;
  subject?: string;
  description?: string;
  status?: string;
  dueDate?: string;
  assignees?: Array<{ id?: string }>;
  creatorId?: string;
  creationTime?: string;
};

function toTaskSummary(task: RingCentralTask): RingCentralTaskSummary {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate,
    assignees: task.assignees,
    creatorId: task.creatorId,
    creationTime: task.creationTime,
  };
}

/**
 * List tasks in a RingCentral chat.
 */
export async function listRingCentralTasksAction(
  chatId: string,
  opts: RingCentralActionClientOpts & {
    limit?: number;
    status?: "Pending" | "InProgress" | "Completed";
  },
): Promise<{ tasks: RingCentralTaskSummary[]; hasMore: boolean }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await listRingCentralTasks({
    account,
    chatId: targetChatId,
    limit: opts.limit,
    status: opts.status,
  });

  return {
    tasks: result.records.map(toTaskSummary),
    hasMore: Boolean(result.navigation?.nextPageToken),
  };
}

/**
 * Create a task in a RingCentral chat.
 */
export async function createRingCentralTaskAction(
  chatId: string,
  subject: string,
  opts: RingCentralActionClientOpts & {
    description?: string;
    dueDate?: string;
    assignees?: string[];
  },
): Promise<{ taskId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await createRingCentralTask({
    account,
    chatId: targetChatId,
    subject,
    description: opts.description,
    dueDate: opts.dueDate,
    assignees: opts.assignees?.map((id) => ({ id })),
  });

  return { taskId: result.id };
}

/**
 * Complete a task in a RingCentral chat.
 */
export async function completeRingCentralTaskAction(
  chatId: string,
  taskId: string,
  opts: RingCentralActionClientOpts & {
    complete?: boolean;
  },
): Promise<void> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  await completeRingCentralTask({
    account,
    chatId: targetChatId,
    taskId,
    status: opts.complete === false ? "Incomplete" : "Complete",
  });
}

/**
 * Update a task in a RingCentral chat.
 */
export async function updateRingCentralTaskAction(
  chatId: string,
  taskId: string,
  opts: RingCentralActionClientOpts & {
    subject?: string;
    description?: string;
    dueDate?: string;
    assignees?: string[];
  },
): Promise<{ taskId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await updateRingCentralTask({
    account,
    chatId: targetChatId,
    taskId,
    subject: opts.subject,
    description: opts.description,
    dueDate: opts.dueDate,
    assignees: opts.assignees?.map((id) => ({ id })),
  });

  return { taskId: result.id };
}

// Event Actions

export type RingCentralEventSummary = {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  color?: string;
  recurrence?: string;
  creatorId?: string;
};

function toEventSummary(event: RingCentralEvent): RingCentralEventSummary {
  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    location: event.location,
    description: event.description,
    color: event.color,
    recurrence: event.recurrence,
    creatorId: event.creatorId,
  };
}

/**
 * List events in a RingCentral chat.
 */
export async function listRingCentralEventsAction(
  chatId: string,
  opts: RingCentralActionClientOpts & {
    limit?: number;
  },
): Promise<{ events: RingCentralEventSummary[]; hasMore: boolean }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await listRingCentralEvents({
    account,
    chatId: targetChatId,
    limit: opts.limit,
  });

  return {
    events: result.records.map(toEventSummary),
    hasMore: Boolean(result.navigation?.nextPageToken),
  };
}

/**
 * Create an event in a RingCentral chat.
 */
export async function createRingCentralEventAction(
  chatId: string,
  title: string,
  startTime: string,
  endTime: string,
  opts: RingCentralActionClientOpts & {
    allDay?: boolean;
    location?: string;
    description?: string;
    color?: "Black" | "Red" | "Orange" | "Yellow" | "Green" | "Blue" | "Purple" | "Magenta";
    recurrence?: "None" | "Day" | "Weekday" | "Week" | "Month" | "Year";
  },
): Promise<{ eventId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await createRingCentralEvent({
    account,
    chatId: targetChatId,
    title,
    startTime,
    endTime,
    allDay: opts.allDay,
    location: opts.location,
    description: opts.description,
    color: opts.color,
    recurrence: opts.recurrence,
  });

  return { eventId: result.id };
}

/**
 * Update an event in a RingCentral chat.
 */
export async function updateRingCentralEventAction(
  chatId: string,
  eventId: string,
  opts: RingCentralActionClientOpts & {
    title?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    location?: string;
    description?: string;
    color?: "Black" | "Red" | "Orange" | "Yellow" | "Green" | "Blue" | "Purple" | "Magenta";
  },
): Promise<{ eventId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await updateRingCentralEvent({
    account,
    chatId: targetChatId,
    eventId,
    title: opts.title,
    startTime: opts.startTime,
    endTime: opts.endTime,
    allDay: opts.allDay,
    location: opts.location,
    description: opts.description,
    color: opts.color,
  });

  return { eventId: result.id };
}

/**
 * Delete an event from a RingCentral chat.
 */
export async function deleteRingCentralEventAction(
  chatId: string,
  eventId: string,
  opts: RingCentralActionClientOpts,
): Promise<void> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  await deleteRingCentralEvent({
    account,
    chatId: targetChatId,
    eventId,
  });
}

// Note Actions

export type RingCentralNoteSummary = {
  id?: string;
  title?: string;
  body?: string;
  status?: string;
  creatorId?: string;
  creationTime?: string;
  lastModifiedTime?: string;
};

function toNoteSummary(note: RingCentralNote): RingCentralNoteSummary {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    status: note.status,
    creatorId: note.creatorId,
    creationTime: note.creationTime,
    lastModifiedTime: note.lastModifiedTime,
  };
}

/**
 * List notes in a RingCentral chat.
 */
export async function listRingCentralNotesAction(
  chatId: string,
  opts: RingCentralActionClientOpts & {
    limit?: number;
    status?: "Active" | "Draft";
  },
): Promise<{ notes: RingCentralNoteSummary[]; hasMore: boolean }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await listRingCentralNotes({
    account,
    chatId: targetChatId,
    limit: opts.limit,
    status: opts.status,
  });

  return {
    notes: result.records.map(toNoteSummary),
    hasMore: Boolean(result.navigation?.nextPageToken),
  };
}

/**
 * Create a note in a RingCentral chat.
 */
export async function createRingCentralNoteAction(
  chatId: string,
  title: string,
  opts: RingCentralActionClientOpts & {
    body?: string;
  },
): Promise<{ noteId?: string }> {
  const account = getAccount(opts);
  const targetChatId = normalizeTarget(chatId);

  const result = await createRingCentralNote({
    account,
    chatId: targetChatId,
    title,
    body: opts.body,
  });

  return { noteId: result.id };
}

/**
 * Update a note in a RingCentral chat.
 */
export async function updateRingCentralNoteAction(
  noteId: string,
  opts: RingCentralActionClientOpts & {
    title?: string;
    body?: string;
  },
): Promise<{ noteId?: string }> {
  const account = getAccount(opts);

  const result = await updateRingCentralNote({
    account,
    noteId,
    title: opts.title,
    body: opts.body,
  });

  return { noteId: result.id };
}

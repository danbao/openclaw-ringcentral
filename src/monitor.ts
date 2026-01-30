import { Subscriptions } from "@ringcentral/subscriptions";
import * as fs from "fs";
import * as path from "path";

import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import { resolveMentionGatingWithBypass } from "clawdbot/plugin-sdk";

import type { ResolvedRingCentralAccount } from "./accounts.js";
import { getRingCentralSDK } from "./auth.js";
import {
  sendRingCentralMessage,
  updateRingCentralMessage,
  deleteRingCentralMessage,
  downloadRingCentralAttachment,
  uploadRingCentralAttachment,
  getRingCentralChat,
} from "./api.js";
import { getRingCentralRuntime } from "./runtime.js";
import type {
  RingCentralWebhookEvent,
  RingCentralEventBody,
  RingCentralAttachment,
  RingCentralMention,
} from "./types.js";

export type RingCentralRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

// Track recently sent message IDs to avoid processing bot's own replies
const recentlySentMessageIds = new Set<string>();
const MESSAGE_ID_TTL = 60000; // 60 seconds

// Reconnection settings
const RECONNECT_INITIAL_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 60000; // 60 seconds
const RECONNECT_MAX_ATTEMPTS = 10;

function trackSentMessageId(messageId: string): void {
  recentlySentMessageIds.add(messageId);
  setTimeout(() => recentlySentMessageIds.delete(messageId), MESSAGE_ID_TTL);
}

function isOwnSentMessage(messageId: string): boolean {
  return recentlySentMessageIds.has(messageId);
}

export type RingCentralMonitorOptions = {
  account: ResolvedRingCentralAccount;
  config: MoltbotConfig;
  runtime: RingCentralRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

type RingCentralCoreRuntime = ReturnType<typeof getRingCentralRuntime>;

function logVerbose(
  core: RingCentralCoreRuntime,
  runtime: RingCentralRuntimeEnv,
  message: string,
) {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[ringcentral] ${message}`);
  }
}

/**
 * Save group chat message to workspace memory file.
 * File path: ${workspace}/memory/chats/YYYY-MM-DD/${chatId}.md
 */
async function saveGroupChatMessage(params: {
  workspace: string;
  chatId: string;
  chatName?: string;
  senderId: string;
  messageText: string;
  timestamp?: string;
  runtime: RingCentralRuntimeEnv;
}): Promise<void> {
  const { workspace, chatId, chatName, senderId, messageText, timestamp, runtime } = params;

  if (!workspace) {
    runtime.log?.(`[ringcentral] Cannot save chat message: workspace not configured`);
    return;
  }

  try {
    // Parse timestamp or use current time
    const msgDate = timestamp ? new Date(timestamp) : new Date();
    const dateStr = msgDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = msgDate.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    });

    // Build file path
    const chatDir = path.join(workspace, "memory", "chats", dateStr);
    const filePath = path.join(chatDir, `${chatId}.md`);

    // Ensure directory exists
    await fs.promises.mkdir(chatDir, { recursive: true });

    // Format message entry
    const header = chatName ? `# ${chatName} (${chatId})\n\n` : `# Chat ${chatId}\n\n`;
    const entry = `## ${timeStr} - ${senderId}\n${messageText}\n\n---\n\n`;

    // Check if file exists; if not, write header first
    let content = entry;
    try {
      await fs.promises.access(filePath);
      // File exists, just append
    } catch {
      // File doesn't exist, prepend header
      content = header + entry;
    }

    // Append to file
    await fs.promises.appendFile(filePath, content === entry ? entry : content, "utf-8");

    runtime.log?.(`[ringcentral] Saved chat message to ${filePath}`);
  } catch (err) {
    runtime.error?.(`[ringcentral] Failed to save chat message: ${String(err)}`);
  }
}

function normalizeUserId(raw?: string | null): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.toLowerCase();
}

export function isSenderAllowed(
  senderId: string,
  allowFrom: string[],
): boolean {
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = normalizeUserId(senderId);
  return allowFrom.some((entry) => {
    const normalized = String(entry).trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === normalizedSenderId) return true;
    if (normalized.replace(/^(ringcentral|rc):/i, "") === normalizedSenderId) return true;
    if (normalized.replace(/^user:/i, "") === normalizedSenderId) return true;
    return false;
  });
}

function resolveGroupConfig(params: {
  groupId: string;
  groupName?: string | null;
  groups?: Record<string, { requireMention?: boolean; allow?: boolean; enabled?: boolean; users?: Array<string | number>; systemPrompt?: string }>;
}) {
  const { groupId, groupName, groups } = params;
  const entries = groups ?? {};
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    return { entry: undefined, allowlistConfigured: false };
  }
  const normalizedName = groupName?.trim().toLowerCase();
  const candidates = [groupId, groupName ?? "", normalizedName ?? ""].filter(Boolean);
  let entry = candidates.map((candidate) => entries[candidate]).find(Boolean);
  if (!entry && normalizedName) {
    entry = entries[normalizedName];
  }
  const fallback = entries["*"];
  return { entry: entry ?? fallback, allowlistConfigured: true, fallback };
}

function extractMentionInfo(mentions: RingCentralMention[], botExtensionId?: string | null) {
  const personMentions = mentions.filter((entry) => entry.type === "Person");
  const hasAnyMention = personMentions.length > 0;
  const wasMentioned = botExtensionId
    ? personMentions.some((entry) => entry.id === botExtensionId)
    : false;
  return { hasAnyMention, wasMentioned };
}

function resolveBotDisplayName(params: {
  accountName?: string;
  agentId: string;
  config: MoltbotConfig;
}): string {
  const { accountName, agentId, config } = params;
  if (accountName?.trim()) return accountName.trim();
  const agent = config.agents?.list?.find((a) => a.id === agentId);
  if (agent?.name?.trim()) return agent.name.trim();
  return "Moltbot";
}

async function processWebSocketEvent(params: {
  event: RingCentralWebhookEvent;
  account: ResolvedRingCentralAccount;
  config: MoltbotConfig;
  runtime: RingCentralRuntimeEnv;
  core: RingCentralCoreRuntime;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  ownerId?: string;
}): Promise<void> {
  const { event, account, config, runtime, core, statusSink, ownerId } = params;
  
  const eventBody = event.body;
  if (!eventBody) return;

  // Check event type - can be from eventType field or inferred from event path
  const eventType = eventBody.eventType;
  const eventPath = event.event ?? "";
  const isPostEvent = eventPath.includes("/glip/posts") || eventPath.includes("/team-messaging") || eventType === "PostAdded";
  
  if (!isPostEvent) {
    return;
  }

  statusSink?.({ lastInboundAt: Date.now() });

  await processMessageWithPipeline({
    eventBody,
    account,
    config,
    runtime,
    core,
    statusSink,
    ownerId,
  });
}

async function processMessageWithPipeline(params: {
  eventBody: RingCentralEventBody;
  account: ResolvedRingCentralAccount;
  config: MoltbotConfig;
  runtime: RingCentralRuntimeEnv;
  core: RingCentralCoreRuntime;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  ownerId?: string;
}): Promise<void> {
  const { eventBody, account, config, runtime, core, statusSink, ownerId } = params;
  const mediaMaxMb = account.config.mediaMaxMb ?? 20;
  
  const chatId = eventBody.groupId ?? "";
  if (!chatId) return;

  const senderId = eventBody.creatorId ?? "";
  const messageText = (eventBody.text ?? "").trim();
  const attachments = eventBody.attachments ?? [];
  const hasMedia = attachments.length > 0;
  const rawBody = messageText || (hasMedia ? "<media:attachment>" : "");
  if (!rawBody) return;

  // Skip bot's own messages to avoid infinite loop
  // Check 1: Skip if this is a message we recently sent
  const messageId = eventBody.id ?? "";
  if (messageId && isOwnSentMessage(messageId)) {
    logVerbose(core, runtime, `skip own sent message: ${messageId}`);
    return;
  }
  
  // Check 2: Skip typing/thinking indicators (pattern-based)
  if (rawBody.includes("thinking...") || rawBody.includes("typing...")) {
    logVerbose(core, runtime, "skip typing indicator message");
    return;
  }
  
  // In JWT mode (selfOnly), only accept messages from the JWT user themselves
  // This is because the bot uses the JWT user's identity, so we're essentially
  // having a conversation with ourselves (the AI assistant)
  const selfOnly = account.config.selfOnly !== false; // default true
  runtime.log?.(`[${account.accountId}] Processing message: senderId=${senderId}, ownerId=${ownerId}, selfOnly=${selfOnly}, chatId=${chatId}`);
  
  if (selfOnly && ownerId) {
    if (senderId !== ownerId) {
      logVerbose(core, runtime, `ignore message from non-owner: ${senderId} (selfOnly mode)`);
      return;
    }
  }
  
  runtime.log?.(`[${account.accountId}] Message passed selfOnly check`);

  // Fetch chat info to determine type
  let chatType = "Group";
  let chatName: string | undefined;
  try {
    const chatInfo = await getRingCentralChat({ account, chatId });
    chatType = chatInfo?.type ?? "Group";
    chatName = chatInfo?.name ?? undefined;
  } catch {
    // If we can't fetch chat info, assume it's a group
  }

  // Personal, PersonalChat, Direct are all DM types
  const isPersonalChat = chatType === "Personal" || chatType === "PersonalChat";
  const isGroup = chatType !== "Direct" && chatType !== "PersonalChat" && chatType !== "Personal";
  runtime.log?.(`[${account.accountId}] Chat type: ${chatType}, isGroup: ${isGroup}`);

  // In selfOnly mode, only allow "Personal" chat (conversation with yourself)
  if (selfOnly && !isPersonalChat) {
    logVerbose(core, runtime, `ignore non-personal chat in selfOnly mode: chatType=${chatType}`);
    return;
  }

  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
  const groupConfigResolved = resolveGroupConfig({
    groupId: chatId,
    groupName: chatName ?? null,
    groups: account.config.groups ?? undefined,
  });
  const groupEntry = groupConfigResolved.entry;
  const groupUsers = groupEntry?.users ?? account.config.groupAllowFrom ?? [];
  let effectiveWasMentioned: boolean | undefined;

  if (isGroup) {
    runtime.log?.(`[${account.accountId}] Entering group processing: chatId=${chatId}, groupPolicy=${groupPolicy}, groupEntry=${!!groupEntry}`);
    if (groupPolicy === "disabled") {
      runtime.log?.(`[${account.accountId}] DROP: groupPolicy=disabled`);
      return;
    }
    const groupAllowlistConfigured = groupConfigResolved.allowlistConfigured;
    const groupAllowed =
      Boolean(groupEntry) || Boolean((account.config.groups ?? {})["*"]);
    runtime.log?.(`[${account.accountId}] Allowlist check: configured=${groupAllowlistConfigured}, allowed=${groupAllowed}`);
    if (groupPolicy === "allowlist") {
      if (!groupAllowlistConfigured) {
        runtime.log?.(`[${account.accountId}] DROP: no allowlist configured`);
        return;
      }
      if (!groupAllowed) {
        runtime.log?.(`[${account.accountId}] DROP: not in allowlist`);
        return;
      }
    }
    if (groupEntry?.enabled === false || groupEntry?.allow === false) {
      logVerbose(core, runtime, `drop group message (chat disabled, chat=${chatId})`);
      return;
    }

    if (groupUsers.length > 0) {
      const ok = isSenderAllowed(senderId, groupUsers.map((v) => String(v)));
      if (!ok) {
        logVerbose(core, runtime, `drop group message (sender not allowed, ${senderId})`);
        return;
      }
    }

    // Save group chat message to workspace for analysis/logging
    // This happens AFTER allowlist check but BEFORE mention check,
    // so we log all messages from monitored groups regardless of AI response
    const workspace = config.agents?.defaults?.workspace;
    runtime.log?.(`[${account.accountId}] Group message logging: workspace=${workspace}, chatId=${chatId}, senderId=${senderId}`);
    if (workspace) {
      void saveGroupChatMessage({
        workspace,
        chatId,
        chatName,
        senderId,
        messageText: rawBody,
        timestamp: eventBody.creationTime,
        runtime,
      });
    } else {
      runtime.log?.(`[${account.accountId}] Skipping chat log: no workspace configured`);
    }
  }

  const dmPolicy = account.config.dm?.policy ?? account.config.dmPolicy ?? "pairing";
  const configAllowFrom = account.config.dm?.allowFrom ?? account.config.allowFrom ?? [];
  const configAllowFromStr = configAllowFrom.map((v) => String(v));
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore("ringcentral").catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFromStr, ...storeAllowFrom];
  const commandAllowFrom = isGroup ? groupUsers.map((v) => String(v)) : effectiveAllowFrom;
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(senderId, commandAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: commandAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  if (isGroup) {
    const requireMention = groupEntry?.requireMention ?? account.config.requireMention ?? true;
    const mentions = eventBody.mentions ?? [];
    const mentionInfo = extractMentionInfo(mentions, account.config.botExtensionId);
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg: config,
      surface: "ringcentral",
    });
    const mentionGate = resolveMentionGatingWithBypass({
      isGroup: true,
      requireMention,
      canDetectMention: Boolean(account.config.botExtensionId),
      wasMentioned: mentionInfo.wasMentioned,
      implicitMention: false,
      hasAnyMention: mentionInfo.hasAnyMention,
      allowTextCommands,
      hasControlCommand: core.channel.text.hasControlCommand(rawBody, config),
      commandAuthorized: commandAuthorized === true,
    });
    effectiveWasMentioned = mentionGate.effectiveWasMentioned;
    
    // Response decision is now delegated to the AI based on SOUL/identity
    // Plugin only handles mention gating; AI decides whether to respond or NO_REPLY
    
    if (mentionGate.shouldSkip) {
      logVerbose(core, runtime, `drop group message (mention required, chat=${chatId})`);
      return;
    }
  }

  // DM policy check
  // - selfOnly=true (default): only Personal chat (self) is allowed (checked above via isPersonalChat)
  // - selfOnly=false: allow DMs based on dmPolicy/allowFrom
  if (!isGroup && !selfOnly) {
    // Non-selfOnly mode: check dmPolicy and allowFrom
    if (dmPolicy === "disabled") {
      logVerbose(core, runtime, `ignore DM (dmPolicy=disabled)`);
      return;
    }
    if (dmPolicy === "allowlist" && !isSenderAllowed(senderId, effectiveAllowFrom)) {
      logVerbose(core, runtime, `ignore DM from ${senderId} (not in allowFrom)`);
      return;
    }
  }

  if (
    isGroup &&
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(core, runtime, `ringcentral: drop control command from ${senderId}`);
    return;
  }

  // Session key should be per conversation id (RingCentral chatId)
  // NOTE: keep peer.kind stable for group vs dm.
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "ringcentral",
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "dm",
      id: chatId, // conversation id
    },
  });

  let mediaPath: string | undefined;
  let mediaType: string | undefined;
  if (attachments.length > 0) {
    const first = attachments[0];
    const attachmentData = await downloadAttachment(first, account, mediaMaxMb, core);
    if (attachmentData) {
      mediaPath = attachmentData.path;
      mediaType = attachmentData.contentType;
    }
  }

  // NOTE: label is set later via conversationLabel (after chatName lookup).
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "RingCentral",
    from: isGroup
      ? (chatName?.trim() ? chatName.trim() : `chat:${chatId}`)
      : `user:${senderId}`,
    timestamp: eventBody.creationTime ? Date.parse(eventBody.creationTime) : undefined,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const groupSystemPrompt = groupConfigResolved.entry?.systemPrompt?.trim() || undefined;

  // Build a better conversation label for sessions/dashboard.
  // - Prefer chatName when available
  // - Fallback to chat:<chatId>
  // NOTE: We intentionally do NOT try to expand members -> display names here yet.
  const conversationLabel = isGroup
    ? (chatName?.trim() ? chatName.trim() : `chat:${chatId}`)
    : `user:${senderId}`;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    // IMPORTANT:
    // Moltbot derives group metadata (groupId/displayName) from ctx.From for group/channel chats.
    // So for RingCentral groups we must include the conversation id (chatId) in From.
    From: isGroup ? `ringcentral:group:${chatId}` : `ringcentral:${senderId}`,
    To: `ringcentral:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "channel" : "direct",
    ConversationLabel: conversationLabel,
    SenderId: senderId,
    WasMentioned: isGroup ? effectiveWasMentioned : undefined,
    CommandAuthorized: commandAuthorized,
    Provider: "ringcentral",
    Surface: "ringcentral",
    MessageSid: eventBody.id,
    MessageSidFull: eventBody.id,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
    GroupSpace: isGroup ? (chatName?.trim() ? chatName.trim() : undefined) : undefined,
    GroupSystemPrompt: isGroup ? groupSystemPrompt : undefined,
    OriginatingChannel: "ringcentral",
    OriginatingTo: `ringcentral:${chatId}`,
  });

  // DEBUG: log critical routing/meta fields to confirm which ctx values are actually being used at runtime.
  runtime.log?.(
    `[default] inbound-meta: isGroup=${isGroup} chatType=${chatType} chatId=${chatId} senderId=${senderId} chatName=${JSON.stringify(
      chatName ?? null,
    )} sessionKey=${route.sessionKey} ctx.From=${ctxPayload.From} ctx.To=${ctxPayload.To} ConversationLabel=${JSON.stringify(
      conversationLabel,
    )}`,
  );

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(`ringcentral: failed updating session meta: ${String(err)}`);
    });

  // Backfill / repair session label for existing sessions.
  // Some sessions may have been created earlier with fallback labels (e.g. `chat:<id>`)
  // before we started passing ConversationLabel / GroupSpace.
  try {
    if (isGroup && chatName?.trim()) {
      const repairedLabel = chatName.trim();
      const fallbackLabel = `chat:${chatId}`;

      // If we only have a fallback label, overwrite it with the real group name.
      // NOTE: recordSessionMetaFromInbound merges meta; this second call ensures the
      // dashboard/session list picks up the newer label even for pre-existing sessions.
      if (conversationLabel === fallbackLabel) {
        void core.channel.session.recordSessionMetaFromInbound({
          storePath,
          sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
          ctx: {
            ...ctxPayload,
            ConversationLabel: repairedLabel,
            GroupSpace: repairedLabel,
          },
        });
      }
    }
  } catch (err) {
    runtime.error?.(`ringcentral: failed repairing session label: ${String(err)}`);
  }

  // Typing indicator disabled - respond directly without "thinking" message

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      deliver: async (payload) => {
        await deliverRingCentralReply({
          payload,
          account,
          chatId,
          runtime,
          core,
          config,
          statusSink,
          typingPostId: undefined,
        });
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] RingCentral ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
  });
}

async function downloadAttachment(
  attachment: RingCentralAttachment,
  account: ResolvedRingCentralAccount,
  mediaMaxMb: number,
  core: RingCentralCoreRuntime,
): Promise<{ path: string; contentType?: string } | null> {
  const contentUri = attachment.contentUri;
  if (!contentUri) return null;
  const maxBytes = Math.max(1, mediaMaxMb) * 1024 * 1024;
  const downloaded = await downloadRingCentralAttachment({ account, contentUri, maxBytes });
  const saved = await core.channel.media.saveMediaBuffer(
    downloaded.buffer,
    downloaded.contentType ?? attachment.contentType,
    "inbound",
    maxBytes,
    attachment.name,
  );
  return { path: saved.path, contentType: saved.contentType };
}

async function deliverRingCentralReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string };
  account: ResolvedRingCentralAccount;
  chatId: string;
  runtime: RingCentralRuntimeEnv;
  core: RingCentralCoreRuntime;
  config: MoltbotConfig;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  typingPostId?: string;
}): Promise<void> {
  const { payload, account, chatId, runtime, core, config, statusSink, typingPostId } = params;
  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];

  if (mediaList.length > 0) {
    let suppressCaption = false;
    if (typingPostId) {
      try {
        await deleteRingCentralMessage({
          account,
          chatId,
          postId: typingPostId,
        });
      } catch (err) {
        runtime.error?.(`RingCentral typing cleanup failed: ${String(err)}`);
        const fallbackText = payload.text?.trim()
          ? payload.text
          : mediaList.length > 1
            ? "Sent attachments."
            : "Sent attachment.";
        try {
          await updateRingCentralMessage({
            account,
            chatId,
            postId: typingPostId,
            text: fallbackText,
          });
          suppressCaption = Boolean(payload.text?.trim());
        } catch (updateErr) {
          runtime.error?.(`RingCentral typing update failed: ${String(updateErr)}`);
        }
      }
    }
    let first = true;
    for (const mediaUrl of mediaList) {
      const caption = first && !suppressCaption ? payload.text : undefined;
      first = false;
      try {
        const loaded = await core.channel.media.fetchRemoteMedia(mediaUrl, {
          maxBytes: (account.config.mediaMaxMb ?? 20) * 1024 * 1024,
        });
        const upload = await uploadRingCentralAttachment({
          account,
          chatId,
          filename: loaded.filename ?? "attachment",
          buffer: loaded.buffer,
          contentType: loaded.contentType,
        });
        if (!upload.attachmentId) {
          throw new Error("missing attachment id");
        }
        const sendResult = await sendRingCentralMessage({
          account,
          chatId,
          text: caption,
          attachments: [{ id: upload.attachmentId }],
        });
        if (sendResult?.postId) trackSentMessageId(sendResult.postId);
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error?.(`RingCentral attachment send failed: ${String(err)}`);
      }
    }
    return;
  }

  if (payload.text) {
    const chunkLimit = account.config.textChunkLimit ?? 4000;
    const chunkMode = core.channel.text.resolveChunkMode(
      config,
      "ringcentral",
      account.accountId,
    );
    const chunks = core.channel.text.chunkMarkdownTextWithMode(
      payload.text,
      chunkLimit,
      chunkMode,
    );
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        if (i === 0 && typingPostId) {
          const updateResult = await updateRingCentralMessage({
            account,
            chatId,
            postId: typingPostId,
            text: chunk,
          });
          if (updateResult?.postId) trackSentMessageId(updateResult.postId);
        } else {
          const sendResult = await sendRingCentralMessage({
            account,
            chatId,
            text: chunk,
          });
          if (sendResult?.postId) trackSentMessageId(sendResult.postId);
        }
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error?.(`RingCentral message send failed: ${String(err)}`);
      }
    }
  }
}

export async function startRingCentralMonitor(
  options: RingCentralMonitorOptions,
): Promise<() => void> {
  const { account, config, runtime, abortSignal, statusSink } = options;
  const core = getRingCentralRuntime();

  let wsSubscription: Awaited<ReturnType<ReturnType<InstanceType<typeof Subscriptions>["createSubscription"]>["register"]>> | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isShuttingDown = false;
  let ownerId: string | undefined;

  // Calculate delay with exponential backoff
  const getReconnectDelay = () => {
    const delay = Math.min(
      RECONNECT_INITIAL_DELAY * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    return delay;
  };

  // Create and setup subscription
  const createSubscription = async (): Promise<void> => {
    if (isShuttingDown || abortSignal.aborted) return;

    runtime.log?.(`[${account.accountId}] Starting RingCentral WebSocket subscription...`);

    try {
      // Get SDK instance
      const sdk = await getRingCentralSDK(account);
      
      // Create subscriptions manager
      const subscriptions = new Subscriptions({ sdk });
      const subscription = subscriptions.createSubscription();

      // Track current user ID to filter out self messages
      if (!ownerId) {
        try {
          const platform = sdk.platform();
          const response = await platform.get("/restapi/v1.0/account/~/extension/~");
          const userInfo = await response.json();
          ownerId = userInfo?.id?.toString();
          runtime.log?.(`[${account.accountId}] Authenticated as extension: ${ownerId}`);
        } catch (err) {
          runtime.error?.(`[${account.accountId}] Failed to get current user: ${String(err)}`);
        }
      }

      // Handle notifications
      subscription.on(subscription.events.notification, (event: unknown) => {
        logVerbose(core, runtime, `WebSocket notification received: ${JSON.stringify(event).slice(0, 500)}`);
        const evt = event as RingCentralWebhookEvent;
        processWebSocketEvent({
          event: evt,
          account,
          config,
          runtime,
          core,
          statusSink,
          ownerId,
        }).catch((err) => {
          runtime.error?.(`[${account.accountId}] WebSocket event processing failed: ${String(err)}`);
        });
      });

      // Subscribe to Team Messaging events and save WsSubscription for cleanup
      wsSubscription = await subscription
        .setEventFilters([
          "/restapi/v1.0/glip/posts",
          "/restapi/v1.0/glip/groups",
        ])
        .register();
      
      runtime.log?.(`[${account.accountId}] RingCentral WebSocket subscription established`);
      reconnectAttempts = 0; // Reset on success

    } catch (err) {
      runtime.error?.(`[${account.accountId}] Failed to create WebSocket subscription: ${String(err)}`);
      scheduleReconnect();
    }
  };

  // Schedule reconnection with exponential backoff
  const scheduleReconnect = () => {
    if (isShuttingDown || abortSignal.aborted) return;
    if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      runtime.error?.(`[${account.accountId}] Max reconnection attempts (${RECONNECT_MAX_ATTEMPTS}) reached. Giving up.`);
      return;
    }

    const delay = getReconnectDelay();
    reconnectAttempts++;
    runtime.log?.(`[${account.accountId}] Scheduling reconnection attempt ${reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS} in ${delay}ms...`);

    // Clean up existing WsSubscription
    if (wsSubscription) {
      wsSubscription.revoke().catch(() => {});
      wsSubscription = null;
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      createSubscription().catch((err) => {
        runtime.error?.(`[${account.accountId}] Reconnection failed: ${String(err)}`);
      });
    }, delay);
  };

  // Initial connection
  await createSubscription();

  // Handle abort signal
  const cleanup = () => {
    isShuttingDown = true;
    runtime.log?.(`[${account.accountId}] Stopping RingCentral WebSocket subscription...`);
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    if (wsSubscription) {
      wsSubscription.revoke().catch((err) => {
        runtime.error?.(`[${account.accountId}] Failed to revoke subscription: ${String(err)}`);
      });
      wsSubscription = null;
    }
  };

  if (abortSignal.aborted) {
    cleanup();
  } else {
    abortSignal.addEventListener("abort", cleanup, { once: true });
  }

  return cleanup;
}

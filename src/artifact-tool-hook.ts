import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { RINGCENTRAL_ARTIFACT_TOOL_NAMES } from "./artifact-tools.js";
import { getRingCentralNativeChatId } from "./conversation-context.js";
import {
  RINGCENTRAL_REPORT_TARGET_PARAM,
  RINGCENTRAL_REPORT_UPLOAD_TOOL_NAME,
} from "./report-upload-tool.js";

type BeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type BeforeToolCallContext = {
  sessionKey?: string;
  channelId?: string;
};

const AUTO_TARGET_TOOL_NAMES: Set<string> = new Set(
  RINGCENTRAL_ARTIFACT_TOOL_NAMES.filter((name) => name !== "ringcentral_confirm_artifact_action"),
);

const RINGCENTRAL_GROUP_SESSION_MARKERS = [
  ":ringcentral:channel:",
  ":ringcentral:group:",
  "ringcentral:channel:",
  "ringcentral:group:",
];

export function registerRingCentralArtifactToolHook(api: OpenClawPluginApi): void {
  api.on("before_tool_call", (event, ctx) => injectRingCentralArtifactToolChatId(event, ctx));
}

export function injectRingCentralArtifactToolChatId(
  event: BeforeToolCallEvent,
  ctx: BeforeToolCallContext,
): { params: Record<string, unknown> } | void {
  if (event.toolName === RINGCENTRAL_REPORT_UPLOAD_TOOL_NAME) {
    const target = resolveRingCentralSessionTarget(ctx);
    if (!target) {
      return;
    }
    return {
      params: {
        ...event.params,
        [RINGCENTRAL_REPORT_TARGET_PARAM]: target,
      },
    };
  }
  if (!AUTO_TARGET_TOOL_NAMES.has(event.toolName)) {
    return;
  }
  if (hasExplicitArtifactTarget(event.params)) {
    return;
  }
  const chatId = resolveRingCentralSessionChatId(ctx);
  if (!chatId) {
    return;
  }
  return {
    params: {
      ...event.params,
      chat_id: chatId,
    },
  };
}

function resolveRingCentralSessionTarget(ctx: BeforeToolCallContext): string | undefined {
  const rememberedChatId = getRingCentralNativeChatId(readString(ctx.sessionKey));
  if (rememberedChatId) {
    return `channel:${rememberedChatId}`;
  }
  const nativeChannelId = readString(ctx.channelId);
  if (nativeChannelId && nativeChannelId !== "ringcentral") {
    return `channel:${nativeChannelId}`;
  }
  const raw = readString(ctx.sessionKey);
  if (!raw) return undefined;
  const directMarker = ":ringcentral:direct:";
  const directIndex = raw.toLowerCase().indexOf(directMarker);
  if (directIndex !== -1) {
    // A person ID is not a RingCentral chat/group ID. Direct uploads require
    // the native chat ID remembered from the current trusted inbound event.
    return undefined;
  }
  const chatId = readRingCentralGroupOrChannelSessionId(ctx.sessionKey);
  return chatId ? `channel:${chatId.split(":sender:", 1)[0]}` : undefined;
}

function hasExplicitArtifactTarget(params: Record<string, unknown>): boolean {
  return (
    readString(params.chat_id) !== undefined ||
    readString(params.chatId) !== undefined ||
    readString(params.target) !== undefined
  );
}

function resolveRingCentralSessionChatId(ctx: BeforeToolCallContext): string | undefined {
  const fromSession = readRingCentralGroupOrChannelSessionId(ctx.sessionKey);
  if (!fromSession) return undefined;
  const channelId = readString(ctx.channelId);
  return channelId && channelId !== "ringcentral" ? channelId : fromSession;
}

function readRingCentralGroupOrChannelSessionId(sessionKey: unknown): string | undefined {
  const raw = readString(sessionKey);
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  for (const marker of RINGCENTRAL_GROUP_SESSION_MARKERS) {
    const markerIndex = lower.indexOf(marker);
    if (markerIndex === -1) continue;
    const start = markerIndex + marker.length;
    const rawId = raw.slice(start);
    const threadIndex = rawId.toLowerCase().lastIndexOf(":thread:");
    const senderIndex = rawId.toLowerCase().lastIndexOf(":sender:");
    const suffixIndexes = [threadIndex, senderIndex].filter((index) => index !== -1);
    const suffixIndex = suffixIndexes.length ? Math.min(...suffixIndexes) : -1;
    return (suffixIndex === -1 ? rawId : rawId.slice(0, suffixIndex)).trim() || undefined;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

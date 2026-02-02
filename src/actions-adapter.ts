import type { OpenClawConfig } from "openclaw/plugin-sdk";

import { listRingCentralAccountIds, resolveRingCentralAccount } from "./accounts.js";
import {
  readRingCentralMessages,
  sendRingCentralMessageAction,
  editRingCentralMessage,
  deleteRingCentralMessageAction,
  getRingCentralChatInfo,
} from "./actions.js";
import { normalizeRingCentralTarget } from "./targets.js";
import type { RingCentralActionsConfig } from "./types.js";

// Action names supported by RingCentral
type RingCentralActionName = "send" | "read" | "edit" | "delete" | "channel-info";

type ChannelMessageActionContext = {
  channel: string;
  action: string;
  cfg: OpenClawConfig;
  params: Record<string, unknown>;
  accountId?: string | null;
};

type AgentToolResult<T> = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function jsonResult<T>(data: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  opts?: { required?: boolean },
): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    if (opts?.required) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  return String(value).trim();
}

function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  opts?: { integer?: boolean },
): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return undefined;
  }
  return opts?.integer ? Math.floor(num) : num;
}

function resolveChannelId(params: Record<string, unknown>): string {
  const chatId = readStringParam(params, "chatId") ?? readStringParam(params, "channelId");
  if (!chatId) {
    throw new Error("chatId or channelId is required");
  }
  const normalized = normalizeRingCentralTarget(chatId);
  if (!normalized) {
    throw new Error(`Invalid RingCentral chat ID: ${chatId}`);
  }
  return normalized;
}

export type RingCentralMessageActionAdapter = {
  listActions: (params: { cfg: OpenClawConfig }) => RingCentralActionName[];
  supportsAction: (params: { action: string }) => boolean;
  handleAction: (ctx: ChannelMessageActionContext) => Promise<AgentToolResult<unknown>>;
};

export const ringcentralMessageActions: RingCentralMessageActionAdapter = {
  listActions: ({ cfg }) => {
    const accountIds = listRingCentralAccountIds(cfg);
    if (accountIds.length === 0) return [];

    const accounts = accountIds.map((accountId) =>
      resolveRingCentralAccount({ cfg, accountId }),
    );
    const configuredAccounts = accounts.filter(
      (account) => account.credentialSource !== "none",
    );
    if (configuredAccounts.length === 0) return [];

    const actions = new Set<RingCentralActionName>(["send"]);

    // Check if any account has messages actions enabled
    const isActionEnabled = (key: keyof RingCentralActionsConfig, defaultValue = true) => {
      for (const account of configuredAccounts) {
        const actionsConfig = account.config.actions;
        if (!actionsConfig) return defaultValue;
        const value = actionsConfig[key];
        if (typeof value === "boolean" ? value : defaultValue) return true;
      }
      return false;
    };

    if (isActionEnabled("messages")) {
      actions.add("read");
      actions.add("edit");
      actions.add("delete");
    }

    if (isActionEnabled("channelInfo")) {
      actions.add("channel-info");
    }

    return Array.from(actions);
  },

  supportsAction: ({ action }) => {
    const supportedActions = new Set<string>([
      "send",
      "read",
      "edit",
      "delete",
      "channel-info",
    ]);
    return supportedActions.has(action);
  },

  handleAction: async (ctx) => {
    const { action, cfg, params, accountId } = ctx;

    try {
      if (action === "send") {
        const chatId = resolveChannelId(params);
        const message = readStringParam(params, "message", { required: true });
        if (!message) {
          return errorResult("message is required");
        }

        const result = await sendRingCentralMessageAction(chatId, message, {
          cfg,
          accountId: accountId ?? undefined,
        });

        return jsonResult({
          status: "ok",
          messageId: result.messageId,
          chatId,
        });
      }

      if (action === "read") {
        const chatId = resolveChannelId(params);
        const limit = readNumberParam(params, "limit", { integer: true });
        const pageToken = readStringParam(params, "pageToken") ?? readStringParam(params, "before");

        const result = await readRingCentralMessages(chatId, {
          cfg,
          accountId: accountId ?? undefined,
          limit,
          pageToken,
        });

        return jsonResult({
          status: "ok",
          chatId,
          messages: result.messages,
          hasMore: result.hasMore,
          nextPageToken: result.nextPageToken,
        });
      }

      if (action === "edit") {
        const chatId = resolveChannelId(params);
        const messageId = readStringParam(params, "messageId", { required: true });
        const message = readStringParam(params, "message", { required: true });
        if (!messageId || !message) {
          return errorResult("messageId and message are required");
        }

        const result = await editRingCentralMessage(chatId, messageId, message, {
          cfg,
          accountId: accountId ?? undefined,
        });

        return jsonResult({
          status: "ok",
          messageId: result.messageId,
          chatId,
        });
      }

      if (action === "delete") {
        const chatId = resolveChannelId(params);
        const messageId = readStringParam(params, "messageId", { required: true });
        if (!messageId) {
          return errorResult("messageId is required");
        }

        await deleteRingCentralMessageAction(chatId, messageId, {
          cfg,
          accountId: accountId ?? undefined,
        });

        return jsonResult({
          status: "ok",
          deleted: true,
          chatId,
          messageId,
        });
      }

      if (action === "channel-info") {
        const chatId = resolveChannelId(params);

        const info = await getRingCentralChatInfo(chatId, {
          cfg,
          accountId: accountId ?? undefined,
        });

        if (!info) {
          return errorResult(`Chat not found: ${chatId}`);
        }

        return jsonResult({
          status: "ok",
          ...info,
        });
      }

      return errorResult(`Unsupported action: ${action}`);
    } catch (err) {
      return errorResult(String(err));
    }
  },
};

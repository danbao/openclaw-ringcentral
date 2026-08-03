import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { AgentToolResult } from "openclaw/plugin-sdk/agent-core";
import type { ChannelAgentTool } from "openclaw/plugin-sdk/channel-contract";
import { Type } from "typebox";
import { getRcConfig, resolveAccount } from "./accounts.js";
import { createBotClient } from "./client.js";
import { tryGetRingCentralRuntime } from "./runtime.js";
import { parseTarget } from "./targets.js";
import type { RingCentralConfig } from "./types.js";

export const RINGCENTRAL_REPORT_UPLOAD_TOOL_NAME = "ringcentral_upload_log_report";

const REPORT_NAME = /^report-[a-f0-9]{32}\.html$/;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_MAX_BYTES = 100 * 1024 * 1024;
export const RINGCENTRAL_REPORT_TARGET_PARAM = "_ringcentral_current_target";

export function createRingCentralReportUploadTool(cfg?: unknown): ChannelAgentTool {
  return {
    name: RINGCENTRAL_REPORT_UPLOAD_TOOL_NAME,
    label: "Upload RingCentral Log Report",
    description:
      "Upload a validated HTML log report to the current RingCentral conversation. " +
      "The conversation target is derived from trusted runtime context and cannot be supplied as an argument.",
    parameters: Type.Object({
      file_name: Type.String({
        description: "Opaque report basename formatted as report-<32 lowercase hex>.html.",
        pattern: REPORT_NAME.source,
      }),
    }),
    execute: async (_toolCallId, rawParams) => {
      const params = asRecord(rawParams);
      const fileName = readString(params.file_name);
      if (!fileName) {
        return errorResult("file_name is required.");
      }
      const target = readString(params[RINGCENTRAL_REPORT_TARGET_PARAM]);
      if (!target) {
        return errorResult("A current RingCentral conversation is required.");
      }

      try {
        const channelConfig = resolveToolChannelConfig(cfg);
        const reportUploads = channelConfig.reportUploads ?? {};
        if (reportUploads.enabled !== true) {
          return errorResult("RingCentral report uploads are disabled.");
        }
        if (!reportUploads.rootDir?.trim()) {
          return errorResult("RingCentral reportUploads.rootDir is not configured.");
        }
        const account = resolveAccount(channelConfig);
        const report = await loadReport(
          reportUploads.rootDir,
          fileName,
          clampMaxBytes(reportUploads.maxBytes),
        );
        const parsedTarget = parseTarget(target);
        if (!parsedTarget) {
          return errorResult("The current RingCentral conversation target is invalid.");
        }
        const client = createBotClient(account.server, account.botToken);
        const chatId =
          parsedTarget.kind === "user"
            ? (await client.createOrFindDm([parsedTarget.id])).id
            : parsedTarget.id;
        const uploaded = await client.uploadFile(
          chatId,
          fileName,
          report.data,
          "text/html; charset=utf-8",
        );
        return okResult({
          success: true,
          file_name: fileName,
          size: report.size,
          sha256: report.sha256,
          post_id: uploaded.id,
        });
      } catch (err) {
        return errorResult(`RingCentral report upload failed: ${formatError(err)}`);
      }
    },
  };
}

export async function loadReport(
  rootDir: string,
  fileName: string,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ data: Buffer; size: number; sha256: string }> {
  validateReportName(fileName);
  const root = await realpath(rootDir);
  const candidate = path.resolve(root, fileName);
  if (path.dirname(candidate) !== root) {
    throw new Error("Report path escapes the configured root directory");
  }
  const resolved = await realpath(candidate);
  if (path.dirname(resolved) !== root) {
    throw new Error("Report symlink escapes the configured root directory");
  }

  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error("Report is not a regular file");
    }
    if (info.size < 1 || info.size > maxBytes) {
      throw new Error(`Report size ${info.size} is outside the allowed range`);
    }
    const data = await handle.readFile();
    if (data.byteLength !== info.size || data.byteLength > maxBytes) {
      throw new Error("Report changed while it was being read");
    }
    assertSelfContainedHtml(data);
    return {
      data,
      size: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

export function validateReportName(fileName: string): void {
  if (!REPORT_NAME.test(fileName) || path.basename(fileName) !== fileName) {
    throw new Error("Invalid report name; expected report-<32 lowercase hex>.html");
  }
}

function assertSelfContainedHtml(data: Buffer): void {
  const text = data.toString("utf8");
  if (!/^\s*<!doctype html>/i.test(text) || !/<html\b/i.test(text)) {
    throw new Error("Report is not a complete HTML document");
  }
  const forbidden = [
    /<(?:script|iframe|object|embed|base|form|link)\b/i,
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i,
    /\son[a-z]+\s*=/i,
    /\b(?:src|srcset|href|xlink:href|action|formaction|poster)\s*=\s*(?:["']\s*)?(?:https?:|\/\/|data:)/i,
    /@import\b/i,
    /url\s*\(\s*["']?\s*(?:https?:|\/\/|data:)/i,
  ];
  if (forbidden.some((pattern) => pattern.test(text))) {
    throw new Error("Report must be self-contained and cannot embed remote content");
  }
}

function resolveToolChannelConfig(cfg: unknown): RingCentralConfig {
  const fullConfig = getRcConfig(cfg);
  if (Object.keys(fullConfig).length > 0) {
    return fullConfig;
  }
  if (looksLikeChannelConfig(cfg)) {
    return cfg as RingCentralConfig;
  }
  const runtime = tryGetRingCentralRuntime();
  try {
    return runtime ? getRcConfig(runtime.config.current()) : {};
  } catch {
    return {};
  }
}

function looksLikeChannelConfig(value: unknown): value is RingCentralConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return ["botToken", "server", "reportUploads", "teams", "dmPolicy"].some((key) =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
}

function clampMaxBytes(value: number | undefined): number {
  const parsed = Number(value ?? DEFAULT_MAX_BYTES);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_BYTES;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_MAX_BYTES);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function okResult(details: Record<string, unknown>): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function errorResult(message: string): AgentToolResult<unknown> {
  return okResult({ success: false, error: message });
}

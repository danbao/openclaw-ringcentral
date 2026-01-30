declare module "openclaw/plugin-sdk" {
  import { z } from "zod";

  // Types
  export type OpenClawConfig = {
    channels?: Record<string, unknown>;
    [key: string]: unknown;
  };

  export type OpenClawPluginApi = {
    runtime: PluginRuntime;
    registerChannel(opts: { plugin: ChannelPlugin; dock: ChannelDock }): void;
    [key: string]: unknown;
  };

  export type PluginRuntime = {
    log: {
      info(msg: string, ...args: unknown[]): void;
      warn(msg: string, ...args: unknown[]): void;
      error(msg: string, ...args: unknown[]): void;
      debug(msg: string, ...args: unknown[]): void;
    };
    [key: string]: unknown;
  };

  export type ChannelPlugin = {
    id: string;
    [key: string]: unknown;
  };

  export type ChannelDock = {
    id: string;
    [key: string]: unknown;
  };

  export type DmPolicy = "open" | "allowlist" | "disabled";
  export type GroupPolicy = "open" | "allowlist" | "disabled";
  export type MarkdownConfig = {
    enabled?: boolean;
    [key: string]: unknown;
  };

  // Constants
  export const DEFAULT_ACCOUNT_ID: string;

  // Functions
  export function normalizeAccountId(accountId: string | undefined): string;
  export function emptyPluginConfigSchema(): z.ZodObject<Record<string, never>>;
  export function resolveMentionGatingWithBypass(opts: unknown): unknown;
  export function requireOpenAllowFrom(opts: unknown): void;
  export function applyAccountNameToChannelSection(opts: unknown): unknown;
  export function buildChannelConfigSchema(opts: unknown): unknown;
  export function deleteAccountFromConfigSection(opts: unknown): unknown;
  export function formatPairingApproveHint(opts: unknown): string;
  export function migrateBaseNameToDefaultAccount(opts: unknown): unknown;
  export function missingTargetError(opts: unknown): Error;
  export function setAccountEnabledInConfigSection(opts: unknown): unknown;
  export function resolveChannelMediaMaxBytes(opts: unknown): number;

  // Constants for messages
  export const PAIRING_APPROVED_MESSAGE: string;

  // Zod Schemas
  export const BlockStreamingCoalesceSchema: z.ZodType<unknown>;
  export const DmPolicySchema: z.ZodType<DmPolicy>;
  export const GroupPolicySchema: z.ZodType<GroupPolicy>;
  export const MarkdownConfigSchema: z.ZodType<MarkdownConfig>;
}

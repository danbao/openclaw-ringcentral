declare module "openclaw/plugin-sdk" {
  import { z } from "zod";

  // Agent Types
  export type AgentConfig = {
    id: string;
    name?: string;
    [key: string]: unknown;
  };

  // Base Types
  export type OpenClawConfig = {
    channels?: {
      defaults?: {
        groupPolicy?: GroupPolicy;
        [key: string]: unknown;
      };
      ringcentral?: {
        enabled?: boolean;
        accounts?: Record<string, unknown>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    agents?: {
      list?: AgentConfig[];
      [key: string]: unknown;
    };
    commands?: {
      useAccessGroups?: boolean;
      [key: string]: unknown;
    };
    session?: {
      store?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  export type OpenClawPluginApi = {
    runtime: PluginRuntime;
    registerChannel(opts: { plugin: ChannelPlugin; dock: ChannelDock }): void;
    [key: string]: unknown;
  };

  export type PluginLogger = {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  // Channel Runtime Types
  export type ChannelRuntime = {
    text: {
      chunkMarkdownText: (text: string, limit: number) => string[];
      chunkMarkdownTextWithMode: (text: string, limit: number, mode: string) => string[];
      resolveChunkMode: (config: OpenClawConfig, channel: string, accountId: string) => string;
      hasControlCommand: (body: string, config: OpenClawConfig) => boolean;
    };
    media: {
      fetchRemoteMedia: (url: string, opts: { maxBytes?: number }) => Promise<{
        buffer: Buffer;
        filename?: string;
        contentType?: string;
      }>;
      saveTempMedia: (opts: { buffer: Buffer; contentType?: string; filename?: string }) => Promise<string>;
      saveMediaBuffer: (buffer: Buffer, contentType: string | undefined, direction: string, maxBytes: number, filename?: string) => Promise<{ path: string; contentType?: string }>;
    };
    commands: {
      shouldComputeCommandAuthorized: (body: string, config: OpenClawConfig) => boolean;
      shouldHandleTextCommands: (opts: { cfg: OpenClawConfig; surface: string }) => boolean;
      isControlCommandMessage: (body: string, config: OpenClawConfig) => boolean;
      resolveCommandAuthorizedFromAuthorizers: (opts: {
        useAccessGroups: boolean;
        authorizers: Array<{ configured: boolean; allowed: boolean }>;
      }) => boolean | undefined;
    };
    pairing: {
      readAllowFromStore: (channel: string) => Promise<string[]>;
    };
    routing: {
      resolveAgentRoute: (opts: {
        cfg: OpenClawConfig;
        channel: string;
        accountId: string;
        peer: { kind: string; id: string };
      }) => { agentId: string; sessionKey: string; accountId: string };
    };
    session: {
      resolveStorePath: (store: string | undefined, opts: { agentId: string }) => string;
      readSessionUpdatedAt: (opts: { storePath: string; sessionKey: string }) => number | undefined;
      recordSessionMetaFromInbound: (opts: { storePath: string; sessionKey: string; ctx: Record<string, unknown> }) => Promise<void>;
    };
    reply: {
      resolveEnvelopeFormatOptions: (config: OpenClawConfig) => Record<string, unknown>;
      formatAgentEnvelope: (opts: {
        channel: string;
        from: string;
        timestamp?: number;
        previousTimestamp?: number;
        envelope: Record<string, unknown>;
        body: string;
      }) => string;
      finalizeInboundContext: (payload: Record<string, unknown>) => Record<string, unknown>;
      dispatchReplyWithBufferedBlockDispatcher: (opts: {
        ctx: Record<string, unknown>;
        cfg: OpenClawConfig;
        dispatcherOptions: {
          deliver: (payload: { text?: string; mediaUrl?: string; error?: Error }) => Promise<void>;
          onError: (err: unknown, info: { kind: string }) => void;
        };
      }) => Promise<void>;
    };
    inbound: {
      handleInbound: (opts: {
        channel: string;
        context: Record<string, unknown>;
        replyFn: (response: { message?: string; error?: Error }, info: Record<string, unknown>) => Promise<void>;
        agentRoute?: { agentId: string; sessionKey: string };
        sessionPath?: string;
        groupSystemPrompt?: string;
        abortSignal?: AbortSignal;
      }) => Promise<void>;
    };
    groups: {
      resolveGroupConfig: (opts: {
        channel: string;
        groupId: string;
        accountId: string;
        cfg: OpenClawConfig;
      }) => {
        isAllowed: boolean;
        allowlist: string[];
        users: string[];
        entry?: { requireMention?: boolean; systemPrompt?: string; [key: string]: unknown };
      };
    };
  };

  export type PluginRuntime = {
    logging: {
      shouldLogVerbose: () => boolean;
      getChildLogger: (bindings: Record<string, unknown>, opts?: { level?: string }) => PluginLogger;
    };
    channel: ChannelRuntime;
    [key: string]: unknown;
  };

  // Policy Types
  export type DmPolicy = "open" | "allowlist" | "pairing" | "disabled";
  export type GroupPolicy = "open" | "allowlist" | "disabled";
  export type MarkdownConfig = {
    enabled?: boolean;
    [key: string]: unknown;
  };

  // Channel Dock Type
  export type ChannelDock = {
    id: string;
    capabilities: {
      chatTypes: string[];
      reactions: boolean;
      media: boolean;
      threads: boolean;
      blockStreaming: boolean;
    };
    outbound?: {
      textChunkLimit?: number;
    };
    config?: {
      resolveAllowFrom?: (opts: { cfg: OpenClawConfig; accountId: string }) => string[];
      formatAllowFrom?: (opts: { allowFrom: string[] }) => string[];
    };
    groups?: {
      resolveRequireMention?: (opts: { cfg: OpenClawConfig; accountId: string }) => boolean;
    };
    threading?: {
      resolveReplyToMode?: (opts: { cfg: OpenClawConfig }) => string;
      buildToolContext?: (opts: { context: Record<string, unknown>; hasRepliedRef: { current: boolean } }) => Record<string, unknown>;
    };
  };

  // Channel Plugin Types
  export type ChannelPluginMeta = {
    id: string;
    label: string;
    selectionLabel?: string;
    docsPath?: string;
    docsLabel?: string;
    blurb?: string;
    order?: number;
  };

  export type ChannelPluginCapabilities = {
    chatTypes: string[];
    reactions: boolean;
    threads: boolean;
    media: boolean;
    nativeCommands?: boolean;
    blockStreaming?: boolean;
  };

  export type ChannelPluginPairing<TAccount> = {
    idLabel: string;
    normalizeAllowEntry: (entry: string) => string;
    notifyApproval: (opts: { cfg: OpenClawConfig; id: string; account?: TAccount }) => Promise<void>;
  };

  export type ChannelPluginConfig<TAccount> = {
    listAccountIds: (cfg: OpenClawConfig) => string[];
    resolveAccount: (cfg: OpenClawConfig, accountId?: string) => TAccount;
    defaultAccountId: (cfg: OpenClawConfig) => string;
    setAccountEnabled: (opts: { cfg: OpenClawConfig; accountId: string; enabled: boolean }) => OpenClawConfig;
    deleteAccount: (opts: { cfg: OpenClawConfig; accountId: string }) => OpenClawConfig;
    isConfigured: (account: TAccount) => boolean;
    describeAccount: (account: TAccount) => Record<string, unknown>;
    resolveAllowFrom: (opts: { cfg: OpenClawConfig; accountId: string }) => string[];
    formatAllowFrom: (opts: { allowFrom: string[] }) => string[];
  };

  export type ChannelPluginSecurity<TAccount> = {
    resolveDmPolicy: (opts: { cfg: OpenClawConfig; accountId?: string; account: TAccount }) => {
      policy: DmPolicy;
      allowFrom: (string | number)[];
      allowFromPath: string;
      approveHint: string;
      normalizeEntry: (raw: string) => string;
    };
    collectWarnings: (opts: { account: TAccount; cfg: OpenClawConfig }) => string[];
  };

  export type ChannelPluginGroups = {
    resolveRequireMention: (opts: { cfg: OpenClawConfig; accountId: string }) => boolean;
  };

  export type ChannelPluginThreading = {
    resolveReplyToMode: (opts: { cfg: OpenClawConfig }) => string;
  };

  export type ChannelPluginMessaging = {
    normalizeTarget: (target: string) => string | null;
    targetResolver: {
      looksLikeId: (raw: string, normalized: string | null) => boolean;
      hint: string;
    };
  };

  export type DirectoryPeer = { kind: "user"; id: string };
  export type DirectoryGroup = { kind: "group"; id: string };

  export type ChannelPluginDirectory<TAccount> = {
    self: (opts: { account: TAccount }) => Promise<{ id: string; name?: string } | null>;
    listPeers: (opts: { cfg: OpenClawConfig; accountId: string; query?: string; limit?: number }) => Promise<DirectoryPeer[]>;
    listGroups: (opts: { cfg: OpenClawConfig; accountId: string; query?: string; limit?: number }) => Promise<DirectoryGroup[]>;
  };

  export type ResolvedTarget = { input: string; resolved: boolean; id?: string; note?: string };

  export type ChannelPluginResolver = {
    resolveTargets: (opts: { inputs: string[]; kind: "user" | "group" }) => Promise<ResolvedTarget[]>;
  };

  export type ChannelPluginSetup = {
    resolveAccountId: (opts: { accountId?: string }) => string;
    applyAccountName: (opts: { cfg: OpenClawConfig; accountId: string; name?: string }) => OpenClawConfig;
    validateInput: (opts: { accountId: string; input: Record<string, unknown> }) => string | null;
    applyAccountConfig: (opts: { cfg: OpenClawConfig; accountId: string; input: Record<string, unknown> }) => OpenClawConfig;
  };

  export type OutboundResult = {
    channel: string;
    messageId: string;
    chatId: string;
  };

  export type ChannelPluginOutbound<TAccount> = {
    deliveryMode: "direct" | "queued";
    chunker: (text: string, limit: number) => string[];
    chunkerMode?: "markdown" | "plain";
    textChunkLimit: number;
    resolveTarget: (opts: { to?: string; allowFrom?: string[]; mode?: string }) => { ok: true; to: string } | { ok: false; error: Error };
    sendText: (opts: { cfg: OpenClawConfig; to: string; text: string; accountId?: string }) => Promise<OutboundResult>;
    sendMedia: (opts: { cfg: OpenClawConfig; to: string; text?: string; mediaUrl?: string; accountId?: string }) => Promise<OutboundResult>;
  };

  export type StatusIssue = {
    channel: string;
    accountId: string;
    kind: string;
    message: string;
    fix?: string;
  };

  export type ChannelPluginStatus<TAccount> = {
    defaultRuntime: Record<string, unknown>;
    collectStatusIssues: (accounts: Array<Record<string, unknown>>) => StatusIssue[];
    buildChannelSummary: (opts: { snapshot: Record<string, unknown> }) => Record<string, unknown>;
    probeAccount: (opts: { account: TAccount }) => Promise<{ ok: boolean; error?: string; elapsedMs: number }>;
    buildAccountSnapshot: (opts: { account: TAccount; runtime?: Record<string, unknown>; probe?: Record<string, unknown> }) => Record<string, unknown>;
  };

  export type GatewayContext<TAccount> = {
    account: TAccount;
    cfg: OpenClawConfig;
    runtime: { log?: (msg: string) => void; error?: (msg: string) => void; info?: (msg: string) => void };
    abortSignal: AbortSignal;
    setStatus: (patch: Record<string, unknown>) => void;
    log?: PluginLogger;
  };

  export type ChannelPluginGateway<TAccount> = {
    startAccount: (ctx: GatewayContext<TAccount>) => Promise<() => void>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ChannelPlugin<TAccount = any> = {
    id: string;
    meta: ChannelPluginMeta;
    pairing?: ChannelPluginPairing<TAccount>;
    capabilities: ChannelPluginCapabilities;
    streaming?: {
      blockStreamingCoalesceDefaults?: { minChars?: number; idleMs?: number };
    };
    reload?: {
      configPrefixes?: string[];
    };
    configSchema: z.ZodType<unknown>;
    config: ChannelPluginConfig<TAccount>;
    security?: ChannelPluginSecurity<TAccount>;
    groups?: ChannelPluginGroups;
    threading?: ChannelPluginThreading;
    messaging?: ChannelPluginMessaging;
    directory?: ChannelPluginDirectory<TAccount>;
    resolver?: ChannelPluginResolver;
    setup?: ChannelPluginSetup;
    outbound: ChannelPluginOutbound<TAccount>;
    status?: ChannelPluginStatus<TAccount>;
    gateway?: ChannelPluginGateway<TAccount>;
  };

  // Constants
  export const DEFAULT_ACCOUNT_ID: string;

  // Functions
  export function normalizeAccountId(accountId: string | null | undefined): string;
  export function emptyPluginConfigSchema(): z.ZodObject<Record<string, never>>;
  export function resolveMentionGatingWithBypass(opts: {
    isGroup: boolean;
    requireMention: boolean;
    canDetectMention: boolean;
    wasMentioned: boolean;
    implicitMention: boolean;
    hasAnyMention: boolean;
    allowTextCommands: boolean;
    hasControlCommand: boolean;
    commandAuthorized: boolean;
  }): { shouldSkip: boolean; effectiveWasMentioned?: boolean };
  export function requireOpenAllowFrom(opts: unknown): void;
  export function applyAccountNameToChannelSection(opts: {
    cfg: OpenClawConfig;
    channelKey: string;
    accountId: string;
    name?: string;
  }): OpenClawConfig;
  export function buildChannelConfigSchema(schema: z.ZodType<unknown>): z.ZodType<unknown>;
  export function deleteAccountFromConfigSection(opts: {
    cfg: OpenClawConfig;
    sectionKey: string;
    accountId: string;
    clearBaseFields?: string[];
  }): OpenClawConfig;
  export function formatPairingApproveHint(channel: string): string;
  export function migrateBaseNameToDefaultAccount(opts: {
    cfg: OpenClawConfig;
    channelKey: string;
  }): OpenClawConfig;
  export function missingTargetError(channel: string, hint: string): Error;
  export function setAccountEnabledInConfigSection(opts: {
    cfg: OpenClawConfig;
    sectionKey: string;
    accountId: string;
    enabled: boolean;
    allowTopLevel?: boolean;
  }): OpenClawConfig;
  export function resolveChannelMediaMaxBytes(opts: {
    cfg: OpenClawConfig;
    resolveChannelLimitMb: (opts: { cfg: OpenClawConfig; accountId: string }) => number | undefined;
    accountId?: string;
  }): number | undefined;

  // Constants for messages
  export const PAIRING_APPROVED_MESSAGE: string;

  // Zod Schemas
  export const BlockStreamingCoalesceSchema: z.ZodType<unknown>;
  export const DmPolicySchema: z.ZodType<DmPolicy>;
  export const GroupPolicySchema: z.ZodType<GroupPolicy>;
  export const MarkdownConfigSchema: z.ZodType<MarkdownConfig>;
}

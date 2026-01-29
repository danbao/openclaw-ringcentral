import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import type { RingCentralAccountConfig, RingCentralConfig } from "./types.js";

export type RingCentralCredentialSource = "config" | "env" | "none";

export type ResolvedRingCentralAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: RingCentralAccountConfig;
  credentialSource: RingCentralCredentialSource;
  clientId?: string;
  clientSecret?: string;
  jwt?: string;
  server: string;
};

const ENV_CLIENT_ID = "RINGCENTRAL_CLIENT_ID";
const ENV_CLIENT_SECRET = "RINGCENTRAL_CLIENT_SECRET";
const ENV_JWT = "RINGCENTRAL_JWT";
const ENV_SERVER = "RINGCENTRAL_SERVER";

const DEFAULT_SERVER = "https://platform.ringcentral.com";

function listConfiguredAccountIds(cfg: MoltbotConfig): string[] {
  const accounts = (cfg.channels?.ringcentral as RingCentralConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listRingCentralAccountIds(cfg: MoltbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultRingCentralAccountId(cfg: MoltbotConfig): string {
  const channel = cfg.channels?.ringcentral as RingCentralConfig | undefined;
  if (channel?.defaultAccount?.trim()) return channel.defaultAccount.trim();
  const ids = listRingCentralAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: MoltbotConfig,
  accountId: string,
): RingCentralAccountConfig | undefined {
  const accounts = (cfg.channels?.ringcentral as RingCentralConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as RingCentralAccountConfig | undefined;
}

function mergeRingCentralAccountConfig(
  cfg: MoltbotConfig,
  accountId: string,
): RingCentralAccountConfig {
  const raw = (cfg.channels?.ringcentral ?? {}) as RingCentralConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account } as RingCentralAccountConfig;
}

function resolveCredentialsFromConfig(params: {
  accountId: string;
  account: RingCentralAccountConfig;
}): {
  clientId?: string;
  clientSecret?: string;
  jwt?: string;
  server: string;
  source: RingCentralCredentialSource;
} {
  const { account, accountId } = params;

  const configClientId = account.clientId?.trim();
  const configClientSecret = account.clientSecret?.trim();
  const configJwt = account.jwt?.trim();
  const configServer = account.server?.trim() || DEFAULT_SERVER;

  // 1. Check inline config first
  if (configClientId && configClientSecret && configJwt) {
    return {
      clientId: configClientId,
      clientSecret: configClientSecret,
      jwt: configJwt,
      server: configServer,
      source: "config",
    };
  }

  // 2. Check environment variables (default account only)
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const envClientId = process.env[ENV_CLIENT_ID]?.trim();
    const envClientSecret = process.env[ENV_CLIENT_SECRET]?.trim();
    const envJwt = process.env[ENV_JWT]?.trim();
    const envServer = process.env[ENV_SERVER]?.trim() || DEFAULT_SERVER;

    if (envClientId && envClientSecret && envJwt) {
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        jwt: envJwt,
        server: envServer,
        source: "env",
      };
    }

    // 3. Allow partial config + env fallback
    const finalClientId = configClientId || envClientId;
    const finalClientSecret = configClientSecret || envClientSecret;
    const finalJwt = configJwt || envJwt;
    const finalServer = configServer !== DEFAULT_SERVER ? configServer : envServer;

    if (finalClientId && finalClientSecret && finalJwt) {
      const source: RingCentralCredentialSource =
        configClientId || configClientSecret || configJwt ? "config" : "env";
      return {
        clientId: finalClientId,
        clientSecret: finalClientSecret,
        jwt: finalJwt,
        server: finalServer,
        source,
      };
    }
  }

  return { server: configServer, source: "none" };
}

export function resolveRingCentralAccount(params: {
  cfg: MoltbotConfig;
  accountId?: string | null;
}): ResolvedRingCentralAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.ringcentral as RingCentralConfig | undefined)?.enabled !== false;
  const merged = mergeRingCentralAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const credentials = resolveCredentialsFromConfig({ accountId, account: merged });

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    config: merged,
    credentialSource: credentials.source,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    jwt: credentials.jwt,
    server: credentials.server,
  };
}

export function listEnabledRingCentralAccounts(cfg: MoltbotConfig): ResolvedRingCentralAccount[] {
  return listRingCentralAccountIds(cfg)
    .map((accountId) => resolveRingCentralAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

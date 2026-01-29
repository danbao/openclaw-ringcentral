import { SDK } from "@ringcentral/sdk";

import type { ResolvedRingCentralAccount } from "./accounts.js";

export type SDKInstance = InstanceType<typeof SDK>;

const sdkCache = new Map<string, { key: string; sdk: SDKInstance; platform: ReturnType<SDKInstance["platform"]> }>();

function buildAuthKey(account: ResolvedRingCentralAccount): string {
  return `${account.clientId}:${account.server}:${account.jwt?.slice(0, 20)}`;
}

async function getSDKInstance(account: ResolvedRingCentralAccount): Promise<{
  sdk: SDKInstance;
  platform: ReturnType<SDKInstance["platform"]>;
}> {
  const key = buildAuthKey(account);
  const cached = sdkCache.get(account.accountId);
  
  if (cached && cached.key === key) {
    // Check if still logged in
    const platform = cached.platform;
    try {
      const loggedIn = await platform.loggedIn();
      if (loggedIn) {
        return cached;
      }
    } catch {
      // Token expired or invalid, need to re-login
    }
  }

  if (!account.clientId || !account.clientSecret) {
    throw new Error("RingCentral clientId and clientSecret are required");
  }

  if (!account.jwt) {
    throw new Error("RingCentral JWT token is required for authentication");
  }

  const sdk = new SDK({
    server: account.server,
    clientId: account.clientId,
    clientSecret: account.clientSecret,
  });

  const platform = sdk.platform();

  // Login using JWT
  await platform.login({ jwt: account.jwt });

  const entry = { key, sdk, platform };
  sdkCache.set(account.accountId, entry);
  return entry;
}

export async function getRingCentralSDK(
  account: ResolvedRingCentralAccount,
): Promise<SDKInstance> {
  const { sdk } = await getSDKInstance(account);
  return sdk;
}

export async function getRingCentralPlatform(
  account: ResolvedRingCentralAccount,
): Promise<ReturnType<SDKInstance["platform"]>> {
  const { platform } = await getSDKInstance(account);
  return platform;
}

export async function getRingCentralAccessToken(
  account: ResolvedRingCentralAccount,
): Promise<string> {
  const { platform } = await getSDKInstance(account);
  const authData = await platform.auth().data();
  const token = authData?.access_token;
  if (!token) {
    throw new Error("Missing RingCentral access token");
  }
  return token;
}

export async function refreshRingCentralToken(
  account: ResolvedRingCentralAccount,
): Promise<void> {
  const { platform } = await getSDKInstance(account);
  await platform.refresh();
}

export function clearRingCentralAuth(accountId: string): void {
  sdkCache.delete(accountId);
}

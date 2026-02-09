import * as fs from "fs";
import * as path from "path";

import type { ResolvedRingCentralAccount } from "./accounts.js";
import {
  listRingCentralChats,
  getRingCentralUser,
  getCurrentRingCentralUser,
} from "./api.js";

export type CachedChat = {
  id: string;
  name: string;
  type: "Team" | "Direct" | "Group" | "Personal" | "Everyone" | string;
  members?: string[];
};

type ChatCacheData = {
  updatedAt: string;
  chats: CachedChat[];
};

type ChatCacheLogger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const CHAT_TYPES = ["Personal", "Direct", "Group", "Team", "Everyone"] as const;
const CACHE_FILE = "ringcentral-chat-cache.json";

let memoryCache: CachedChat[] = [];
let syncContext: {
  account: ResolvedRingCentralAccount;
  workspace: string | undefined;
  logger: ChatCacheLogger;
} | null = null;

export function getCachedChats(): CachedChat[] {
  return memoryCache;
}

export function searchCachedChats(query: string): CachedChat[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return memoryCache.filter((c) => (c.name || "").toLowerCase().includes(q));
}

function resolveCachePath(workspace: string): string {
  return path.join(workspace, "memory", CACHE_FILE);
}

function readCacheFile(workspace: string, logger: ChatCacheLogger): CachedChat[] {
  const filePath = resolveCachePath(workspace);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as ChatCacheData;
    return data.chats ?? [];
  } catch {
    logger.debug(`[chat-cache] No existing cache file at ${filePath}`);
    return [];
  }
}

function writeCacheFile(workspace: string, chats: CachedChat[], logger: ChatCacheLogger): void {
  const filePath = resolveCachePath(workspace);
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const data: ChatCacheData = {
      updatedAt: new Date().toISOString(),
      chats,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    logger.debug(`[chat-cache] Wrote ${chats.length} chats to ${filePath}`);
  } catch (err) {
    logger.error(`[chat-cache] Failed to write cache: ${String(err)}`);
  }
}

function cacheChanged(prev: CachedChat[], next: CachedChat[]): boolean {
  if (prev.length !== next.length) return true;
  const prevIds = new Set(prev.map((c) => c.id));
  for (const c of next) {
    if (!prevIds.has(c.id)) return true;
  }
  const prevMap = new Map(prev.map((c) => [c.id, c.name]));
  for (const c of next) {
    if (prevMap.get(c.id) !== c.name) return true;
  }
  return false;
}

async function resolveOwnerId(
  account: ResolvedRingCentralAccount,
  logger: ChatCacheLogger,
): Promise<string | undefined> {
  try {
    const user = await getCurrentRingCentralUser({ account });
    return user?.id ?? undefined;
  } catch (err) {
    logger.warn(`[chat-cache] Failed to get current user: ${String(err)}`);
    return undefined;
  }
}

async function resolvePersonName(
  account: ResolvedRingCentralAccount,
  personId: string,
  logger: ChatCacheLogger,
): Promise<string> {
  try {
    const user = await getRingCentralUser({ account, userId: personId });
    const parts = [user?.firstName, user?.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : personId;
  } catch {
    logger.debug(`[chat-cache] Failed to resolve person ${personId}`);
    return personId;
  }
}

async function fetchAllChats(
  account: ResolvedRingCentralAccount,
  logger: ChatCacheLogger,
): Promise<CachedChat[]> {
  const ownerId = await resolveOwnerId(account, logger);
  const result: CachedChat[] = [];

  for (const chatType of CHAT_TYPES) {
    try {
      const chats = await listRingCentralChats({
        account,
        type: [chatType],
        limit: 250,
      });

      for (const chat of chats) {
        if (!chat.id) continue;

        // members can be string[] or {id:string}[] depending on chat type
        const rawMembers = chat.members ?? [];
        const memberIds = rawMembers.map((m: unknown) =>
          typeof m === "object" && m !== null && "id" in m ? String((m as { id: unknown }).id) : String(m),
        );

        let name = chat.name ?? "";

        if (chatType === "Direct" && !name && memberIds.length > 0) {
          const peerId = memberIds.find((id) => id !== ownerId);
          if (peerId) {
            name = await resolvePersonName(account, peerId, logger);
          }
        }

        if (chatType === "Personal" && !name) {
          name = "(Personal)";
        }

        result.push({
          id: chat.id,
          name: String(name || ""),
          type: chat.type ?? chatType,
          members: memberIds,
        });
      }
    } catch (err) {
      logger.error(`[chat-cache] Failed to fetch ${chatType} chats: ${String(err)}`);
    }
  }

  return result;
}

async function syncOnce(
  account: ResolvedRingCentralAccount,
  workspace: string | undefined,
  logger: ChatCacheLogger,
): Promise<void> {
  logger.debug(`[chat-cache] Syncing chats for account ${account.accountId}...`);
  try {
    const chats = await fetchAllChats(account, logger);
    const changed = cacheChanged(memoryCache, chats);
    memoryCache = chats;

    if (workspace && changed) {
      writeCacheFile(workspace, chats, logger);
    }

    logger.info(`[chat-cache] Synced ${chats.length} chats (changed=${changed})`);
  } catch (err) {
    logger.error(`[chat-cache] Sync failed: ${String(err)}`);
  }
}

export async function refreshChatCache(): Promise<{ count: number }> {
  if (!syncContext) {
    return { count: memoryCache.length };
  }
  const { account, workspace, logger } = syncContext;
  await syncOnce(account, workspace, logger);
  return { count: memoryCache.length };
}

export function startChatCacheSync(params: {
  account: ResolvedRingCentralAccount;
  workspace: string | undefined;
  logger: ChatCacheLogger;
  abortSignal: AbortSignal;
}): void {
  const { account, workspace, logger } = params;
  syncContext = { account, workspace, logger };

  // Only restore from local file; no automatic API sync to avoid 429
  if (workspace) {
    memoryCache = readCacheFile(workspace, logger);
    if (memoryCache.length > 0) {
      logger.info(`[chat-cache] Restored ${memoryCache.length} chats from file cache`);
    }
  }
}

export function stopChatCacheSync(): void {
  syncContext = null;
}

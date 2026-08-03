const MAX_REMEMBERED_CONVERSATIONS = 10_000;

const nativeChatIdsBySession = new Map<string, string>();

export function rememberRingCentralNativeChatId(sessionKey: string, chatId: string): void {
  const normalizedSessionKey = sessionKey.trim();
  const normalizedChatId = chatId.trim();
  if (!normalizedSessionKey || !normalizedChatId) {
    return;
  }
  nativeChatIdsBySession.delete(normalizedSessionKey);
  nativeChatIdsBySession.set(normalizedSessionKey, normalizedChatId);
  if (nativeChatIdsBySession.size > MAX_REMEMBERED_CONVERSATIONS) {
    const oldest = nativeChatIdsBySession.keys().next().value;
    if (oldest) {
      nativeChatIdsBySession.delete(oldest);
    }
  }
}

export function getRingCentralNativeChatId(sessionKey: string | undefined): string | undefined {
  if (!sessionKey) {
    return undefined;
  }
  return nativeChatIdsBySession.get(sessionKey.trim());
}

export function clearRememberedRingCentralNativeChatIdsForTest(): void {
  nativeChatIdsBySession.clear();
}

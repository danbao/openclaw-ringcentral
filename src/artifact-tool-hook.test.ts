import { beforeEach, describe, expect, it } from "vitest";
import { injectRingCentralArtifactToolChatId } from "./artifact-tool-hook.js";
import {
  clearRememberedRingCentralNativeChatIdsForTest,
  rememberRingCentralNativeChatId,
} from "./conversation-context.js";

describe("RingCentral artifact tool hook", () => {
  beforeEach(() => {
    clearRememberedRingCentralNativeChatIdsForTest();
  });

  it("injects the current RingCentral group chat as chat_id for artifact tools without a target", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_create_note",
        params: { title: "Note" },
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1",
        channelId: "team-1",
      },
    );

    expect(result).toEqual({
      params: {
        title: "Note",
        chat_id: "team-1",
      },
    });
  });

  it("removes the per-sender session suffix from injected artifact chat ids", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_create_note",
        params: { title: "Note" },
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1:sender:user-1",
        channelId: "ringcentral",
      },
    );

    expect(result).toEqual({
      params: {
        title: "Note",
        chat_id: "team-1",
      },
    });
  });

  it("preserves explicit artifact targets", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_create_note",
        params: { chat_id: "explicit-team", title: "Note" },
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1",
        channelId: "team-1",
      },
    );

    expect(result).toBeUndefined();
  });

  it("does not inject for non-artifact RingCentral tools", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_get_recent_messages",
        params: {},
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1",
        channelId: "team-1",
      },
    );

    expect(result).toBeUndefined();
  });

  it("does not inject for non-RingCentral sessions", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_create_note",
        params: { title: "Note" },
      },
      {
        sessionKey: "agent:main:slack:channel:C123",
        channelId: "C123",
      },
    );

    expect(result).toBeUndefined();
  });

  it("does not inject confirmation targets", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_confirm_artifact_action",
        params: { confirmation_id: "confirm-1" },
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1",
        channelId: "team-1",
      },
    );

    expect(result).toBeUndefined();
  });

  it("injects a hidden current Team target for report uploads", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_upload_log_report",
        params: { file_name: `report-${"a".repeat(32)}.html` },
      },
      {
        sessionKey: "agent:main:ringcentral:channel:team-1:sender:user-1",
        channelId: "team-1",
      },
    );

    expect(result).toEqual({
      params: {
        file_name: `report-${"a".repeat(32)}.html`,
        _ringcentral_current_target: "channel:team-1",
      },
    });
  });

  it("injects the remembered native chat ID for DM report uploads", () => {
    const sessionKey = "agent:ringcentral-bot:ringcentral:direct:person-1";
    rememberRingCentralNativeChatId(sessionKey, "native-dm-chat-7");
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_upload_log_report",
        params: { file_name: `report-${"b".repeat(32)}.html` },
      },
      {
        sessionKey,
        channelId: "ringcentral",
      },
    );

    expect(result).toEqual({
      params: {
        file_name: `report-${"b".repeat(32)}.html`,
        _ringcentral_current_target: "channel:native-dm-chat-7",
      },
    });
  });

  it("fails closed for a DM report upload without a remembered native chat ID", () => {
    const result = injectRingCentralArtifactToolChatId(
      {
        toolName: "ringcentral_upload_log_report",
        params: { file_name: `report-${"c".repeat(32)}.html` },
      },
      {
        sessionKey: "agent:ringcentral-bot:ringcentral:direct:person-1",
        channelId: "ringcentral",
      },
    );

    expect(result).toBeUndefined();
  });
});

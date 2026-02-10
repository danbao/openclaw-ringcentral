import { describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import { isSenderAllowed, detectLoopGuardMarker, isPureAttachmentPlaceholder, sanitizeFilename, saveGroupChatMessage, type RingCentralLogger } from "./monitor.js";

describe("isSenderAllowed", () => {
  it("returns true when allowFrom contains wildcard", () => {
    expect(isSenderAllowed("12345", ["*"])).toBe(true);
    expect(isSenderAllowed("any-user", ["*"])).toBe(true);
  });

  it("returns true when sender ID matches exactly", () => {
    expect(isSenderAllowed("12345", ["12345"])).toBe(true);
    expect(isSenderAllowed("12345", ["other", "12345"])).toBe(true);
  });

  it("returns true when sender ID matches with ringcentral: prefix", () => {
    expect(isSenderAllowed("12345", ["ringcentral:12345"])).toBe(true);
    expect(isSenderAllowed("12345", ["RINGCENTRAL:12345"])).toBe(true);
  });

  it("returns true when sender ID matches with rc: prefix", () => {
    expect(isSenderAllowed("12345", ["rc:12345"])).toBe(true);
    expect(isSenderAllowed("12345", ["RC:12345"])).toBe(true);
  });

  it("returns true when sender ID matches with user: prefix", () => {
    expect(isSenderAllowed("12345", ["user:12345"])).toBe(true);
    expect(isSenderAllowed("12345", ["USER:12345"])).toBe(true);
  });

  it("returns false when sender ID not in allowFrom", () => {
    expect(isSenderAllowed("12345", ["67890"])).toBe(false);
    expect(isSenderAllowed("12345", [])).toBe(false);
  });

  it("handles case-insensitive matching", () => {
    expect(isSenderAllowed("ABC123", ["abc123"])).toBe(true);
    expect(isSenderAllowed("abc123", ["ABC123"])).toBe(true);
  });

  it("handles whitespace in allowFrom entries", () => {
    expect(isSenderAllowed("12345", ["  12345  "])).toBe(true);
  });

  it("ignores empty entries in allowFrom", () => {
    expect(isSenderAllowed("12345", ["", "12345", "  "])).toBe(true);
  });
});

describe("detectLoopGuardMarker", () => {
  describe("thinking_marker", () => {
    it("matches thinking with emoji prefix", () => {
      expect(detectLoopGuardMarker("> 🦞 Moss is thinking...")).toBe("thinking_marker");
      expect(detectLoopGuardMarker("> 🦞 OpenClaw is thinking...")).toBe("thinking_marker");
    });

    it("matches thinking without emoji", () => {
      expect(detectLoopGuardMarker("> Assistant is thinking...")).toBe("thinking_marker");
    });

    it("matches custom bot names", () => {
      expect(detectLoopGuardMarker("> 🦞 My Custom Bot is thinking...")).toBe("thinking_marker");
    });

    it("matches Chinese thinking variant", () => {
      expect(detectLoopGuardMarker("> 🦞 Moss 正在思考...")).toBe("thinking_marker");
    });

    it("does not match without quote prefix", () => {
      expect(detectLoopGuardMarker("is thinking...")).toBeNull();
      expect(detectLoopGuardMarker("Moss is thinking...")).toBeNull();
    });

    it("does not match normal text about thinking", () => {
      expect(detectLoopGuardMarker("今天在想性能问题")).toBeNull();
      expect(detectLoopGuardMarker("I was thinking about this")).toBeNull();
    });
  });

  describe("answer_wrapper", () => {
    it("matches answer delimiter", () => {
      expect(detectLoopGuardMarker("> --------answer--------")).toBe("answer_wrapper");
    });

    it("matches end delimiter", () => {
      expect(detectLoopGuardMarker("> ---------end----------")).toBe("answer_wrapper");
    });

    it("matches with variable dash count", () => {
      expect(detectLoopGuardMarker("> ---answer---")).toBe("answer_wrapper");
      expect(detectLoopGuardMarker("> ---end---")).toBe("answer_wrapper");
    });

    it("matches full wrapped message", () => {
      expect(detectLoopGuardMarker("> --------answer--------\nsome content\n> ---------end----------")).toBe("answer_wrapper");
    });

    it("does not match normal text with answer/end", () => {
      expect(detectLoopGuardMarker("the answer is 42")).toBeNull();
      expect(detectLoopGuardMarker("this is the end")).toBeNull();
    });
  });

  describe("queued_busy", () => {
    it("matches queued messages while agent was busy", () => {
      expect(detectLoopGuardMarker("Queued messages while agent was busy")).toBe("queued_busy");
    });

    it("matches case-insensitive", () => {
      expect(detectLoopGuardMarker("queued messages while agent was busy")).toBe("queued_busy");
      expect(detectLoopGuardMarker("QUEUED MESSAGES WHILE AGENT WAS BUSY")).toBe("queued_busy");
    });

    it("matches when embedded in longer text", () => {
      expect(detectLoopGuardMarker("System: Queued messages while agent was busy\nsome other text")).toBe("queued_busy");
    });
  });

  describe("queued_number", () => {
    it("matches Queued #N", () => {
      expect(detectLoopGuardMarker("Queued #1")).toBe("queued_number");
      expect(detectLoopGuardMarker("Queued #23")).toBe("queued_number");
    });

    it("matches case-insensitive", () => {
      expect(detectLoopGuardMarker("queued #5")).toBe("queued_number");
    });

    it("does not match queued without number", () => {
      expect(detectLoopGuardMarker("Queued something")).toBeNull();
    });
  });

  describe("should NOT filter", () => {
    it("does not filter media:attachment", () => {
      expect(detectLoopGuardMarker("media:attachment")).toBeNull();
      expect(detectLoopGuardMarker("<media:attachment>")).toBeNull();
    });

    it("does not filter System: prefix alone", () => {
      expect(detectLoopGuardMarker("System: hello")).toBeNull();
    });

    it("does not filter RingCentral user: prefix alone", () => {
      expect(detectLoopGuardMarker("[RingCentral user: John] hello")).toBeNull();
    });

    it("returns null for normal messages", () => {
      expect(detectLoopGuardMarker("hello world")).toBeNull();
      expect(detectLoopGuardMarker("/status")).toBeNull();
      expect(detectLoopGuardMarker("请总结一下今天的内容")).toBeNull();
    });
  });
});

describe("isPureAttachmentPlaceholder", () => {
  it("matches media:attachment", () => {
    expect(isPureAttachmentPlaceholder("media:attachment")).toBe(true);
  });

  it("matches <media:attachment>", () => {
    expect(isPureAttachmentPlaceholder("<media:attachment>")).toBe(true);
  });

  it("matches with surrounding whitespace", () => {
    expect(isPureAttachmentPlaceholder("  media:attachment  ")).toBe(true);
    expect(isPureAttachmentPlaceholder("\n<media:attachment>\n")).toBe(true);
  });

  it("matches case-insensitive", () => {
    expect(isPureAttachmentPlaceholder("Media:Attachment")).toBe(true);
    expect(isPureAttachmentPlaceholder("MEDIA:ATTACHMENT")).toBe(true);
  });

  it("matches with blockquote prefix", () => {
    expect(isPureAttachmentPlaceholder("> media:attachment")).toBe(true);
    expect(isPureAttachmentPlaceholder("> <media:attachment>")).toBe(true);
  });

  it("does NOT match placeholder with extra text", () => {
    expect(isPureAttachmentPlaceholder("请总结这个 media:attachment")).toBe(false);
    expect(isPureAttachmentPlaceholder("media:attachment please summarize")).toBe(false);
  });

  it("does NOT match normal messages", () => {
    expect(isPureAttachmentPlaceholder("hello world")).toBe(false);
    expect(isPureAttachmentPlaceholder("/status")).toBe(false);
    expect(isPureAttachmentPlaceholder("测试")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPureAttachmentPlaceholder("")).toBe(false);
    expect(isPureAttachmentPlaceholder("   ")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("removes unsafe characters", () => {
    expect(sanitizeFilename("foo/bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo\\bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo:bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo*bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo?bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo\"bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo<bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo>bar")).toBe("foo_bar");
    expect(sanitizeFilename("foo|bar")).toBe("foo_bar");
  });

  it("preserves safe characters", () => {
    expect(sanitizeFilename("foo-bar_baz.txt")).toBe("foo-bar_baz_txt");
    expect(sanitizeFilename("12345")).toBe("12345");
  });

  it("removes dots entirely", () => {
    expect(sanitizeFilename(".foo")).toBe("_foo");
    expect(sanitizeFilename("foo.")).toBe("foo_");
    expect(sanitizeFilename("foo.bar")).toBe("foo_bar");
  });

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("handles path traversal attempts", () => {
    // ../../etc/passwd -> ______etc_passwd
    // . -> _ (so .. -> __)
    // / -> _
    expect(sanitizeFilename("../../etc/passwd")).toBe("______etc_passwd");
  });
});

// Mock fs.promises for saveGroupChatMessage
vi.mock("fs", async () => {
  return {
    promises: {
      mkdir: vi.fn(),
      access: vi.fn(),
      appendFile: vi.fn(),
    },
  };
});

describe("saveGroupChatMessage", () => {
  it("sanitizes chatId to prevent path traversal", async () => {
    const logger: RingCentralLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const workspace = "/app/workspace";
    const chatId = "../../etc/passwd";
    const messageText = "payload";

    await saveGroupChatMessage({
      workspace,
      chatId,
      senderId: "attacker",
      messageText,
      logger,
    });

    const appendFileMock = fs.promises.appendFile as any;
    expect(appendFileMock).toHaveBeenCalled();
    const filePath = appendFileMock.mock.calls[0][0];

    // The sanitized chatId should be used
    // sanitizeFilename("../../etc/passwd") -> "______etc_passwd"
    expect(filePath).not.toContain("etc/passwd");
    expect(filePath).toContain("______etc_passwd.md");
  });
});

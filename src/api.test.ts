import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import {
  extractRcApiError,
  formatRcApiError,
} from "./api.js";

// Mock the auth module
vi.mock("./auth.js", () => ({
  getRingCentralPlatform: vi.fn(),
}));

const mockAccount: ResolvedRingCentralAccount = {
  accountId: "test",
  enabled: true,
  credentialSource: "config",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  jwt: "test-jwt",
  server: "https://platform.ringcentral.com",
  config: {},
};

describe("extractRcApiError", () => {
  it("handles null/undefined error", () => {
    const info = extractRcApiError(null);
    expect(info.errorMessage).toBe("null");
  });

  it("handles string error", () => {
    const info = extractRcApiError("Something went wrong");
    expect(info.errorMessage).toBe("Something went wrong");
  });

  it("extracts error from standard Error object", () => {
    const error = new Error("Test error message");
    const info = extractRcApiError(error);
    expect(info.errorMessage).toBe("Test error message");
  });

  it("extracts error from SDK response object", () => {
    const error = {
      response: {
        status: 404,
        headers: {
          get: (name: string) => (name === "x-request-id" ? "req-123" : null),
        },
      },
      message: '{"errorCode":"CMN-102","message":"Resource not found"}',
    };
    const info = extractRcApiError(error, "account-1");
    expect(info.httpStatus).toBe(404);
    expect(info.requestId).toBe("req-123");
    expect(info.errorCode).toBe("CMN-102");
    expect(info.errorMessage).toBe("Resource not found");
    expect(info.accountId).toBe("account-1");
  });

  it("extracts error from body property", () => {
    const error = {
      body: {
        errorCode: "CMN-401",
        message: "Unauthorized",
        errors: [{ errorCode: "SUB-001", message: "Invalid token" }],
      },
    };
    const info = extractRcApiError(error);
    expect(info.errorCode).toBe("CMN-401");
    expect(info.errorMessage).toBe("Unauthorized");
    expect(info.errors).toHaveLength(1);
    expect(info.errors?.[0].errorCode).toBe("SUB-001");
  });
});

describe("formatRcApiError", () => {
  it("formats complete error info", () => {
    const info = {
      httpStatus: 403,
      errorCode: "CMN-401",
      requestId: "req-456",
      accountId: "work",
      errorMessage: "Permission denied",
      errors: [{ errorCode: "ERR-1", message: "Missing scope", parameterName: "scope" }],
    };
    const formatted = formatRcApiError(info);
    expect(formatted).toContain("HTTP 403");
    expect(formatted).toContain("ErrorCode=CMN-401");
    expect(formatted).toContain("RequestId=req-456");
    expect(formatted).toContain("AccountId=work");
    expect(formatted).toContain('Message="Permission denied"');
    expect(formatted).toContain("ERR-1: Missing scope (scope)");
  });

  it("returns 'Unknown error' for empty info", () => {
    const formatted = formatRcApiError({});
    expect(formatted).toBe("Unknown error");
  });

  it("formats partial error info", () => {
    const info = {
      httpStatus: 500,
      errorMessage: "Internal server error",
    };
    const formatted = formatRcApiError(info);
    expect(formatted).toContain("HTTP 500");
    expect(formatted).toContain('Message="Internal server error"');
    expect(formatted).not.toContain("ErrorCode");
  });
});

describe("Adaptive Card API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRingCentralAdaptiveCard should be exported", async () => {
    const { getRingCentralAdaptiveCard } = await import("./api.js");
    expect(typeof getRingCentralAdaptiveCard).toBe("function");
  });

  it("sendRingCentralAdaptiveCard should be exported", async () => {
    const { sendRingCentralAdaptiveCard } = await import("./api.js");
    expect(typeof sendRingCentralAdaptiveCard).toBe("function");
  });

  it("updateRingCentralAdaptiveCard should be exported", async () => {
    const { updateRingCentralAdaptiveCard } = await import("./api.js");
    expect(typeof updateRingCentralAdaptiveCard).toBe("function");
  });

  it("deleteRingCentralAdaptiveCard should be exported", async () => {
    const { deleteRingCentralAdaptiveCard } = await import("./api.js");
    expect(typeof deleteRingCentralAdaptiveCard).toBe("function");
  });
});

describe("Chat API", () => {
  it("getRingCentralChat should be exported", async () => {
    const { getRingCentralChat } = await import("./api.js");
    expect(typeof getRingCentralChat).toBe("function");
  });

  it("listRingCentralChats should be exported", async () => {
    const { listRingCentralChats } = await import("./api.js");
    expect(typeof listRingCentralChats).toBe("function");
  });
});

describe("Message API", () => {
  it("sendRingCentralMessage should be exported", async () => {
    const { sendRingCentralMessage } = await import("./api.js");
    expect(typeof sendRingCentralMessage).toBe("function");
  });

  it("updateRingCentralMessage should be exported", async () => {
    const { updateRingCentralMessage } = await import("./api.js");
    expect(typeof updateRingCentralMessage).toBe("function");
  });

  it("deleteRingCentralMessage should be exported", async () => {
    const { deleteRingCentralMessage } = await import("./api.js");
    expect(typeof deleteRingCentralMessage).toBe("function");
  });
});

describe("User API", () => {
  it("getRingCentralUser should be exported", async () => {
    const { getRingCentralUser } = await import("./api.js");
    expect(typeof getRingCentralUser).toBe("function");
  });

  it("getCurrentRingCentralUser should be exported", async () => {
    const { getCurrentRingCentralUser } = await import("./api.js");
    expect(typeof getCurrentRingCentralUser).toBe("function");
  });
});

describe("Company API", () => {
  it("getRingCentralCompanyInfo should be exported", async () => {
    const { getRingCentralCompanyInfo } = await import("./api.js");
    expect(typeof getRingCentralCompanyInfo).toBe("function");
  });
});

describe("Attachment API", () => {
  it("uploadRingCentralAttachment should be exported", async () => {
    const { uploadRingCentralAttachment } = await import("./api.js");
    expect(typeof uploadRingCentralAttachment).toBe("function");
  });

  it("downloadRingCentralAttachment should be exported", async () => {
    const { downloadRingCentralAttachment } = await import("./api.js");
    expect(typeof downloadRingCentralAttachment).toBe("function");
  });
});

describe("probeRingCentral", () => {
  it("should be exported", async () => {
    const { probeRingCentral } = await import("./api.js");
    expect(typeof probeRingCentral).toBe("function");
  });
});

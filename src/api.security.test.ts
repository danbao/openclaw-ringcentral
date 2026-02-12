import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import { downloadRingCentralAttachment } from "./api.js";
import { getRingCentralPlatform } from "./auth.js";

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

describe("downloadRingCentralAttachment Security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should throw error if Content-Length exceeds maxBytes", async () => {
        const mockArrayBuffer = vi.fn();
        const mockResponse = {
            headers: {
                get: (name: string) => name.toLowerCase() === "content-length" ? "1000" : null,
            },
            arrayBuffer: mockArrayBuffer,
        };
        const mockPlatform = {
            get: vi.fn().mockResolvedValue(mockResponse),
        };
        (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);

        await expect(downloadRingCentralAttachment({
            account: mockAccount,
            contentUri: "https://example.com/file",
            maxBytes: 100, // Limit is smaller than content length
        })).rejects.toThrow("RingCentral attachment exceeds max bytes (100)");

        expect(mockPlatform.get).toHaveBeenCalledWith("https://example.com/file");
        expect(mockArrayBuffer).not.toHaveBeenCalled();
    });

    it("should proceed if Content-Length is within limit", async () => {
        const mockBuffer = new ArrayBuffer(50);
        const mockPlatform = {
            get: vi.fn().mockResolvedValue({
                headers: {
                    get: (name: string) => name.toLowerCase() === "content-length" ? "50" : null,
                },
                arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
            }),
        };
        (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);

        const result = await downloadRingCentralAttachment({
            account: mockAccount,
            contentUri: "https://example.com/file",
            maxBytes: 100,
        });

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.byteLength).toBe(50);
    });

    it("should check size after download if Content-Length is missing", async () => {
         const mockBuffer = new ArrayBuffer(200);
        const mockPlatform = {
            get: vi.fn().mockResolvedValue({
                headers: {
                    get: () => null,
                },
                arrayBuffer: vi.fn().mockResolvedValue(mockBuffer),
            }),
        };
        (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);

        await expect(downloadRingCentralAttachment({
            account: mockAccount,
            contentUri: "https://example.com/file",
            maxBytes: 100,
        })).rejects.toThrow("RingCentral attachment exceeds max bytes (100)");
    });
});

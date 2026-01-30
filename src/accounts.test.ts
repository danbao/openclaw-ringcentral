import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  listRingCentralAccountIds,
  resolveDefaultRingCentralAccountId,
  resolveRingCentralAccount,
  listEnabledRingCentralAccounts,
} from "./accounts.js";

describe("listRingCentralAccountIds", () => {
  it("returns default account when no accounts configured", () => {
    const cfg = { channels: {} } as OpenClawConfig;
    expect(listRingCentralAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns default account when ringcentral channel not configured", () => {
    const cfg = { channels: { telegram: { enabled: true } } } as OpenClawConfig;
    expect(listRingCentralAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns configured account IDs sorted alphabetically", () => {
    const cfg = {
      channels: {
        ringcentral: {
          accounts: {
            work: { enabled: true },
            personal: { enabled: true },
          },
        },
      },
    } as OpenClawConfig;
    expect(listRingCentralAccountIds(cfg)).toEqual(["personal", "work"]);
  });
});

describe("resolveDefaultRingCentralAccountId", () => {
  it("returns explicitly set default account", () => {
    const cfg = {
      channels: {
        ringcentral: {
          defaultAccount: "work",
          accounts: {
            work: {},
            personal: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveDefaultRingCentralAccountId(cfg)).toBe("work");
  });

  it("returns default if included in accounts", () => {
    const cfg = {
      channels: {
        ringcentral: {
          accounts: {
            default: {},
            other: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveDefaultRingCentralAccountId(cfg)).toBe("default");
  });

  it("returns first account ID when no default specified", () => {
    const cfg = {
      channels: {
        ringcentral: {
          accounts: {
            zebra: {},
            alpha: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveDefaultRingCentralAccountId(cfg)).toBe("alpha");
  });
});

describe("resolveRingCentralAccount", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves account from config credentials", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          credentials: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            jwt: "test-jwt",
            server: "https://platform.devtest.ringcentral.com",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg });

    expect(account.accountId).toBe("default");
    expect(account.enabled).toBe(true);
    expect(account.credentialSource).toBe("config");
    expect(account.clientId).toBe("test-client-id");
    expect(account.clientSecret).toBe("test-client-secret");
    expect(account.jwt).toBe("test-jwt");
    expect(account.server).toBe("https://platform.devtest.ringcentral.com");
  });

  it("resolves account from environment variables", () => {
    process.env.RINGCENTRAL_CLIENT_ID = "env-client-id";
    process.env.RINGCENTRAL_CLIENT_SECRET = "env-client-secret";
    process.env.RINGCENTRAL_JWT = "env-jwt";
    process.env.RINGCENTRAL_SERVER = "https://platform.devtest.ringcentral.com";

    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg });

    expect(account.credentialSource).toBe("env");
    expect(account.clientId).toBe("env-client-id");
    expect(account.clientSecret).toBe("env-client-secret");
    expect(account.jwt).toBe("env-jwt");
    expect(account.server).toBe("https://platform.devtest.ringcentral.com");
  });

  it("returns none source when no credentials configured", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg });

    expect(account.credentialSource).toBe("none");
    expect(account.clientId).toBeUndefined();
  });

  it("uses default server when not specified", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          credentials: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            jwt: "test-jwt",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg });

    expect(account.server).toBe("https://platform.ringcentral.com");
  });

  it("resolves specific account from accounts map", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          accounts: {
            work: {
              credentials: {
                clientId: "work-client-id",
                clientSecret: "work-client-secret",
                jwt: "work-jwt",
              },
              name: "Work Account",
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg, accountId: "work" });

    expect(account.accountId).toBe("work");
    expect(account.name).toBe("Work Account");
    expect(account.clientId).toBe("work-client-id");
  });

  it("merges base config with account config", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          credentials: {
            server: "https://base.server.com",
          },
          accounts: {
            work: {
              credentials: {
                clientId: "work-client-id",
                clientSecret: "work-client-secret",
                jwt: "work-jwt",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg, accountId: "work" });

    expect(account.server).toBe("https://base.server.com");
  });

  it("account config overrides base config", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          credentials: {
            server: "https://base.server.com",
          },
          accounts: {
            work: {
              credentials: {
                clientId: "work-client-id",
                clientSecret: "work-client-secret",
                jwt: "work-jwt",
                server: "https://work.server.com",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveRingCentralAccount({ cfg, accountId: "work" });

    expect(account.server).toBe("https://work.server.com");
  });
});

describe("listEnabledRingCentralAccounts", () => {
  it("returns only enabled accounts", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: true,
          credentials: {
            clientId: "base-id",
            clientSecret: "base-secret",
            jwt: "base-jwt",
          },
          accounts: {
            enabled1: {
              enabled: true,
              credentials: {
                clientId: "e1-id",
                clientSecret: "e1-secret",
                jwt: "e1-jwt",
              },
            },
            disabled1: {
              enabled: false,
              credentials: {
                clientId: "d1-id",
                clientSecret: "d1-secret",
                jwt: "d1-jwt",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const accounts = listEnabledRingCentralAccounts(cfg);

    expect(accounts.map((a) => a.accountId)).toContain("enabled1");
    expect(accounts.map((a) => a.accountId)).not.toContain("disabled1");
  });

  it("returns empty array when channel is disabled", () => {
    const cfg = {
      channels: {
        ringcentral: {
          enabled: false,
          accounts: {
            work: { enabled: true },
          },
        },
      },
    } as OpenClawConfig;

    const accounts = listEnabledRingCentralAccounts(cfg);

    expect(accounts).toEqual([]);
  });
});

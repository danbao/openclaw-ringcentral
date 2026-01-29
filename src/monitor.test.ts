import { describe, expect, it } from "vitest";
import { isSenderAllowed } from "./monitor.js";

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

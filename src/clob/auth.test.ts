import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";

describe("L2 HMAC-SHA256 Signing", () => {
  const mockSecret = Buffer.from("dGVzdC1zZWNyZXQta2V5LWZvci1obWFj", "utf-8").toString("base64");

  function buildSignature(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string = "",
  ): string {
    const message = timestamp + method.toUpperCase() + requestPath + body;
    const hmac = createHmac("sha256", Buffer.from(mockSecret, "base64"));
    hmac.update(message);
    return hmac.digest("base64");
  }

  it("produces a deterministic signature for GET request", () => {
    const sig1 = buildSignature("1700000000", "GET", "/orders");
    const sig2 = buildSignature("1700000000", "GET", "/orders");
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different timestamps", () => {
    const sig1 = buildSignature("1700000000", "GET", "/orders");
    const sig2 = buildSignature("1700000001", "GET", "/orders");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different methods", () => {
    const sigGet = buildSignature("1700000000", "GET", "/orders");
    const sigPost = buildSignature("1700000000", "POST", "/orders");
    expect(sigGet).not.toBe(sigPost);
  });

  it("includes body in POST signature", () => {
    const body = JSON.stringify({ order: { salt: "123" } });
    const sigWithBody = buildSignature("1700000000", "POST", "/order", body);
    const sigNoBody = buildSignature("1700000000", "POST", "/order", "");
    expect(sigWithBody).not.toBe(sigNoBody);
  });

  it("uppercases method in signature message", () => {
    const timestamp = "1700000000";
    const method = "get";
    const path = "/orders";
    const message = timestamp + method.toUpperCase() + path;

    const hmac = createHmac("sha256", Buffer.from(mockSecret, "base64"));
    hmac.update(message);
    const expected = hmac.digest("base64");

    expect(buildSignature(timestamp, "GET", path)).toBe(expected);
    expect(buildSignature(timestamp, "get", path)).toBe(expected);
  });

  it("signature is valid base64", () => {
    const sig = buildSignature("1700000000", "GET", "/orders");
    const decoded = Buffer.from(sig, "base64");
    expect(decoded.length).toBe(32);
    expect(decoded.toString("base64")).toBe(sig);
  });

  it("required headers are all present", () => {
    const headers = {
      POLY_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678",
      POLY_API_KEY: "test-api-key",
      POLY_PASSPHRASE: "test-passphrase",
      POLY_SIGNATURE: buildSignature("1700000000", "GET", "/orders"),
      POLY_TIMESTAMP: "1700000000",
    };

    expect(headers.POLY_ADDRESS).toBeTruthy();
    expect(headers.POLY_API_KEY).toBeTruthy();
    expect(headers.POLY_PASSPHRASE).toBeTruthy();
    expect(headers.POLY_SIGNATURE).toBeTruthy();
    expect(headers.POLY_TIMESTAMP).toBeTruthy();
  });
});

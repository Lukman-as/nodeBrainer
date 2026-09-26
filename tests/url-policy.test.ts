import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, parsePublicUrl } from "../src/lib/url-policy";

test("URL policy rejects internal, loopback, metadata, and encoded private hosts", () => {
  for (const url of [
    "https://localhost/",
    "https://service.internal",
    "https://127.0.0.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://169.254.169.254",
    "https://192.168.1.1",
  ])
    assert.throws(() => parsePublicUrl(url), Error, url);
});
test("URL policy permits public HTTPS but not credentials, alternate ports or protocols", () => {
  assert.equal(
    parsePublicUrl("https://example.com/article").hostname,
    "example.com",
  );
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "https://example.com:8443",
  ])
    assert.throws(() => parsePublicUrl(url));
});
test("DNS address checks reject reserved and private IPv4/IPv6 ranges", () => {
  for (const address of [
    "10.0.0.1",
    "172.16.1.1",
    "192.168.0.1",
    "169.254.169.254",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "100.64.0.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

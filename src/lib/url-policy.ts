import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === "unicast";
}

export function parsePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid HTTPS link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Only public HTTPS links on the standard port are supported.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host) ||
    (ipaddr.isValid(host) && !isPublicAddress(host))
  )
    throw new Error("Private network links are not supported.");
  return url;
}

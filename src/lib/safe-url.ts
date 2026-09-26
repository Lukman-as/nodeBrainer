import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isPublicAddress, parsePublicUrl } from "./url-policy";
import { load } from "cheerio";
import { ApiError } from "./http";

export function validatePublicUrl(value: string) {
  try {
    return parsePublicUrl(value);
  } catch (error) {
    throw new ApiError(400, (error as Error).message);
  }
}
async function fetchPage(
  url: URL,
  depth = 0,
): Promise<{ html: string; url: string }> {
  if (depth > 3) throw new ApiError(422, "This link redirects too many times.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new ApiError(400, "Private network links are not supported.");
  const address = addresses[0];
  const response = await new Promise<{
    status: number;
    location?: string;
    type: string;
    body: string;
  }>((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": "LatticeKnowledgeImporter/0.1",
          Accept: "text/html,text/plain",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode || 500;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            location: res.headers.location,
            type: "",
            body: "",
          });
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) {
            res.destroy();
            reject(
              new ApiError(
                413,
                "This page is too large. Import an excerpt as a note instead.",
              ),
            );
          } else parts.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            type: res.headers["content-type"] || "",
            body: Buffer.concat(parts).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    request.setTimeout(10000, () =>
      request.destroy(
        new ApiError(408, "The source website took too long to respond."),
      ),
    );
    const timer = setTimeout(
      () =>
        request.destroy(
          new ApiError(408, "The source website took too long to respond."),
        ),
      12000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
  if (response.status >= 300 && response.status < 400 && response.location)
    return fetchPage(
      validatePublicUrl(new URL(response.location, url).href),
      depth + 1,
    );
  if (response.status !== 200)
    throw new ApiError(
      422,
      "This page is not publicly accessible. Paste an excerpt you can access instead.",
    );
  if (!/text\/(html|plain)/i.test(response.type))
    throw new ApiError(
      422,
      "Upload the file instead. This importer accepts public article pages.",
    );
  return { html: response.body, url: url.href };
}
export async function extractArticle(value: string) {
  const page = await fetchPage(validatePublicUrl(value));
  const $ = load(page.html);
  const title =
    $("title").first().text().trim().slice(0, 180) ||
    new URL(page.url).hostname;
  $("script,style,nav,footer,header,aside,form,noscript").remove();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()
    .slice(0, 40000);
  if (text.length < 100)
    throw new ApiError(
      422,
      "No article text was accessible. Dynamic or sign-in-only posts need a pasted excerpt.",
    );
  return { title, text, url: page.url };
}

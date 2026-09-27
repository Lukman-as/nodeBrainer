import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

type Element = {
  type: string;
  props: { children?: unknown; href?: string; [key: string]: unknown };
};
type Session = { user: { sub?: string; name?: string } } | null;
// Exercise the actual server pages with SDK boundary mocks, without issuing login requests.
function page(path: string, ready: boolean, session: Session) {
  let reads = 0;
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const exports: { default?: (props?: unknown) => Promise<Element> } = {};
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { __esModule: true, default: "a" },
    "lucide-react": { ArrowLeft: "icon", ArrowRight: "icon", Mountain: "icon" },
    "@/components/knowledge-workspace": { KnowledgeWorkspace: "workspace" },
    "@/lib/auth0": {
      isAuthConfigured: () => ready,
      getAuth0: () => {
        assert.ok(ready, "unconfigured demo must not initialize Auth0");
        return {
          getSession: async () => {
            reads++;
            return session;
          },
        };
      },
    },
    "next/navigation": {
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
      },
    },
  };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { render: exports.default!, reads: () => reads };
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}

const noParams = { searchParams: Promise.resolve({}) };
test("home resumes a valid session instead of rendering demo", async () => {
  const home = page("src/app/page.tsx", true, { user: { sub: "auth0|test" } });
  await assert.rejects(home.render(noParams), /redirect:\/workspace/);
  assert.equal(home.reads(), 1);
});
test("home ?mock shows the mock library even when signed in", async () => {
  const home = page("src/app/page.tsx", true, { user: { sub: "auth0|test" } });
  const result = await home.render({ searchParams: Promise.resolve({ mock: "" }) });
  assert.equal(result.type, "workspace");
  assert.equal(result.props.mock, true);
});
test("home keeps demo accessible when signed out, expired, or unconfigured", async () => {
  for (const [ready, session] of [
    [true, null],
    [true, { user: {} }],
    [false, null],
  ] as [boolean, Session][]) {
    const home = page("src/app/page.tsx", ready, session);
    assert.equal((await home.render(noParams)).type, "workspace");
    assert.equal(home.reads(), ready ? 1 : 0);
  }
});
test("setup preserves signed-in navigation and provides explicit account actions", async () => {
  const setup = page("src/app/setup/page.tsx", true, {
    user: { sub: "auth0|test", name: "Test User" },
  });
  const result = await setup.render();
  const links = elements(result)
    .filter((node) => node.type === "a")
    .map((node) => node.props.href);
  assert.equal(links.filter((href) => href === "/workspace").length, 2);
  assert.ok(links.includes("/auth/logout"));
  assert.ok(links.includes("/auth/login?prompt=login&returnTo=%2Fworkspace"));
  assert.ok(!links.includes("/auth/login"));
  assert.ok(!links.includes("/"));
  assert.match(JSON.stringify(result), /Signed in as Test User/);
});
test("setup offers login only when signed out and Auth0 is configured", async () => {
  for (const ready of [true, false]) {
    const setup = page("src/app/setup/page.tsx", ready, null);
    const links = elements(await setup.render()).map((node) => node.props.href);
    assert.equal(links.includes("/auth/login"), ready);
    assert.ok(!links.includes("/auth/logout"));
    assert.ok(links.includes("/"));
  }
});

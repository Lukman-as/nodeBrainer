"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY, type Theme } from "@/lib/theme";

// The theme lives on <html data-theme>, set before paint by the layout script.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
const read = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f7f8f5" : "#07060a");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this page view.
  }
}

export function ThemeToggle() {
  const theme = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "light"}
      aria-label="Light mode"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="theme-switch"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <span aria-hidden="true">
        <Moon size={13} />
      </span>
      <span aria-hidden="true">
        <Sun size={13} />
      </span>
    </button>
  );
}

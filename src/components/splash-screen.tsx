"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SPLASH_SEEN_KEY } from "@/lib/splash";

const VISIBLE_MS = 5500;
const FADE_MS = 500;

/**
 * Full-screen intro shown once per browser session. It is rendered in the
 * root layout, so client-side navigation never re-mounts it; sessionStorage
 * covers reloads. The inline script in layout.tsx hides it before first paint
 * when this session has already seen it, so returning visits never flash it.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">(
    "visible",
  );

  // Decided once per mount: Strict Mode re-runs effects, and the second run
  // would otherwise read back the flag the first run just wrote.
  const seenBefore = useRef<boolean | null>(null);

  useEffect(() => {
    if (seenBefore.current === null) {
      seenBefore.current = false;
      try {
        seenBefore.current = sessionStorage.getItem(SPLASH_SEEN_KEY) === "1";
        sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
      } catch {
        // Storage can be unavailable (private mode, blocked site data); show the splash.
      }
    }
    if (seenBefore.current) {
      setPhase("gone");
      return;
    }
    // Count from page load rather than hydration, so slow hydration doesn't extend it.
    const timer = setTimeout(
      () => setPhase("leaving"),
      Math.max(0, VISIBLE_MS - performance.now()),
    );
    const onKey = (event: KeyboardEvent) => {
      if (["Escape", "Enter", " "].includes(event.key)) setPhase("leaving");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div
      className={`splash-screen${phase === "leaving" ? " is-leaving" : ""}`}
      onClick={() => setPhase("leaving")}
      role="presentation"
    >
      <Image
        className="splash-image"
        src="/nodebrainer-splash.png"
        alt="NodeBrainer"
        fill
        preload
        // The wordmark banner is shown whole, up to 1100px wide (see globals.css).
        sizes="(max-width: 1310px) 84vw, 1100px"
      />
    </div>
  );
}

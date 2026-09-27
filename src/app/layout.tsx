import type { Metadata, Viewport } from "next";
import { SplashScreen } from "@/components/splash-screen";
import { SPLASH_SEEN_KEY } from "@/lib/splash";
import { THEME_KEY } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "NodeBrainer — Your second mind",
  description:
    "NodeBrainer is a multimedia memory workspace. Save ideas, find precise passages, and discover the connections between them.",
  applicationName: "NodeBrainer",
};
export const viewport: Viewport = {
  themeColor: "#07060a",
  colorScheme: "dark",
};

// Run before first paint: hide the splash when this session has already seen it,
// and apply a saved light theme so it never flashes dark first.
const splashSeenScript = `try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)})==="1")document.documentElement.dataset.splashSeen=""}catch(e){}`;
const themeScript = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="light"){document.documentElement.dataset.theme="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content="#f7f8f5"}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The inline scripts may add data-splash-seen / data-theme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashSeenScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}

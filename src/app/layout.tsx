import type { Metadata } from "next";
import { SplashScreen } from "@/components/splash-screen";
import { SPLASH_SEEN_KEY } from "@/lib/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: "NodeBrainer — Your second mind",
  description:
    "NodeBrainer is a multimedia memory workspace. Save ideas, find precise passages, and discover the connections between them.",
};

// Runs before first paint: hides the splash when this session has already seen it.
const splashSeenScript = `try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)})==="1")document.documentElement.dataset.splashSeen=""}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The inline script may add data-splash-seen before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashSeenScript }} />
      </head>
      <body>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}

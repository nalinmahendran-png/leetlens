import type { Metadata } from "next";
import Starfield from "@/components/Starfield";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LeetLens", template: "%s · LeetLens" },
  description: "See your LeetCode progress as a solar system, get smart next-problem suggestions, and climb the leaderboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=Syne:wght@500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Starfield />
        {children}
        <p className="footer">LeetLens is an independent project and is not affiliated with LeetCode. It only reads public profile data.</p>
      </body>
    </html>
  );
}

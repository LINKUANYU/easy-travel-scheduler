import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import ButtonConfetti from "./components/effects/ButtonConfetti";
import { AuthProvider } from "./context/AuthContext";
import { TaskProvider } from "./context/TaskContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://easy-travel-scheduler.linkuankuan.com/'),
  title: 'Easy-Travel-scheduler - 你的專屬旅遊規劃助手',
  description: '一站式整合景點、地圖、行程表，輕鬆規劃你的下一趟旅程！',
  openGraph: {
    title: 'Easy-Travel-scheduler - 你的專屬旅遊規劃助手',
    description: '一站式整合景點、地圖、行程表，輕鬆規劃你的下一趟旅程！',
    url: 'https://easy-travel-scheduler.linkuankuan.com/',
    siteName: 'Easy-Travel-scheduler',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Easy-Travel-scheduler 網站預覽圖',
      },
    ],
    locale: 'zh_TW',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <Providers>
          <AuthProvider>
            <TaskProvider>
              <Header />
              <div className="flex flex-col flex-1 w-full">
                {children}
              </div>
              <Footer />
            </TaskProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}

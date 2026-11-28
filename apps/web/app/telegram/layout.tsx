import type { Metadata } from 'next';

import '../globals.css';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'SexyVoice stats',
};

/** Root layout for admin Mini Apps opened from the Telegram daily report. */
export default function TelegramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

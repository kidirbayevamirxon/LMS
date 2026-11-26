import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/AppShell';
import { AppProvider } from '@/context/AppContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'EduManager — O‘quv markazi boshqaruv tizimi',
  description: 'O‘quvchilar, guruhlar, oylik to‘lovlar, Face ID davomat va sertifikatlar boshqaruvi',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}

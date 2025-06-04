import { ReactQueryClientProvider } from '@/components/ReactQueryClientProvider';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReactQueryClientProvider>{children}</ReactQueryClientProvider>;
}

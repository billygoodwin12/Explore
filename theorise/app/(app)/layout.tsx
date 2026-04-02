import Ticker from '@/components/layout/Ticker';
import Header from '@/components/layout/Header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Ticker />
      <Header />
      {children}
    </div>
  );
}

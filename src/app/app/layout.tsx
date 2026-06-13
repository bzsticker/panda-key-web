// src/app/app/layout.tsx
'use client';

import React from 'react';
import { AppProvider } from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import MiniPlayer from '@/components/MiniPlayer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="app-shell">
        {/* Sidebar Left */}
        <Sidebar />

        {/* Main Content Right */}
        <main className="main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          <Topbar />
          
          {/* Scrollable page content */}
          <div style={{ flex: '1', overflowY: 'auto', overflowX: 'hidden', padding: '24px 24px 0 24px', display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          
          {/* Persistent Mini Player at the bottom */}
          <MiniPlayer />
        </main>
      </div>
    </AppProvider>
  );
}

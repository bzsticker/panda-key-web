// src/app/app/edit/page.tsx
'use client';

import React from 'react';
import MiniPlayer from '@/components/MiniPlayer';
import { useApp } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function EditPage() {
  const { settings } = useApp();
  const t = getTranslation(settings.language);

  return (
    <section className="page active" id="edit" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading" style={{ marginBottom: '16px' }}>
        <h1>{t('tab_edit')}</h1>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <MiniPlayer />
      </div>
    </section>
  );
}

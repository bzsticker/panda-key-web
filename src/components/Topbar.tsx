// src/components/Topbar.tsx
'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function Topbar() {
  const {
    activePage,
    setActivePage,
    searchQuery,
    setSearchQuery,
    logout,
    user,
    settings
  } = useApp();

  const t = getTranslation(settings.language);

  const handleTabClick = (pageId: string) => {
    setActivePage(pageId);
  };

  return (
    <header className="topbar">
      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activePage === 'collection' ? 'active' : ''}`}
          onClick={() => handleTabClick('collection')}
        >
          {t('tab_collection')}
        </button>
        <button 
          className={`tab ${activePage === 'tags' ? 'active' : ''}`}
          onClick={() => handleTabClick('tags')}
        >
          {t('tab_tags')}
        </button>
        <button 
          className={`tab ${activePage === 'analysis' ? 'active' : ''}`}
          onClick={() => handleTabClick('analysis')}
        >
          {t('tab_analysis')}
        </button>
        <button 
          className={`tab ${activePage === 'playlists' ? 'active' : ''}`}
          onClick={() => handleTabClick('playlists')}
        >
          {t('tab_playlists')}
        </button>
        <button 
          className={`tab ${activePage === 'edit' ? 'active' : ''}`}
          onClick={() => handleTabClick('edit')}
        >
          {t('tab_edit')}
        </button>
        <button 
          className={`tab ${activePage === 'analytics' ? 'active' : ''}`}
          onClick={() => handleTabClick('analytics')}
        >
          {settings.language === 'th' ? 'สถิติคลังเพลง (Analytics)' : 'Analytics'}
        </button>
        <button 
          className={`tab ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabClick('settings')}
        >
          {t('tab_settings')}
        </button>
      </div>

      {/* Top right actions */}
      <div className="top-links">
        <span className="text-xs font-semibold px-2 py-1 rounded bg-opacity-10 bg-white" style={{ color: 'var(--text-muted)' }}>
          {user?.email}
        </span>
        <button 
          onClick={logout}
          className="text-xs transition-colors hover:text-red-400 font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('logout')}
        </button>
        <label className="search">
          <span>⌕</span>
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_tracks')} 
          />
        </label>
        <span className="window-btn">─</span>
        <span className="window-btn">□</span>
        <span className="window-btn" onClick={logout} title="Sign Out">×</span>
      </div>
    </header>
  );
}

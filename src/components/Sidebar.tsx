// src/components/Sidebar.tsx
'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import CamelotWheel from './CamelotWheel';
import { getTranslation } from '@/lib/translations';

export default function Sidebar() {
  const {
    tracks,
    playlists,
    collections,
    activePage,
    activeFilter,
    selectedPlaylistId,
    selectedCollectionId,
    setActivePage,
    setActiveFilter,
    setSelectedPlaylistId,
    setSelectedCollectionId,
    createPlaylist,
    deletePlaylist,
    createCollection,
    deleteCollection,
    settings
  } = useApp();

  const t = getTranslation(settings.language);

  // Calculate quick stats
  const allTracksCount = tracks.length;

  return (
    <aside className="sidebar">
      {/* Brand Logo */}
      <div className="brand" style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <img 
          src="/logo.png" 
          style={{ 
            width: '100%', 
            maxHeight: '80px', 
            objectFit: 'contain'
          }} 
          alt="PandaKey Logo" 
        />
      </div>

      {/* Camelot Key Wheel */}
      <CamelotWheel />



      {/* Sidebar Navigation */}
      <nav className="side-nav">
        <div className="section-title flex-title">
          <span>{t('collection')}</span>
          <span 
            onClick={() => {
              const promptNameText = settings.language === 'th' ? 'กรุณากรอกชื่อ Collection ใหม่:' : 'Please enter new collection name:';
              const promptDescText = settings.language === 'th' ? 'คำอธิบาย Collection:' : 'Collection description:';
              const name = prompt(promptNameText);
              if (name) {
                const desc = prompt(promptDescText);
                createCollection(name, desc || '');
                setActivePage('collection');
                setActiveFilter('');
              }
            }} 
            style={{ cursor: 'pointer' }}
            title={settings.language === 'th' ? 'สร้าง Collection ใหม่' : 'Create Collection'}
          >
            ＋
          </span>
        </div>

        <button
          className={`side-item ${activePage === 'collection' && activeFilter === 'all' && !selectedCollectionId ? 'active' : ''}`}
          onClick={() => {
            setActivePage('collection');
            setActiveFilter('all');
            setSelectedCollectionId(null);
          }}
        >
          <span>♫ {t('all_tracks')}</span>
          <strong>{allTracksCount}</strong>
        </button>
        

        {/* Custom Collections */}
        <div id="sidebarCollectionsContainer" className="flex flex-col gap-1 mb-3">
          {(collections || []).map(c => {
            const isActive = activePage === 'collection' && selectedCollectionId === c.id;
            return (
              <div
                key={c.id}
                className={`side-item group ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActivePage('collection');
                  setActiveFilter('');
                  setSelectedCollectionId(c.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <span className="truncate" style={{ flexGrow: 1, paddingRight: '8px' }}>♫ {c.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong>{c.trackCount || c.trackIds?.length || 0}</strong>
                  <button
                    className="delete-playlist-btn opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={(e) => {
                      e.stopPropagation();
                      const confirmText = settings.language === 'th' 
                        ? `คุณต้องการลบ Collection "${c.name}" ใช่หรือไม่?` 
                        : `Are you sure you want to delete Collection "${c.name}"?`;
                      if (confirm(confirmText)) {
                        deleteCollection(c.id);
                      }
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: '1',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      transition: 'all 0.15s ease'
                    }}
                    title={settings.language === 'th' ? 'ลบ Collection' : 'Delete Collection'}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Playlists Section */}
        <div className="section-title flex-title">
          <span>{t('playlists')}</span>
          <span 
            onClick={() => {
              const promptNameText = settings.language === 'th' ? 'กรุณากรอกชื่อ Playlist ใหม่:' : 'Please enter new playlist name:';
              const promptDescText = settings.language === 'th' ? 'คำอธิบาย Playlist:' : 'Playlist description:';
              const name = prompt(promptNameText);
              if (name) {
                const desc = prompt(promptDescText);
                createPlaylist(name, desc || '');
                setActivePage('playlists');
              }
            }} 
            style={{ cursor: 'pointer' }}
          >
            ＋
          </span>
        </div>

        <div id="sidebarPlaylistsContainer" className="flex flex-col gap-1">
          {playlists.map(p => {
            const isActive = activePage === 'playlists' && selectedPlaylistId === p.id;
            return (
              <div
                key={p.id}
                className={`side-item group ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActivePage('playlists');
                  setSelectedPlaylistId(p.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <span className="truncate" style={{ flexGrow: 1, paddingRight: '8px' }}>♫ {p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong>{p.trackCount || p.trackIds?.length || 0}</strong>
                  <button
                    className="delete-playlist-btn opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={(e) => {
                      e.stopPropagation();
                      const confirmText = settings.language === 'th' 
                        ? `คุณต้องการลบ Playlist "${p.name}" ใช่หรือไม่?` 
                        : `Are you sure you want to delete Playlist "${p.name}"?`;
                      if (confirm(confirmText)) {
                        deletePlaylist(p.id);
                      }
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: '1',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      transition: 'all 0.15s ease'
                    }}
                    title={settings.language === 'th' ? 'ลบ Playlist' : 'Delete Playlist'}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </nav>



      {/* Status Footer */}
      <footer className="app-status">
        <span>PANDA KEY v1.1.0</span>
        <b id="statusText">✓ {settings.language === 'th' ? 'เชื่อมต่อแล้ว' : 'Connected'}</b>
      </footer>
    </aside>
  );
}

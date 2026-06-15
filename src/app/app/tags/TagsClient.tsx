'use client';

import React, { useState, useEffect } from 'react';
import { useApp, Track } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

interface TagChange {
  trackId: string;
  track: Track;
  changes: { field: string; original: string; modified: string }[];
}

export default function TagsPage() {
  const { tracks, updateTrackMetadata, reEnqueueAnalysis, settings } = useApp();
  const t = getTranslation(settings.language);

  const [activeTab, setActiveTab] = useState<'replace' | 'spaces'>('replace');
  const [replaceText, setReplaceText] = useState('DJ');
  const [withText, setWithText] = useState('');
  const [selectedCols, setSelectedCols] = useState<string[]>(['artist', 'title']);
  const [pendingChanges, setPendingChanges] = useState<TagChange[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const columnsList = ['artist', 'title', 'album', 'genre'];

  // Calculate changes in real time when input parameters change
  useEffect(() => {
    calculateChanges();
  }, [tracks, activeTab, replaceText, withText, selectedCols]);

  const toggleColumn = (col: string) => {
    if (selectedCols.includes(col)) {
      if (selectedCols.length > 1) {
        setSelectedCols(prev => prev.filter(c => c !== col));
      }
    } else {
      setSelectedCols(prev => [...prev, col]);
    }
  };

  const calculateChanges = () => {
    const computed: TagChange[] = [];
    
    if (activeTab === 'replace') {
      if (!replaceText) {
        setPendingChanges([]);
        return;
      }

      tracks.forEach(track => {
        let isAffected = false;
        const changesList: { field: string; original: string; modified: string }[] = [];

        selectedCols.forEach(col => {
          const val = (track as any)[col];
          if (val && typeof val === 'string' && val.includes(replaceText)) {
            isAffected = true;
            const newVal = val.split(replaceText).join(withText);
            changesList.push({ field: col, original: val, modified: newVal });
          }
        });

        if (isAffected) {
          computed.push({ trackId: track.id, track, changes: changesList });
        }
      });
    } else {
      // Spaces cleanup
      tracks.forEach(track => {
        let isAffected = false;
        const changesList: { field: string; original: string; modified: string }[] = [];

        selectedCols.forEach(col => {
          const val = (track as any)[col];
          if (val && typeof val === 'string') {
            const newVal = val.trim().replace(/\s+/g, ' ');
            if (val !== newVal) {
              isAffected = true;
              changesList.push({ field: col, original: val, modified: newVal });
            }
          }
        });

        if (isAffected) {
          computed.push({ trackId: track.id, track, changes: changesList });
        }
      });
    }

    setPendingChanges(computed);
  };

  const handleApplyChanges = async (writeToFiles: boolean = false) => {
    if (pendingChanges.length === 0) return;
    setIsProcessing(true);

    try {
      for (const item of pendingChanges) {
        const metadataUpdate: Partial<Track> = {};
        item.changes.forEach(c => {
          (metadataUpdate as any)[c.field] = c.modified;
        });

        // 1. Update in D1 database
        await updateTrackMetadata(item.trackId, metadataUpdate);

        // 2. If requested, write tags back to file (requires local mutagen worker)
        if (writeToFiles) {
          // Trigger file write job in cloudflare queues
          const res = await fetch('/api/tracks/write-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: item.trackId })
          });
          
          if (!res.ok) console.warn('Failed to enqueue file write job for', item.trackId);
        }
      }

      alert(writeToFiles 
        ? t('tags_save_files_success')
        : t('tags_save_db_success')
      );
      
      // Clear inputs
      setReplaceText('');
      setWithText('');
    } catch (e) {
      console.error(e);
      alert(t('tags_save_error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const totalChangesCount = pendingChanges.reduce((sum, item) => sum + item.changes.length, 0);

  return (
    <section className="page active" id="tags" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      {/* Tag Tools Panel */}
      <div className="tag-tools panel">
        <div className="subtabs">
          <button 
            className={activeTab === 'replace' ? 'active' : ''} 
            onClick={() => { setActiveTab('replace'); setSelectedCols(['artist', 'title']); }}
          >
            {t('tags_tab_replace')}
          </button>
          <button 
            className={activeTab === 'spaces' ? 'active' : ''} 
            onClick={() => { setActiveTab('spaces'); setSelectedCols(['artist', 'title', 'album', 'genre']); }}
          >
            {t('tags_tab_spaces')}
          </button>
        </div>

        {activeTab === 'replace' ? (
          <div className="replace-grid" id="replaceControls">
            <label>{t('tags_replace_input_label')}
              <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="e.g. DJ" />
            </label>
            <label>{t('tags_with_input_label')}
              <input value={withText} onChange={(e) => setWithText(e.target.value)} placeholder="e.g. MC" />
            </label>
            <div className="column-selection-wrapper">
              <span className="label-text">{t('tags_in_columns_label')}</span>
              <div className="column-chips">
                {columnsList.map(c => (
                  <button 
                    key={c}
                    className={`chip ${selectedCols.includes(c) ? 'active' : ''}`}
                    onClick={() => toggleColumn(c)}
                  >
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <button className="primary" onClick={() => handleApplyChanges(false)} disabled={isProcessing}>
              {t('tags_replace_btn')}
            </button>
          </div>
        ) : (
          <div className="replace-grid" id="spaceControls">
            <div className="space-explanation">
              <p>{t('tags_spaces_explanation')}</p>
            </div>
            <div className="column-selection-wrapper">
              <span className="label-text">{t('tags_in_columns_label')}</span>
              <div className="column-chips">
                {columnsList.map(c => (
                  <button 
                    key={c}
                    className={`chip ${selectedCols.includes(c) ? 'active' : ''}`}
                    onClick={() => toggleColumn(c)}
                  >
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <button className="primary" onClick={() => handleApplyChanges(false)} disabled={isProcessing}>
              {t('tags_spaces_btn')}
            </button>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="stats-grid mt-4">
        <div className="stat panel">
          <span>{t('tags_affected')}</span>
          <b>{pendingChanges.length}</b>
          <small>{settings.language === 'th' ? `จาก ${tracks.length}` : `of ${tracks.length}`}</small>
        </div>
        <div className="stat panel">
          <span>{t('tags_changes')}</span>
          <b>{totalChangesCount}</b>
          <small>{settings.language === 'th' ? 'ฟิลด์ทั้งหมด' : 'total fields'}</small>
        </div>
        <div className="stat panel">
          <span>{t('tags_columns')}</span>
          <b>{selectedCols.length}</b>
          <small>{t('tags_selected')}</small>
        </div>
        <div className="stat panel">
          <span>{t('tags_preview_mode')}</span>
          <b>◉</b>
          <small>{t('tags_preview_desc')}</small>
        </div>
      </div>

      {/* Compare Table */}
      <div className="panel table-panel flex-grow overflow-auto mt-4">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>File</th>
              <th>{t('artist')}</th>
              <th>{t('title')}</th>
              <th>{t('album')}</th>
              <th>{t('genre')}</th>
              <th>{t('year')}</th>
            </tr>
          </thead>
          <tbody>
            {pendingChanges.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center muted" style={{ padding: '40px' }}>
                  {t('no_changes_detected')}
                </td>
              </tr>
            ) : (
              pendingChanges.map((item, idx) => {
                const getFieldMarkup = (field: string, original: string) => {
                  const change = item.changes.find(c => c.field === field);
                  if (!change) return original;
                  return (
                    <span>
                      <span className="line-through text-red-400 opacity-60 mr-2">{change.original}</span>
                      <span className="bg-emerald-950 text-emerald-300 px-1 py-0.5 rounded">{change.modified}</span>
                    </span>
                  );
                };

                return (
                  <tr key={item.trackId}>
                    <td title={String(idx + 1)}>{idx + 1}</td>
                    <td title={item.track.file_name}>{item.track.file_name}</td>
                    <td title={item.track.artist}>{getFieldMarkup('artist', item.track.artist)}</td>
                    <td title={item.track.title}>{getFieldMarkup('title', item.track.title)}</td>
                    <td title={item.track.album}>{getFieldMarkup('album', item.track.album)}</td>
                    <td title={item.track.genre}>{getFieldMarkup('genre', item.track.genre)}</td>
                    <td title={String(item.track.year)}>{item.track.year}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Save Panels */}
      <div className="bottom-actions panel mt-4 flex items-center justify-between">
        <button onClick={() => calculateChanges()} className="border px-4 py-2 rounded text-sm hover:bg-slate-800">
          {t('tags_refresh_btn')}
        </button>
        <span className="text-sm font-semibold text-cyan-400">
          {t('tags_ready_to_save').replace('{count}', String(totalChangesCount))}
        </span>
        <div className="flex gap-2">
          <button 
            className="px-4 py-2 rounded text-sm bg-slate-800 hover:bg-slate-700"
            onClick={() => handleApplyChanges(false)}
            disabled={isProcessing || pendingChanges.length === 0}
          >
            {t('tags_save_db_btn')}
          </button>
          <button 
            className="primary px-4 py-2 rounded text-sm"
            onClick={() => handleApplyChanges(true)}
            disabled={isProcessing || pendingChanges.length === 0}
          >
            {t('tags_save_files_btn')}
          </button>
        </div>
      </div>
    </section>
  );
}

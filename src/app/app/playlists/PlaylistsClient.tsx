// src/app/app/playlists/page.tsx
'use client';

import React from 'react';
import { useApp, Playlist, Track } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function PlaylistsPage() {
  const {
    tracks,
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    createPlaylist,
    updatePlaylistTracks,
    deletePlaylist,
    playTrack,
    setActivePage,
    setActiveFilter,
    setSortBy,
    setSortDesc,
    setFilterKeyGroup,
    setFilterKey,
    currentTrack,
    settings
  } = useApp();

  const t = getTranslation(settings.language);
  const activePlaylist = playlists.find(p => p.id === selectedPlaylistId);

  // Find tracks belonging to active playlist
  const playlistTracks = activePlaylist
    ? tracks.filter(t => activePlaylist.trackIds.includes(t.id))
    : [];

  const handleCreatePlaylist = () => {
    const name = prompt(t('playlist_new_prompt'));
    if (!name) return;
    const desc = prompt(t('playlist_desc_prompt'));
    createPlaylist(name, desc || '');
  };

  const handleRenamePlaylist = () => {
    if (!activePlaylist) return;
    const name = prompt(t('playlist_rename_prompt'), activePlaylist.name);
    if (!name) return;
    
    // Update name in DB
    const renameAPI = async () => {
      try {
        await fetch(`/api/playlists/${activePlaylist.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        window.location.reload();
      } catch (e) {
        console.error(e);
      }
    };
    renameAPI();
  };

  const handleDeletePlaylist = () => {
    if (!activePlaylist) return;
    if (confirm(t('playlist_delete_confirm').replace('{name}', activePlaylist.name))) {
      deletePlaylist(activePlaylist.id);
    }
  };

  const handleRemoveTrack = (trackId: string) => {
    if (!activePlaylist) return;
    const newTrackIds = activePlaylist.trackIds.filter(id => id !== trackId);
    updatePlaylistTracks(activePlaylist.id, newTrackIds);
  };

  const handleMoveTrackPosition = (trackId: string, direction: 'up' | 'down') => {
    if (!activePlaylist) return;
    const currentTrackIds = [...activePlaylist.trackIds];
    const index = currentTrackIds.indexOf(trackId);
    if (index === -1) return;
    
    if (direction === 'up' && index > 0) {
      const temp = currentTrackIds[index];
      currentTrackIds[index] = currentTrackIds[index - 1];
      currentTrackIds[index - 1] = temp;
    } else if (direction === 'down' && index < currentTrackIds.length - 1) {
      const temp = currentTrackIds[index];
      currentTrackIds[index] = currentTrackIds[index + 1];
      currentTrackIds[index + 1] = temp;
    }
    
    updatePlaylistTracks(activePlaylist.id, currentTrackIds);
  };

  const renderEnergyFlowChart = () => {
    if (playlistTracks.length < 2) return null;
    
    const width = 500;
    const height = 65;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const points = playlistTracks.map((track, idx) => {
      const x = padding + (idx / (playlistTracks.length - 1)) * chartWidth;
      const energy = track.energy || 5;
      const y = padding + chartHeight - ((energy - 1) / 9) * chartHeight;
      return { x, y, energy, title: track.title };
    });
    
    const pathD = points.reduce((acc, p, idx) => {
      return acc + `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    }, '');
    
    return (
      <div className="energy-flow-chart-container mb-4" style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', borderRadius: 'var(--border-radius-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {settings.language === 'th' ? 'กราฟเส้นแสดงทิศทางพลังงาน (Setlist Energy Curve)' : 'Setlist Energy Flow Curve'}
          </span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            {settings.language === 'th' ? `พลังงานเฉลี่ย: ${(playlistTracks.reduce((acc, t) => acc + (t.energy || 5), 0) / playlistTracks.length).toFixed(1)}/10` : `Average Energy: ${(playlistTracks.reduce((acc, t) => acc + (t.energy || 5), 0) / playlistTracks.length).toFixed(1)}/10`}
          </span>
        </div>
        <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="energyCurveGlow" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent-green)" />
                <stop offset="50%" stopColor="var(--accent-yellow)" />
                <stop offset="100%" stopColor="var(--accent-red)" />
              </linearGradient>
            </defs>
            
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5" />
            <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5" />
            <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5" />
            
            <path
              d={pathD}
              fill="none"
              stroke="url(#energyCurveGlow)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0px 0px 4px rgba(255, 100, 0, 0.3))' }}
            />
            
            {points.map((p, idx) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#ffffff"
                stroke="var(--bg-primary)"
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
              >
                <title>{`${p.title} (Energy: ${p.energy})`}</title>
              </circle>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  const handleExportPlaylist = () => {
    if (!activePlaylist) return;
    // Download playlist as M3U format
    const m3uLines = ['#EXTM3U'];
    playlistTracks.forEach(t => {
      m3uLines.push(`#EXTINF:${Math.round(t.duration)},${t.artist} - ${t.title}`);
      m3uLines.push(t.file_name);
    });
    
    const blob = new Blob([m3uLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activePlaylist.name.replace(/\s+/g, '_')}.m3u`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Smart suggestions handling
  const handleViewSmartMatches = (type: string) => {
    setActivePage('collection');
    setActiveFilter('all');
    setFilterKeyGroup('');
    setFilterKey('');

    if (type === 'warmup') {
      setSortBy('energy');
      setSortDesc(false); // Low energy
      alert(t('smart_filter_warmup'));
    } else if (type === 'peak') {
      setSortBy('energy');
      setSortDesc(true); // High energy
      alert(t('smart_filter_peak'));
    } else if (type === 'afterparty') {
      setFilterKeyGroup('A'); // Minor keys
      setSortBy('bpm');
      alert(t('smart_filter_afterparty'));
    } else if (type === 'samekey') {
      if (currentTrack) {
        setFilterKey(currentTrack.camelot_key);
        alert(t('smart_filter_samekey').replace('{title}', currentTrack.title).replace('{key}', currentTrack.camelot_key));
      } else {
        alert(t('smart_filter_samekey_error'));
      }
    } else if (type === 'similarbpm') {
      if (currentTrack) {
        setSortBy('bpm');
        alert(t('smart_filter_tempo').replace('{bpm}', String(currentTrack.bpm)));
      } else {
        alert(t('smart_filter_tempo_error'));
      }
    }
  };

  const keyColors: Record<string, string> = {
    '12B':'#18d5ff', '1B':'#37f1af', '2B':'#a4f369', '3B':'#ffd65b',
    '4B':'#ff934e', '5B':'#ff607b', '6B':'#e55af1', '7B':'#aa62ff',
    '8B':'#69a3ff', '9B':'#42d3ff', '10B':'#18d5ff', '11B':'#23f2bd',
    '12A':'#00bfff', '1A':'#18ffb0', '2A':'#27e38c', '3A':'#ffd600',
    '4A':'#ffaa00', '5A':'#ff4b5c', '6A':'#ff5074', '7A':'#ec5bff',
    '8A':'#ec5bff', '9A':'#16b7ff', '10A':'#00d8ff', '11A':'#2fb8ff'
  };

  const keyNotationMapping: Record<string, Record<string, string>> = {
    camelot: {
      '12B':'12B', '1B':'1B', '2B':'2B', '3B':'3B', '4B':'4B', '5B':'5B', '6B':'6B', '7B':'7B', '8B':'8B', '9B':'9B', '10B':'10B', '11B':'11B',
      '12A':'12A', '1A':'1A', '2A':'2A', '3A':'3A', '4A':'4A', '5A':'5A', '6A':'6A', '7A':'7A', '8A':'8A', '9A':'9A', '10A':'10A', '11A':'11A'
    },
    musical: {
      '12B':'E', '1B':'B', '2B':'F#', '3B':'Db', '4B':'Ab', '5B':'Eb', '6B':'Bb', '7B':'F', '8B':'C', '9B':'G', '10B':'D', '11B':'A',
      '12A':'Dbm', '1A':'Abm', '2A':'Ebm', '3A':'Bbm', '4A':'Fm', '5A':'Cm', '6A':'Gm', '7A':'Dm', '8A':'Am', '9A':'Em', '10A':'Bm', '11A':'F#m'
    },
    openkey: {
      '12B':'1d', '1B':'2d', '2B':'3d', '3B':'4d', '4B':'5d', '5B':'6d', '6B':'7d', '7B':'8d', '8B':'9d', '9B':'10d', '10B':'11d', '11B':'12d',
      '12A':'1m', '1A':'2m', '2A':'3m', '3A':'4m', '4A':'5m', '5A':'6m', '6A':'7m', '7A':'8m', '8A':'9m', '9A':'10m', '10A':'11m', '11A':'12m'
    }
  };

  const displayKey = (key: string) => {
    const notation = settings.keyNotation || 'camelot';
    return keyNotationMapping[notation]?.[key] || key;
  };

  const formatDuration = (secs: number) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className="page active" id="playlists" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading">
        <h1>{t('tab_playlists')}</h1>
        <div className="toolbar">
          <button 
            className="primary" 
            onClick={() => {
              if (playlistTracks.length > 0) playTrack(playlistTracks[0]);
              else alert(t('playlist_empty_alert'));
            }}
            disabled={playlistTracks.length === 0}
          >
            {t('playlist_play_btn')}
          </button>
          <button onClick={handleExportPlaylist} disabled={!activePlaylist}>
            {t('playlist_export_btn')}
          </button>
        </div>
      </div>

      <div className="playlist-layout mt-4">
        {/* Playlists Left List Menu */}
        <div className="panel playlist-menu">
          <div className="playlist-menu-header">
            <h2>{t('playlist_title_my')}</h2>
            <button className="square" onClick={handleCreatePlaylist} title="Create Playlist">＋</button>
          </div>
          <div className="playlist-list-container overflow-y-auto pr-1">
            {playlists.length === 0 ? (
              <p className="muted text-xs p-4 text-center">{t('playlist_empty_placeholder')}</p>
            ) : (
              playlists.map(p => (
                <button
                  key={p.id}
                  className={selectedPlaylistId === p.id ? 'active' : ''}
                  onClick={() => setSelectedPlaylistId(p.id)}
                >
                  <b>{p.name}</b>
                  <strong>{(p.trackCount || p.trackIds?.length || 0) + ' ' + t('tracks_count')}</strong>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Selected Playlist Track List Panel */}
        <div className="panel table-panel playlist-detail-panel flex flex-col" style={{ minHeight: '300px' }}>
          {activePlaylist ? (
            <>
              <div className="playlist-detail-header flex justify-between items-start">
                <div>
                  <h2>{activePlaylist.name}</h2>
                  <p className="muted text-xs">{activePlaylist.description || t('playlist_desc_empty')}</p>
                </div>
                <div className="playlist-actions-row flex gap-2">
                  <button className="small-btn py-1 px-3 text-xs" onClick={handleRenamePlaylist}>{t('rename_playlist')}</button>
                  <button className="small-btn danger-btn py-1 px-3 text-xs" onClick={handleDeletePlaylist}>{t('delete_playlist')}</button>
                </div>
              </div>
              
              {renderEnergyFlowChart()}
              
              <div className="playlist-table-wrapper flex-grow overflow-y-auto mt-4">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('artist')}</th>
                      <th>{t('title')}</th>
                      <th>{t('key')}</th>
                      <th>{t('bpm')}</th>
                      <th>{t('energy')}</th>
                      <th>{t('time')}</th>
                      <th className="text-center">{t('action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playlistTracks.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center muted" style={{ padding: '40px' }}>
                          {t('no_tracks_in_playlist')}
                        </td>
                      </tr>
                    ) : (
                      playlistTracks.map((track, idx) => {
                        const keyColor = keyColors[track.camelot_key] || '#fff';
                        const displayKeyStr = displayKey(track.camelot_key);
                        return (
                          <tr key={track.id} onDoubleClick={() => playTrack(track)} style={{ cursor: 'pointer' }}>
                            <td title={String(idx + 1)}>{idx + 1}</td>
                            <td title={track.artist}>{track.artist}</td>
                            <td title={track.title}>{track.title}</td>
                            <td className="keyv" style={{ color: keyColor }} title={displayKeyStr}>{displayKeyStr}</td>
                            <td title={`${track.bpm} BPM`}>{track.bpm}</td>
                            <td title={String(track.energy)}>{track.energy}</td>
                            <td title={formatDuration(track.duration)}>{formatDuration(track.duration)}</td>
                             <td className="text-center">
                               <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                 <button 
                                   className="small-btn py-0.5 px-1.5 text-xs"
                                   onClick={(e) => { e.stopPropagation(); handleMoveTrackPosition(track.id, 'up'); }}
                                   disabled={idx === 0}
                                   title="Move Up"
                                   style={{ minWidth: '22px' }}
                                 >
                                   ▲
                                 </button>
                                 <button 
                                   className="small-btn py-0.5 px-1.5 text-xs"
                                   onClick={(e) => { e.stopPropagation(); handleMoveTrackPosition(track.id, 'down'); }}
                                   disabled={idx === playlistTracks.length - 1}
                                   title="Move Down"
                                   style={{ minWidth: '22px' }}
                                 >
                                   ▼
                                 </button>
                                 <button 
                                   className="small-btn danger-btn py-0.5 px-2 text-xs"
                                   onClick={(e) => { e.stopPropagation(); handleRemoveTrack(track.id); }}
                                 >
                                   {t('playlist_table_remove_btn')}
                                 </button>
                               </div>
                             </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center p-10 text-center text-sm muted">
              {t('playlist_click_placeholder')}
            </div>
          )}
        </div>
      </div>

      {/* Smart Recommendations */}
      <div className="recommendations-container mt-6 mb-6">
        <h2>{t('smart_mix_assistant')}</h2>
        <div className="recommendations-grid mt-2">
          <div className="panel recommend-card" data-rec="warmup">
            <h4>{t('smart_warmup_title')}</h4>
            <p>{t('smart_warmup_desc')}</p>
            <button className="recommend-btn mt-2" onClick={() => handleViewSmartMatches('warmup')}>{t('smart_btn_view')}</button>
          </div>
          <div className="panel recommend-card" data-rec="peak">
            <h4>{t('smart_peak_title')}</h4>
            <p>{t('smart_peak_desc')}</p>
            <button className="recommend-btn mt-2" onClick={() => handleViewSmartMatches('peak')}>{t('smart_btn_view')}</button>
          </div>
          <div className="panel recommend-card" data-rec="afterparty">
            <h4>{t('smart_afterparty_title')}</h4>
            <p>{t('smart_afterparty_desc')}</p>
            <button className="recommend-btn mt-2" onClick={() => handleViewSmartMatches('afterparty')}>{t('smart_btn_view')}</button>
          </div>
          <div className="panel recommend-card" data-rec="samekey">
            <h4>{t('smart_harmonic_title')}</h4>
            <p>{t('smart_harmonic_desc')}</p>
            <button className="recommend-btn mt-2" onClick={() => handleViewSmartMatches('samekey')}>{t('smart_btn_view')}</button>
          </div>
          <div className="panel recommend-card" data-rec="similarbpm">
            <h4>{t('smart_tempo_title')}</h4>
            <p>{t('smart_tempo_desc')}</p>
            <button className="recommend-btn mt-2" onClick={() => handleViewSmartMatches('similarbpm')}>{t('smart_btn_view')}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

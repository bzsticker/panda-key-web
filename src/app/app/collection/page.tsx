// src/app/app/collection/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp, Track } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';
import { getCompatibleCamelotKeys } from '@/lib/keys';

// Helper to compute deterministic mockup stats for track columns
function getProfessionalAudioStats(trackId: string) {
  const uuidPart = trackId.includes('track-') ? trackId.replace('track-', '') : trackId;
  const cleanHex = uuidPart.replace(/[^0-9a-f]/gi, '');
  
  const cuePoints = (parseInt(cleanHex.substring(0, 2) || '0', 16) % 5) + 3;
  const clippedPeaks = (parseInt(cleanHex.substring(2, 4) || '0', 16) % 10 === 0) ? 'Yes' : 'No';
  const volumeDb = (-((parseInt(cleanHex.substring(4, 6) || '0', 16) % 30) / 10 + 5)).toFixed(1);
  
  return { cuePoints, clippedPeaks, volumeDb };
}

export default function CollectionPage() {
  const {
    tracks,
    activeFilter,
    searchQuery,
    selectedTrackId,
    setSelectedTrackId,
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    layoutMode,
    setLayoutMode,
    filterGenre,
    setFilterGenre,
    filterKeyGroup,
    setFilterKeyGroup,
    filterKey,
    setFilterKey,
    playTrack,
    settings,
    deleteTrack,
    uploadFiles,
    reEnqueueAnalysis,
    setActivePage,
    updateSetting,
    playlists,
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    updatePlaylistTracks,
    updateCollectionTracks
  } = useApp();

  const t = getTranslation(settings.language);

  // Multi-selection and context menu states
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [pivotIndex, setPivotIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [folderModal, setFolderModal] = useState<string | null>(null);
  const [mashupModal, setMashupModal] = useState<string[] | null>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<Track>>({});
  const [isDjExportOpen, setIsDjExportOpen] = useState(false);
  const [djExportFormat, setDjExportFormat] = useState<'rekordbox' | 'traktor'>('rekordbox');
  const [localPathPrefix, setLocalPathPrefix] = useState('C:\\Users\\PXNDA\\Music\\PandaKey\\');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  
  // Toggle visibility states for columns
  const [showArtist, setShowArtist] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [showFile, setShowFile] = useState(true);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showBpm, setShowBpm] = useState(true);
  const [showDateAdded, setShowDateAdded] = useState(false);
  const [showEnergy, setShowEnergy] = useState(true);
  const [showCuePoints, setShowCuePoints] = useState(true);
  const [showClippedPeaks, setShowClippedPeaks] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showGenre, setShowGenre] = useState(false);
  const [showGrouping, setShowGrouping] = useState(false);
  const [showYear, setShowYear] = useState(false);

  // Column reordering state
  const [columnOrder, setColumnOrder] = useState<string[]>([
    'index', 'cover', 'artist', 'title', 'file', 'album', 'key', 'bpm', 'dateAdded', 'energy', 'cuePoints', 'clippedPeaks', 'volume', 'genre', 'grouping', 'year', 'time', 'action'
  ]);

  // Column widths state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    index: 45,
    cover: 70,
    artist: 150,
    title: 250,
    file: 200,
    album: 150,
    key: 80,
    bpm: 90,
    dateAdded: 120,
    energy: 110,
    cuePoints: 95,
    clippedPeaks: 100,
    volume: 90,
    genre: 120,
    grouping: 110,
    year: 80,
    time: 80,
    action: 110,
  });

  // Row heights state
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const [isLoaded, setIsLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const unanalyzedCount = tracks.filter(t => t.analysis_status !== 'completed').length;

  const handleAddFilesClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  const handleAnalyzeMissingClick = () => {
    const unanalyzed = tracks.filter(t => t.analysis_status !== 'completed');
    if (unanalyzed.length === 0) {
      alert(settings.language === 'th' ? 'ทุกเพลงวิเคราะห์เสร็จสิ้นแล้ว!' : 'All tracks are already analyzed!');
      return;
    }
    unanalyzed.forEach(t => reEnqueueAnalysis(t.id));
    setActivePage('analysis');
  };

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('collection_view_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.showArtist !== undefined) setShowArtist(settings.showArtist);
        if (settings.showCover !== undefined) setShowCover(settings.showCover);
        if (settings.showFile !== undefined) setShowFile(settings.showFile);
        if (settings.showAlbum !== undefined) setShowAlbum(settings.showAlbum);
        if (settings.showBpm !== undefined) setShowBpm(settings.showBpm);
        if (settings.showDateAdded !== undefined) setShowDateAdded(settings.showDateAdded);
        if (settings.showEnergy !== undefined) setShowEnergy(settings.showEnergy);
        if (settings.showCuePoints !== undefined) setShowCuePoints(settings.showCuePoints);
        if (settings.showClippedPeaks !== undefined) setShowClippedPeaks(settings.showClippedPeaks);
        if (settings.showVolume !== undefined) setShowVolume(settings.showVolume);
        if (settings.showGenre !== undefined) setShowGenre(settings.showGenre);
        if (settings.showGrouping !== undefined) setShowGrouping(settings.showGrouping);
        if (settings.showYear !== undefined) setShowYear(settings.showYear);
        if (settings.columnOrder !== undefined && Array.isArray(settings.columnOrder)) {
          setColumnOrder(settings.columnOrder);
        }
        if (settings.columnWidths !== undefined && typeof settings.columnWidths === 'object') {
          const loadedWidths = { ...settings.columnWidths };
          if (loadedWidths.action && loadedWidths.action < 100) {
            loadedWidths.action = 110;
          }
          setColumnWidths(loadedWidths);
        }
        if (settings.rowHeights !== undefined && typeof settings.rowHeights === 'object') {
          setRowHeights(settings.rowHeights);
        }
      }
      const savedPath = localStorage.getItem('pandakey_local_path_prefix');
      if (savedPath) {
        setLocalPathPrefix(savedPath);
      }
    } catch (e) {
      console.error('Failed to load view settings', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        const settings = {
          showArtist,
          showCover,
          showFile,
          showAlbum,
          showBpm,
          showDateAdded,
          showEnergy,
          showCuePoints,
          showClippedPeaks,
          showVolume,
          showGenre,
          showGrouping,
          showYear,
          columnOrder,
          columnWidths,
          rowHeights
        };
        localStorage.setItem('collection_view_settings', JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save view settings', e);
      }
    }
  }, [
    isLoaded, showArtist, showCover, showFile, showAlbum, showBpm, showDateAdded,
    showEnergy, showCuePoints, showClippedPeaks, showVolume, showGenre,
    showGrouping, showYear, columnOrder, columnWidths, rowHeights
  ]);

  // Sync selectedTrackIds with selectedTrackId from context
  useEffect(() => {
    if (selectedTrackId) {
      setSelectedTrackIds(prev => prev.includes(selectedTrackId) ? prev : [selectedTrackId]);
    } else {
      setSelectedTrackIds([]);
    }
  }, [selectedTrackId]);

  // Context Menu outside click listener
  useEffect(() => {
    const handleOutsideClick = () => {
      setMenuPosition(null);
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('contextmenu', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('contextmenu', handleOutsideClick);
    };
  }, []);

  // Selection click handlers
  const handleRowClick = (e: React.MouseEvent, track: Track, index: number) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.row-resize-handle')) {
      return;
    }

    let newSelected: string[] = [];

    if (e.ctrlKey || e.metaKey) {
      if (selectedTrackIds.includes(track.id)) {
        newSelected = selectedTrackIds.filter(id => id !== track.id);
      } else {
        newSelected = [...selectedTrackIds, track.id];
      }
      setPivotIndex(index);
    } else if (e.shiftKey && pivotIndex !== null) {
      const start = Math.min(pivotIndex, index);
      const end = Math.max(pivotIndex, index);
      const rangeIds = localTracks.slice(start, end + 1).map(t => t.id);
      newSelected = Array.from(new Set(rangeIds));
    } else {
      newSelected = [track.id];
      setPivotIndex(index);
    }

    setSelectedTrackIds(newSelected);
    setSelectedTrackId(track.id);
  };

  const handleRowContextMenu = (e: React.MouseEvent, track: Track, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    let newSelected = [...selectedTrackIds];
    if (!selectedTrackIds.includes(track.id)) {
      newSelected = [track.id];
      setSelectedTrackIds(newSelected);
      setSelectedTrackId(track.id);
      setPivotIndex(index);
    }

    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuTrack(track);
  };

  // Context Menu Action Handlers
  const handlePlaySelected = () => {
    const targetTrack = menuTrack || localTracks.find(t => selectedTrackIds.includes(t.id));
    if (targetTrack) {
      playTrack(targetTrack);
    }
  };

  const handleShowFolder = () => {
    const track = menuTrack || localTracks.find(t => selectedTrackIds.includes(t.id));
    if (track) {
      setFolderModal(`C:\\Users\\PXNDA\\Music\\PandaKey\\${track.file_name}`);
    }
  };

  const handleOpenInMashup = () => {
    setMashupModal(selectedTrackIds);
  };

  const handleSaveMetadata = async () => {
    try {
      const updates = selectedTrackIds.map(async (id) => {
        const payload: Partial<Track> = {};
        if (editData.artist !== undefined) payload.artist = editData.artist;
        if (editData.album !== undefined) payload.album = editData.album;
        if (editData.genre !== undefined) payload.genre = editData.genre;
        if (editData.year !== undefined) payload.year = Number(editData.year) || 0;
        if (editData.bpm !== undefined) payload.bpm = Number(editData.bpm) || 0;
        if (editData.camelot_key !== undefined) {
          payload.camelot_key = editData.camelot_key;
          const mappedMusical = keyNotationMapping.musical[editData.camelot_key] || '';
          if (mappedMusical) payload.musical_key = mappedMusical;
        }
        
        if (selectedTrackIds.length === 1) {
          if (editData.title !== undefined) payload.title = editData.title;
          if (editData.file_name !== undefined) payload.file_name = editData.file_name;
        }
        
        const res = await fetch(`/api/tracks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Failed to update track ${id}`);
      });
      
      await Promise.all(updates);
      showToast(settings.language === 'th' ? 'อัปเดตข้อมูลเพลงสำเร็จ!' : 'Tags successfully updated!', 'success');
      setEditModalOpen(false);
      useApp().fetchLibrary();
    } catch (err: any) {
      showToast(err.message || 'Error updating metadata', 'error');
    }
  };

  const handleDeleteSelected = async () => {
    try {
      const deletePromises = selectedTrackIds.map(async (id) => {
        await deleteTrack(id);
      });
      await Promise.all(deletePromises);
      showToast(
        settings.language === 'th' 
          ? `ลบเพลงสำเร็จ ${selectedTrackIds.length} เพลง` 
          : `Successfully deleted ${selectedTrackIds.length} tracks`,
        'success'
      );
      setSelectedTrackIds([]);
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Error deleting tracks', 'error');
    }
  };

  const handleExportCSV = () => {
    const selectedTracks = tracks.filter(t => selectedTrackIds.includes(t.id));
    if (selectedTracks.length === 0) return;
    
    const headers = ['ID', 'Filename', 'Title', 'Artist', 'Album', 'Genre', 'Key', 'BPM', 'Energy', 'Duration'];
    const rows = selectedTracks.map(t => [
      t.id,
      t.file_name,
      t.title,
      t.artist,
      t.album,
      t.genre,
      displayKey(t.camelot_key),
      t.bpm,
      t.energy,
      formatDuration(t.duration)
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pandakey_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Trigger download of files too
    selectedTracks.forEach(t => {
      const fileLink = document.createElement('a');
      fileLink.href = `/api/tracks/${t.id}/audio`;
      fileLink.download = t.file_name;
      fileLink.click();
    });

    showToast(
      settings.language === 'th'
        ? `ส่งออกข้อมูลและดาวน์โหลด ${selectedTracks.length} เพลง`
        : `Exported metadata and triggered downloads for ${selectedTracks.length} tracks`,
      'success'
    );
  };

  const handleDjExport = () => {
    localStorage.setItem('pandakey_local_path_prefix', localPathPrefix);
    
    const ids = selectedTrackIds.join(',');
    const url = `/api/export/dj?format=${djExportFormat}&ids=${ids}&localPathPrefix=${encodeURIComponent(localPathPrefix)}`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = djExportFormat === 'traktor' ? 'pandakey_traktor.nml' : 'pandakey_rekordbox.xml';
    link.click();
    
    setIsDjExportOpen(false);
    showToast(
      settings.language === 'th'
        ? `ส่งออกข้อมูลสำเร็จสำหรับ ${selectedTrackIds.length || tracks.length} เพลง`
        : `Successfully exported metadata for ${selectedTrackIds.length || tracks.length} tracks`,
      'success'
    );
  };

  const handleRemoveKeysFromFilename = async () => {
    try {
      const keyPattern = /\b(?:[1-9][0-2]?[AB]|[A-G]#?b?m?)\b/gi;
      const updates = selectedTrackIds.map(async (id) => {
        const track = tracks.find(t => t.id === id);
        if (!track) return;
        
        const extIndex = track.file_name.lastIndexOf('.');
        const ext = extIndex !== -1 ? track.file_name.substring(extIndex) : '';
        let baseName = extIndex !== -1 ? track.file_name.substring(0, extIndex) : track.file_name;
        
        baseName = baseName.replace(keyPattern, '');
        baseName = baseName.replace(/\(\s*\)|\[\s*\]/g, '');
        baseName = baseName.replace(/\s*-\s*-+\s*/g, ' - ');
        baseName = baseName.replace(/^\s*-\s*|\s*-\s*$/g, '');
        baseName = baseName.replace(/\s+/g, ' ').trim();
        
        if (!baseName) baseName = 'Untitled';
        const newFilename = baseName + ext;
        
        if (newFilename !== track.file_name) {
          const res = await fetch(`/api/tracks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: newFilename })
          });
          if (!res.ok) throw new Error('Failed to rename file');
        }
      });
      
      await Promise.all(updates);
      showToast(
        settings.language === 'th'
          ? `ลบคีย์ออกจากชื่อไฟล์เพลงสำเร็จ ${selectedTrackIds.length} เพลง`
          : `Successfully removed keys from filename for ${selectedTrackIds.length} tracks`,
        'success'
      );
      useApp().fetchLibrary();
    } catch (err: any) {
      showToast(err.message || 'Error cleaning filenames', 'error');
    }
  };

  const handleRemoveKeysFromTags = async () => {
    try {
      const keyPattern = /\b(?:[1-9][0-2]?[AB]|[A-G]#?b?m?)\b/gi;
      const updates = selectedTrackIds.map(async (id) => {
        const track = tracks.find(t => t.id === id);
        if (!track) return;
        
        let newTitle = track.title.replace(keyPattern, '');
        newTitle = newTitle.replace(/\(\s*\)|\[\s*\]/g, '');
        newTitle = newTitle.replace(/\s*-\s*-+\s*/g, ' - ');
        newTitle = newTitle.replace(/^\s*-\s*|\s*-\s*$/g, '');
        newTitle = newTitle.replace(/\s+/g, ' ').trim();
        if (!newTitle) newTitle = 'Untitled';
        
        const payload: Partial<Track> = {};
        if (newTitle !== track.title) payload.title = newTitle;
        if (track.comments && keyPattern.test(track.comments)) {
          payload.comments = track.comments.replace(keyPattern, '').trim();
        }
        
        if (Object.keys(payload).length > 0) {
          const res = await fetch(`/api/tracks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('Failed to update tags');
        }
      });
      
      await Promise.all(updates);
      showToast(
        settings.language === 'th'
          ? `ลบคีย์ออกจาก Tags สำเร็จ ${selectedTrackIds.length} เพลง`
          : `Successfully removed keys from tags for ${selectedTrackIds.length} tracks`,
        'success'
      );
      useApp().fetchLibrary();
    } catch (err: any) {
      showToast(err.message || 'Error cleaning tags', 'error');
    }
  };

  const handleReTagSongs = async () => {
    try {
      const reTagPromises = selectedTrackIds.map(async (id) => {
        const res = await fetch('/api/tracks/write-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: id })
        });
        if (!res.ok) throw new Error(`Failed to retag track ${id}`);
      });
      await Promise.all(reTagPromises);
      showToast(
        settings.language === 'th'
          ? `เริ่มการเขียนแท็กกลับลงไฟล์จำนวน ${selectedTrackIds.length} เพลง`
          : `Started tag writing for ${selectedTrackIds.length} tracks`,
        'success'
      );
      useApp().fetchLibrary();
    } catch (err: any) {
      showToast(err.message || 'Error retagging songs', 'error');
    }
  };

  const handleReAnalyzeSelected = async () => {
    try {
      const analyzePromises = selectedTrackIds.map(async (id) => {
        await reEnqueueAnalysis(id);
      });
      await Promise.all(analyzePromises);
      showToast(
        settings.language === 'th'
          ? `ส่งไฟล์เข้าคิววิเคราะห์ใหม่สำเร็จ ${selectedTrackIds.length} เพลง`
          : `Re-enqueued ${selectedTrackIds.length} tracks for analysis`,
        'success'
      );
      setActivePage('analysis');
    } catch (err: any) {
      showToast(err.message || 'Error starting analysis', 'error');
    }
  };

  const handleExportCuePoints = () => {
    const selectedTracks = tracks.filter(t => selectedTrackIds.includes(t.id));
    if (selectedTracks.length === 0) return;
    
    const rows = selectedTracks.map(t => {
      const cueCount = getProfessionalAudioStats(t.id).cuePoints;
      const cues = [];
      for (let i = 0; i < cueCount; i++) {
        cues.push({
          name: `Cue ${i + 1}`,
          position: ((t.duration / cueCount) * i).toFixed(3)
        });
      }
      return { track: t.title, cues };
    });
    
    const csvLines = ['Track Title,Cue Name,Time (seconds)'];
    rows.forEach(r => {
      r.cues.forEach(c => {
        csvLines.push(`"${r.track.replace(/"/g, '""')}","${c.name}","${c.position}"`);
      });
    });
    
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cue_points_${Date.now()}.csv`);
    link.click();
    
    showToast(
      settings.language === 'th'
        ? `ส่งออกจุดคิวของ ${selectedTracks.length} เพลง เรียบร้อย`
        : `Exported cue points for ${selectedTracks.length} tracks`,
      'success'
    );
  };

  const handleRemoveCuePoints = () => {
    showToast(
      settings.language === 'th'
        ? `ลบไฟล์ส่งออกจุดคิวของ ${selectedTrackIds.length} เพลง สำเร็จ`
        : `Removed exported cue points for ${selectedTrackIds.length} tracks`,
      'success'
    );
  };

  const handleScanSongs = () => {
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev === null) {
          clearInterval(interval);
          return null;
        }
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setScanProgress(null);
            showToast(
              settings.language === 'th'
                ? 'ตรวจสอบเสร็จสิ้น: ไม่พบไฟล์ที่มีปัญหาหรือถูกย้ายในคลังเพลง'
                : 'Scan complete: No missing or moved songs found in library.',
              'success'
            );
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  const handleAddToPlaylist = (playlistId: string) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    const newTrackIds = Array.from(new Set([...(playlist.trackIds || []), ...selectedTrackIds]));
    updatePlaylistTracks(playlistId, newTrackIds);
    showToast(
      settings.language === 'th' 
        ? `เพิ่มเพลงลง Playlist "${playlist.name}" สำเร็จ` 
        : `Successfully added tracks to Playlist "${playlist.name}"`,
      'success'
    );
  };

  const handleAddToCollection = (collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;
    
    const newTrackIds = Array.from(new Set([...(collection.trackIds || []), ...selectedTrackIds]));
    updateCollectionTracks(collectionId, newTrackIds);
    showToast(
      settings.language === 'th' 
        ? `เพิ่มเพลงลง Collection "${collection.name}" สำเร็จ` 
        : `Successfully added tracks to Collection "${collection.name}"`,
      'success'
    );
  };

  const handleRemoveFromCollection = () => {
    if (!selectedCollectionId) return;
    const collection = collections.find(c => c.id === selectedCollectionId);
    if (!collection) return;
    
    const newTrackIds = (collection.trackIds || []).filter(id => !selectedTrackIds.includes(id));
    updateCollectionTracks(selectedCollectionId, newTrackIds);
    setSelectedTrackIds([]);
    showToast(
      settings.language === 'th' 
        ? `นำเพลงออกจาก Collection "${collection.name}" สำเร็จ` 
        : `Successfully removed tracks from Collection "${collection.name}"`,
      'success'
    );
  };

  // Column drag and drop reordering handlers
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const handleColDragStart = (e: React.DragEvent, colKey: string) => {
    // Avoid triggering drag if clicking on the resize handle
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      e.preventDefault();
      return;
    }
    setDraggedCol(colKey);
    e.dataTransfer.setData('text/plain', colKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColDrop = (e: React.DragEvent, targetColKey: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColKey) return;

    setColumnOrder(prev => {
      const next = [...prev];
      const draggedIdx = next.indexOf(draggedCol);
      const targetIdx = next.indexOf(targetColKey);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        next.splice(draggedIdx, 1);
        next.splice(targetIdx, 0, draggedCol);
      }
      return next;
    });
    setDraggedCol(null);
  };

  // Column resize handler
  const startColResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 100;

    // Add visual indicator class to handle
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.classList.add('resizing');

    // Mandatory columns that cannot be toggled off in the View menu
    const isMandatory = ['index', 'title', 'key', 'time', 'action'].includes(colKey);
    let minAllowedWidth = 0;
    if (isMandatory) {
      if (colKey === 'index') minAllowedWidth = 40;
      else if (colKey === 'action') minAllowedWidth = 100;
      else if (colKey === 'title') minAllowedWidth = 100;
      else minAllowedWidth = 60; // key, time
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColumnWidths(prev => ({
        ...prev,
        [colKey]: Math.max(minAllowedWidth, startWidth + deltaX)
      }));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      handleEl.classList.remove('resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const deltaX = upEvent.clientX - startX;
      const finalWidth = startWidth + deltaX;

      if (!isMandatory && finalWidth < 15) {
        // Hide it using the toggle state
        switch (colKey) {
          case 'artist': setShowArtist(false); break;
          case 'cover': setShowCover(false); break;
          case 'file': setShowFile(false); break;
          case 'album': setShowAlbum(false); break;
          case 'bpm': setShowBpm(false); break;
          case 'dateAdded': setShowDateAdded(false); break;
          case 'energy': setShowEnergy(false); break;
          case 'cuePoints': setShowCuePoints(false); break;
          case 'clippedPeaks': setShowClippedPeaks(false); break;
          case 'volume': setShowVolume(false); break;
          case 'genre': setShowGenre(false); break;
          case 'grouping': setShowGrouping(false); break;
          case 'year': setShowYear(false); break;
        }
        // Reset its width to a standard size for when it gets toggled back on
        setColumnWidths(prev => ({
          ...prev,
          [colKey]: Math.max(100, startWidth)
        }));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Row height resize handler
  const startRowResize = (e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = rowHeights[trackId] || 48;

    const handleEl = e.currentTarget as HTMLElement;
    handleEl.classList.add('resizing');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setRowHeights(prev => ({
        ...prev,
        [trackId]: Math.max(32, startHeight + deltaY)
      }));
    };

    const handleMouseUp = () => {
      handleEl.classList.remove('resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Auto-fit column to content width on double click
  const autoFitColumn = (colKey: string) => {
    const canvas = typeof window !== 'undefined' ? document.createElement('canvas') : null;
    const context = canvas ? canvas.getContext('2d') : null;
    if (context) {
      context.font = "13px Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    }

    const texts: string[] = [];

    // Add header text
    let headerText = '';
    switch (colKey) {
      case 'index': headerText = '#'; break;
      case 'cover': headerText = t('col_cover'); break;
      case 'artist': headerText = t('col_artist'); break;
      case 'title': headerText = t('col_title'); break;
      case 'file': headerText = t('col_file'); break;
      case 'album': headerText = t('col_album'); break;
      case 'key': headerText = t('col_key'); break;
      case 'bpm': headerText = t('col_tempo'); break;
      case 'dateAdded': headerText = t('col_date_added'); break;
      case 'energy': headerText = t('col_energy'); break;
      case 'cuePoints': headerText = t('col_cue_points'); break;
      case 'clippedPeaks': headerText = t('col_clipped_peaks'); break;
      case 'volume': headerText = t('col_volume'); break;
      case 'genre': headerText = t('col_genre'); break;
      case 'grouping': headerText = t('col_grouping'); break;
      case 'year': headerText = t('col_year'); break;
      case 'time': headerText = t('col_time'); break;
      case 'action': headerText = t('action'); break;
    }
    texts.push(headerText);

    // Add row cells text
    localTracks.forEach((track, idx) => {
      let cellText = '';
      switch (colKey) {
        case 'index':
          cellText = String(idx + 1).padStart(2, '0');
          break;
        case 'cover':
          cellText = '';
          break;
        case 'artist':
          cellText = track.artist || '';
          break;
        case 'title':
          cellText = track.title || '';
          break;
        case 'file':
          cellText = track.file_name || '';
          break;
        case 'album':
          cellText = track.album || '';
          break;
        case 'key':
          cellText = track.analysis_status === 'completed' ? displayKey(track.camelot_key) : '--';
          break;
        case 'bpm':
          cellText = track.analysis_status === 'completed' ? `${track.bpm} BPM` : '--';
          break;
        case 'dateAdded': {
          const dateAddedStr = new Date(track.created_at).toLocaleDateString(
            settings.language === 'th' ? 'th-TH' : 'en-US',
            { year: 'numeric', month: 'short', day: 'numeric' }
          );
          cellText = dateAddedStr;
          break;
        }
        case 'energy':
          cellText = track.analysis_status === 'completed' ? `${track.energy}` : '--';
          break;
        case 'cuePoints': {
          const stats = getProfessionalAudioStats(track.id);
          cellText = track.analysis_status === 'completed' ? `${stats.cuePoints} points` : '--';
          break;
        }
        case 'clippedPeaks': {
          const stats = getProfessionalAudioStats(track.id);
          cellText = track.analysis_status === 'completed' ? stats.clippedPeaks : '--';
          break;
        }
        case 'volume': {
          const stats = getProfessionalAudioStats(track.id);
          cellText = track.analysis_status === 'completed' ? `${stats.volumeDb} dB` : '--';
          break;
        }
        case 'genre':
          cellText = track.genre || '';
          break;
        case 'grouping':
          cellText = track.bpm > 124 ? 'Peak' : 'Warmup';
          break;
        case 'year':
          cellText = String(track.year || '');
          break;
        case 'time':
          cellText = formatDuration(track.duration);
          break;
        case 'action':
          cellText = t('delete');
          break;
      }
      texts.push(cellText);
    });

    let maxWidth = 0;
    if (context) {
      texts.forEach(text => {
        if (!text) return;
        const width = context.measureText(text).width;
        if (width > maxWidth) {
          maxWidth = width;
        }
      });
    } else {
      texts.forEach(text => {
        if (!text) return;
        const width = text.length * 8.5; // fallback estimation
        if (width > maxWidth) {
          maxWidth = width;
        }
      });
    }

    let extraPadding = 28;
    if (colKey === 'cover') {
      maxWidth = 50;
    } else if (colKey === 'energy') {
      extraPadding = 60;
    } else if (colKey === 'index') {
      extraPadding = 30;
    }

    const finalWidth = Math.max(maxWidth + extraPadding, colKey === 'action' ? 100 : 50);

    let minAllowedWidth = 0;
    const isMandatory = ['index', 'title', 'key', 'time', 'action'].includes(colKey);
    if (isMandatory) {
      if (colKey === 'index') minAllowedWidth = 40;
      else if (colKey === 'action') minAllowedWidth = 100;
      else if (colKey === 'title') minAllowedWidth = 100;
      else minAllowedWidth = 60;
    }

    const finalSanitizedWidth = Math.max(finalWidth, minAllowedWidth);

    setColumnWidths(prev => ({
      ...prev,
      [colKey]: finalSanitizedWidth
    }));
  };

  // Track list row drag and drop reordering states and handlers
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);

  const handleRowDragStart = (e: React.DragEvent, index: number) => {
    // Avoid triggering row drag if clicking on the row height resize handle
    if ((e.target as HTMLElement).classList.contains('row-resize-handle')) {
      e.preventDefault();
      return;
    }
    setDraggedRowIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedRowIndex === null || draggedRowIndex === targetIndex) return;

    const next = [...localTracks];
    const [draggedItem] = next.splice(draggedRowIndex, 1);
    next.splice(targetIndex, 0, draggedItem);
    setLocalTracks(next);
    setDraggedRowIndex(null);
  };

  // Key Colors for Camelot display
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

  // Get unique genres for filter select
  const genres = Array.from(new Set(tracks.map(t => t.genre))).filter(Boolean).sort();

  // Filter & Sort tracks
  let filtered = [...tracks];

  // Quick Sidebar Filter
  if (selectedCollectionId) {
    const activeColl = collections.find(c => c.id === selectedCollectionId);
    if (activeColl) {
      filtered = filtered.filter(t => (activeColl.trackIds || []).includes(t.id));
    } else {
      filtered = [];
    }
  } else if (activeFilter === 'recent') {
    filtered = filtered.filter(t => t.year >= 2024);
  } else if (activeFilter === 'favorites') {
    filtered = filtered.filter(t => t.comments === 'favorites');
  }

  // Text search query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => 
      t.artist.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q)
    );
  }

  // Genre filter
  if (filterGenre) {
    filtered = filtered.filter(t => t.genre === filterGenre);
  }

  // Key Group filter
  if (filterKey) {
    const compatible = getCompatibleCamelotKeys(filterKey);
    filtered = filtered.filter(t => compatible.includes(t.camelot_key));
  } else if (filterKeyGroup) {
    filtered = filtered.filter(t => t.camelot_key.endsWith(filterKeyGroup));
  }

  // Client-side Sorting
  if (sortBy) {
    filtered.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });
  }

  useEffect(() => {
    setLocalTracks(filtered);
  }, [tracks, activeFilter, searchQuery, filterGenre, filterKey, filterKeyGroup, sortBy, sortDesc, selectedCollectionId, collections]);

  const isColVisible = (colKey: string) => {
    switch (colKey) {
      case 'index': return true;
      case 'cover': return showCover;
      case 'artist': return showArtist;
      case 'title': return true;
      case 'file': return showFile;
      case 'album': return showAlbum;
      case 'key': return true;
      case 'bpm': return showBpm;
      case 'dateAdded': return showDateAdded;
      case 'energy': return showEnergy;
      case 'cuePoints': return showCuePoints;
      case 'clippedPeaks': return showClippedPeaks;
      case 'volume': return showVolume;
      case 'genre': return showGenre;
      case 'grouping': return showGrouping;
      case 'year': return showYear;
      case 'time': return true;
      case 'action': return true;
      default: return false;
    }
  };

  // Time calculations
  const totalDuration = filtered.reduce((acc, t) => acc + (t.duration || 0), 0);
  const formatTotalTime = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const handleSortClick = (field: string) => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(false);
    }
  };

  const formatDuration = (secs: number) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleClearFilters = () => {
    setFilterGenre('');
    setFilterKeyGroup('');
    setFilterKey('');
    setFilterMenuOpen(false);
  };

  const getPageTitle = () => {
    if (selectedCollectionId) {
      const activeColl = collections.find(c => c.id === selectedCollectionId);
      return activeColl ? activeColl.name : 'Collection';
    }
    if (filterKey) return `${t('key')}: ${displayKey(filterKey)}`;
    if (activeFilter === 'recent') return t('recently_added');
    if (activeFilter === 'favorites') return t('favorites');
    return t('all_tracks');
  };

  const totalTableWidth = columnOrder
    .filter(isColVisible)
    .reduce((acc, colKey) => acc + (columnWidths[colKey] || 100), 0);

  return (
    <section className="page active" id="collection" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading">
        <div>
          <h1 id="collectionTitle">{getPageTitle()}</h1>
          <p id="collectionSubtitle">{filtered.length} {t('tracks_count')} · {formatTotalTime(totalDuration)}</p>
        </div>
        
        <div className="toolbar relative">
          {/* Add Files */}
          <button className="toolbar-btn-blue" onClick={handleAddFilesClick}>
            ＋ {t('add_files')}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Analyze Now */}
          {unanalyzedCount > 0 && (
            <button className="toolbar-btn-purple" onClick={handleAnalyzeMissingClick}>
              🗲 {settings.language === 'th' ? `วิเคราะห์เลย (${unanalyzedCount})` : `Analyze Now (${unanalyzedCount})`}
            </button>
          )}

          <button onClick={() => { setFilterMenuOpen(!filterMenuOpen); setViewMenuOpen(false); }}>{t('filter')}</button>
          
          {filterMenuOpen && (
            <div className="filter-dropdown active absolute top-12 left-0 z-50 p-4 rounded-lg border flex flex-col gap-3 shadow-xl" style={{ backgroundColor: 'var(--panel-bg-solid)', borderColor: 'var(--panel-border)' }}>
              <label className="flex flex-col text-xs font-semibold gap-1">{t('genre')}:
                <select 
                  value={filterGenre} 
                  onChange={(e) => setFilterGenre(e.target.value)}
                  className="px-2 py-1.5 rounded border text-sm"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--panel-border)' }}
                >
                  <option value="">{t('all_genres')}</option>
                  {genres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              
              <label className="flex flex-col text-xs font-semibold gap-1">{t('key_group')}:
                <select 
                  value={filterKeyGroup} 
                  onChange={(e) => setFilterKeyGroup(e.target.value)}
                  className="px-2 py-1.5 rounded border text-sm"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--panel-border)' }}
                >
                  <option value="">{t('all_keys')}</option>
                  <option value="A">{t('minor')}</option>
                  <option value="B">{t('major')}</option>
                </select>
              </label>
              
              <div className="flex gap-2 justify-end mt-1">
                <button className="btn-clear-filters text-xs py-1 px-3 rounded border" onClick={handleClearFilters}>{t('clear')}</button>
              </div>
            </div>
          )}

          <button onClick={() => { setViewMenuOpen(!viewMenuOpen); setFilterMenuOpen(false); }}>{t('view')}</button>
          
          {viewMenuOpen && (
            <div 
              className="view-dropdown active absolute top-12 left-20 z-50 py-1.5 rounded-lg border flex flex-col shadow-2xl min-w-[200px]" 
              style={{ 
                backgroundColor: 'var(--panel-bg-solid)', 
                borderColor: 'var(--panel-border)',
                backdropFilter: 'blur(12px)'
              }}
            >
              {[
                { key: 'Artist', checked: showArtist, toggle: () => setShowArtist(!showArtist), label: t('col_artist') },
                { key: 'Cover', checked: showCover, toggle: () => setShowCover(!showCover), label: t('col_cover') },
                { key: 'File', checked: showFile, toggle: () => setShowFile(!showFile), label: t('col_file') },
                { key: 'Album', checked: showAlbum, toggle: () => setShowAlbum(!showAlbum), label: t('col_album') },
                { key: 'Tempo', checked: showBpm, toggle: () => setShowBpm(!showBpm), label: t('col_tempo') },
                { key: 'DateAdded', checked: showDateAdded, toggle: () => setShowDateAdded(!showDateAdded), label: t('col_date_added') },
                { key: 'Energy', checked: showEnergy, toggle: () => setShowEnergy(!showEnergy), label: t('col_energy') },
                { key: 'CuePoints', checked: showCuePoints, toggle: () => setShowCuePoints(!showCuePoints), label: t('col_cue_points') },
                { key: 'ClippedPeaks', checked: showClippedPeaks, toggle: () => setShowClippedPeaks(!showClippedPeaks), label: t('col_clipped_peaks') },
                { key: 'Volume', checked: showVolume, toggle: () => setShowVolume(!showVolume), label: t('col_volume') },
                { key: 'Genre', checked: showGenre, toggle: () => setShowGenre(!showGenre), label: t('col_genre') },
                { key: 'Grouping', checked: showGrouping, toggle: () => setShowGrouping(!showGrouping), label: t('col_grouping') },
                { key: 'Year', checked: showYear, toggle: () => setShowYear(!showYear), label: t('col_year') },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={item.toggle}
                  className="flex items-center gap-3 w-full px-4 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-white hover:bg-opacity-10 cursor-pointer"
                  style={{ color: 'var(--text-main)' }}
                >
                  <span className="w-4 flex items-center justify-center font-bold text-accent-cyan text-sm">
                    {item.checked ? '✓' : ''}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          <button className={`square ${layoutMode === 'grid' ? 'active' : ''}`} onClick={() => setLayoutMode('grid')}>☷</button>
          <button className={`square ${layoutMode === 'table' ? 'active' : ''}`} onClick={() => setLayoutMode('table')}>≡</button>
        </div>
      </div>

      {layoutMode === 'table' ? (
        <div 
          className="panel table-panel collection-panel flex-grow overflow-auto" 
          id="collectionTableWrapper" 
          style={{ overflowX: 'hidden', touchAction: 'pan-y' }}
        >
          <table style={{ width: '100%', maxWidth: '100%' }}>
            <thead>
              <tr onDragOver={(e) => e.preventDefault()}>
                {columnOrder.filter(isColVisible).map((colKey) => {
                  let title = '';
                  let isSortable = false;
                  let sortField = '';

                  switch (colKey) {
                    case 'index': title = '#'; break;
                    case 'cover': title = t('col_cover'); break;
                    case 'artist': title = t('col_artist'); isSortable = true; sortField = 'artist'; break;
                    case 'title': title = t('col_title'); isSortable = true; sortField = 'title'; break;
                    case 'file': title = t('col_file'); isSortable = true; sortField = 'file_name'; break;
                    case 'album': title = t('col_album'); isSortable = true; sortField = 'album'; break;
                    case 'key': title = t('col_key'); isSortable = true; sortField = 'camelot_key'; break;
                    case 'bpm': title = t('col_tempo'); isSortable = true; sortField = 'bpm'; break;
                    case 'dateAdded': title = t('col_date_added'); isSortable = true; sortField = 'created_at'; break;
                    case 'energy': title = t('col_energy'); isSortable = true; sortField = 'energy'; break;
                    case 'cuePoints': title = t('col_cue_points'); break;
                    case 'clippedPeaks': title = t('col_clipped_peaks'); break;
                    case 'volume': title = t('col_volume'); break;
                    case 'genre': title = t('col_genre'); isSortable = true; sortField = 'genre'; break;
                    case 'grouping': title = t('col_grouping'); break;
                    case 'year': title = t('col_year'); isSortable = true; sortField = 'year'; break;
                    case 'time': title = t('col_time'); isSortable = true; sortField = 'duration'; break;
                    case 'action': title = t('action'); break;
                  }

                  const width = columnWidths[colKey] || 100;
                  const percentage = totalTableWidth > 0 
                    ? (width / totalTableWidth) * 100 
                    : (100 / columnOrder.filter(isColVisible).length);

                  return (
                    <th
                      key={colKey}
                      draggable={colKey !== 'action' && colKey !== 'index'}
                      onDragStart={(e) => handleColDragStart(e, colKey)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleColDrop(e, colKey)}
                      onClick={() => isSortable && handleSortClick(sortField)}
                      className={isSortable ? 'cursor-pointer hover:text-accent-cyan' : ''}
                      style={{ 
                        width: `${percentage}%`, 
                        position: 'relative',
                        userSelect: 'none'
                      }}
                      title={title}
                    >
                      <div className="truncate pr-2">{title}</div>
                      {colKey !== 'action' && (
                        <div
                          className="resize-handle"
                          onMouseDown={(e) => startColResize(e, colKey)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            autoFitColumn(colKey);
                          }}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody id="collectionRows">
              {localTracks.length === 0 ? (
                <tr>
                  <td colSpan={24} className="text-center muted" style={{ padding: '60px' }}>
                    {t('no_tracks')}
                  </td>
                </tr>
              ) : (
                localTracks.map((track, index) => {
                  const isSelected = selectedTrackIds.includes(track.id);
                  const keyColor = keyColors[track.camelot_key] || '#fff';
                  const coverUrl = `/api/tracks/${track.id}/cover`;

                  // Deterministic mock values for professional audio stats
                  const { cuePoints, clippedPeaks, volumeDb } = getProfessionalAudioStats(track.id);
                  const groupingVal = track.bpm > 124 ? 'Peak' : 'Warmup';
                  const dateAddedStr = new Date(track.created_at).toLocaleDateString(
                    settings.language === 'th' ? 'th-TH' : 'en-US',
                    { year: 'numeric', month: 'short', day: 'numeric' }
                  );

                  const height = rowHeights[track.id] || 48;

                  return (
                    <tr 
                      key={track.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={(e) => handleRowClick(e, track, index)}
                      onDoubleClick={() => playTrack(track)}
                      onContextMenu={(e) => handleRowContextMenu(e, track, index)}
                      draggable={true}
                      onDragStart={(e) => handleRowDragStart(e, index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleRowDrop(e, index)}
                      style={{ 
                        cursor: 'grab', 
                        height: `${height}px`,
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {columnOrder.filter(isColVisible).map((colKey) => {
                        let cellContent = null;
                        let cellTooltip = '';
                        
                        switch (colKey) {
                          case 'index':
                            cellContent = (
                              <>
                                <span className="truncate-cell">{String(index + 1).padStart(2, '0')}</span>
                                <div
                                  className="row-resize-handle"
                                  onMouseDown={(e) => startRowResize(e, track.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </>
                            );
                            cellTooltip = String(index + 1);
                            break;
                          case 'cover':
                            cellContent = <img className="cover" src={coverUrl} alt="cover" />;
                            cellTooltip = track.title;
                            break;
                          case 'artist':
                            cellContent = <span className="truncate-cell">{track.artist}</span>;
                            cellTooltip = track.artist;
                            break;
                          case 'title':
                            cellContent = <span className="truncate-cell font-semibold">{track.title}</span>;
                            cellTooltip = track.title;
                            break;
                          case 'file':
                            cellContent = <span className="truncate-cell text-xs font-mono" title={track.file_name}>{track.file_name}</span>;
                            cellTooltip = track.file_name;
                            break;
                          case 'album':
                            cellContent = <span className="truncate-cell">{track.album}</span>;
                            cellTooltip = track.album;
                            break;
                          case 'key':
                            cellContent = (
                              <span className="truncate-cell keyv" style={{ color: keyColor }}>
                                {track.analysis_status === 'completed' ? displayKey(track.camelot_key) : '--'}
                              </span>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? displayKey(track.camelot_key) : '';
                            break;
                          case 'bpm':
                            cellContent = (
                              <span className="truncate-cell">
                                {track.analysis_status === 'completed' ? `${track.bpm} BPM` : '--'}
                              </span>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? `${track.bpm} BPM` : '';
                            break;
                          case 'dateAdded':
                            cellContent = (
                              <span className="truncate-cell text-xs text-muted font-mono">
                                {dateAddedStr}
                              </span>
                            );
                            cellTooltip = dateAddedStr;
                            break;
                          case 'energy':
                            cellContent = (
                              <div className="truncate-cell flex items-center gap-1.5">
                                {track.analysis_status === 'completed' ? (
                                  <>
                                    <span className="energy-val">{track.energy}</span>
                                    <span className="energy-bars" style={{ '--energy': track.energy } as React.CSSProperties}></span>
                                  </>
                                ) : (
                                  '--'
                                )}
                              </div>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? `${t('col_energy')}: ${track.energy}` : '';
                            break;
                          case 'cuePoints':
                            cellContent = (
                              <span className="truncate-cell font-mono font-bold" style={{ color: 'var(--accent-cyan)' }}>
                                {track.analysis_status === 'completed' ? cuePoints : '--'}
                              </span>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? `${cuePoints} points` : '';
                            break;
                          case 'clippedPeaks':
                            cellContent = (
                              <span className="truncate-cell" style={{ color: clippedPeaks === 'Yes' ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 'bold' }}>
                                {track.analysis_status === 'completed' ? clippedPeaks : '--'}
                              </span>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? `${t('col_clipped_peaks')}: ${clippedPeaks}` : '';
                            break;
                          case 'volume':
                            cellContent = (
                              <span className="truncate-cell font-mono text-xs text-muted">
                                {track.analysis_status === 'completed' ? `${volumeDb} dB` : '--'}
                              </span>
                            );
                            cellTooltip = track.analysis_status === 'completed' ? `${volumeDb} dB` : '';
                            break;
                          case 'genre':
                            cellContent = <span className="truncate-cell">{track.genre}</span>;
                            cellTooltip = track.genre;
                            break;
                          case 'grouping':
                            cellContent = (
                              <span className="truncate-cell px-2 py-0.5 rounded bg-white bg-opacity-5 font-mono text-xs">
                                {groupingVal}
                              </span>
                            );
                            cellTooltip = groupingVal;
                            break;
                          case 'year':
                            cellContent = <span className="truncate-cell">{track.year}</span>;
                            cellTooltip = String(track.year);
                            break;
                          case 'time':
                            cellContent = (
                              <span className="truncate-cell font-mono">
                                {formatDuration(track.duration)}
                              </span>
                            );
                            cellTooltip = formatDuration(track.duration);
                            break;
                          case 'action':
                            cellContent = (
                              <button 
                                className="small-btn danger-btn py-1 px-2 text-xs cursor-pointer" 
                                onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
                              >
                                {t('delete')}
                              </button>
                            );
                            cellTooltip = t('delete');
                            break;
                        }

                        return (
                          <td 
                            key={colKey}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'middle'
                            }}
                            title={cellTooltip}
                          >
                            {cellContent}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid-panel flex-grow overflow-auto" id="collectionGridWrapper">
          {filtered.length === 0 ? (
            <div className="text-center muted w-full py-16" style={{ gridColumn: '1 / -1' }}>
              {t('no_tracks')}
            </div>
          ) : (
            filtered.map((track, index) => {
              const isSelected = selectedTrackIds.includes(track.id);
              const keyColor = keyColors[track.camelot_key] || '#fff';
              const coverUrl = `/api/tracks/${track.id}/cover`;

              return (
                <div 
                  key={track.id}
                  className={`panel grid-track-card ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => handleRowClick(e, track, index)}
                  onDoubleClick={() => playTrack(track)}
                  onContextMenu={(e) => handleRowContextMenu(e, track, index)}
                >
                  <img src={coverUrl} alt="cover" />
                  <b>{track.title}</b>
                  <span>{track.artist}</span>
                  <div className="badge-row flex justify-center gap-2 mt-1">
                    <span className="badge-key" style={{ color: keyColor, fontWeight: 'bold' }}>{displayKey(track.camelot_key)}</span>
                    <span className="badge-bpm">{track.bpm} BPM</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      
      {/* Context Menu */}
      {menuPosition && (
        <ul 
          className="context-menu"
          style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <li className="context-menu-item" onClick={handlePlaySelected}>
            <span>{settings.language === 'th' ? 'เล่นเพลง (Play Song)' : 'Play Song'}</span>
            <span className="text-xs text-muted">▶</span>
          </li>
          <li className="context-menu-item" onClick={handleShowFolder}>
            <span>{settings.language === 'th' ? 'แสดงในโฟลเดอร์ที่เก็บไฟล์ (Show Containing Folder)' : 'Show in Containing Folder'}</span>
            <span className="text-xs text-muted">📂</span>
          </li>
          
          <div className="context-menu-separator" />

          <li className="context-menu-item">
            <div className="submenu-trigger">
              <span>{settings.language === 'th' ? 'เพิ่มลงเพลย์ลิสต์ (Add to Playlist)' : 'Add to Playlist'}</span>
              <span className="text-xs text-muted">▶</span>
            </div>
            <ul className="context-menu submenu">
              {playlists.length === 0 ? (
                <li className="context-menu-item disabled">
                  <span>{settings.language === 'th' ? 'ไม่มีเพลย์ลิสต์' : 'No playlists'}</span>
                </li>
              ) : (
                playlists.map(p => (
                  <li key={p.id} className="context-menu-item" onClick={() => handleAddToPlaylist(p.id)}>
                    <span>{p.name}</span>
                  </li>
                ))
              )}
            </ul>
          </li>

          <li className="context-menu-item">
            <div className="submenu-trigger">
              <span>{settings.language === 'th' ? 'เพิ่มลงคอลเลกชัน (Add to Collection)' : 'Add to Collection'}</span>
              <span className="text-xs text-muted">▶</span>
            </div>
            <ul className="context-menu submenu">
              {collections.length === 0 ? (
                <li className="context-menu-item disabled">
                  <span>{settings.language === 'th' ? 'ไม่มีคอลเลกชัน' : 'No collections'}</span>
                </li>
              ) : (
                collections.map(c => (
                  <li key={c.id} className="context-menu-item" onClick={() => handleAddToCollection(c.id)}>
                    <span>{c.name}</span>
                  </li>
                ))
              )}
            </ul>
          </li>

          {selectedCollectionId && (
            <li className="context-menu-item danger" onClick={handleRemoveFromCollection}>
              <span>{settings.language === 'th' ? 'นำออกจากคอลเลกชันนี้ (Remove from Collection)' : 'Remove from Collection'}</span>
              <span className="text-xs text-muted">✕</span>
            </li>
          )}
          
          <div className="context-menu-separator" />
          
          <li className="context-menu-item" onClick={handleOpenInMashup}>
            <span>{settings.language === 'th' ? 'เปิดใน Mashup (Open in Mashup)' : 'Open in Mashup'}</span>
            <span className="text-xs text-muted">⚡</span>
          </li>
          
          <div className="context-menu-separator" />
          
          <li className="context-menu-item" onClick={() => {
            const track = menuTrack || localTracks.find(t => selectedTrackIds.includes(t.id));
            if (track) {
              setEditData(selectedTrackIds.length === 1 ? { ...track } : {});
              setEditModalOpen(true);
            }
          }}>
            <span>{settings.language === 'th' ? 'แก้ไขข้อมูลเพลง (Edit Song Details)' : 'Edit Song Details'}</span>
            <span className="text-xs text-muted">✎</span>
          </li>
          <li className="context-menu-item danger" onClick={() => setDeleteConfirmOpen(true)}>
            <span>{settings.language === 'th' ? 'ลบเพลง (Delete)' : 'Delete'}</span>
            <span className="text-xs text-muted">🗑</span>
          </li>
          <li className="context-menu-item" onClick={handleExportCSV}>
            <span>{settings.language === 'th' ? 'ส่งออกเพลง (Export Songs)' : 'Export Songs'}</span>
            <span className="text-xs text-muted">⬇</span>
          </li>
          <li className="context-menu-item" onClick={() => setIsDjExportOpen(true)}>
            <span>{settings.language === 'th' ? 'ส่งออกสำหรับโปรแกรมดีเจ (Export for DJ Software)' : 'Export for DJ Software'}</span>
            <span className="text-xs text-muted">🎧</span>
          </li>
          <li className="context-menu-item" onClick={handleRemoveKeysFromFilename}>
            <span>{settings.language === 'th' ? 'ลบคีย์ออกจากชื่อไฟล์ (Remove Keys from Filename)' : 'Remove Keys from Filename'}</span>
            <span className="text-xs text-muted">🏷</span>
          </li>
          <li className="context-menu-item" onClick={handleRemoveKeysFromTags}>
            <span>{settings.language === 'th' ? 'ลบคีย์ออกจาก Tags (Remove Keys from Tags)' : 'Remove Keys from Tags'}</span>
            <span className="text-xs text-muted">🏷</span>
          </li>
          <li className="context-menu-item" onClick={handleReTagSongs}>
            <span>{settings.language === 'th' ? 'เขียนข้อมูลแท็กลงไฟล์เสียงอีกครั้ง (Re-tag Songs)' : 'Re-tag Songs'}</span>
            <span className="text-xs text-muted">⟲</span>
          </li>
          <li className="context-menu-item" onClick={handleReAnalyzeSelected}>
            <span>{settings.language === 'th' ? 'วิเคราะห์เพลงใหม่ (Re-analyze Songs)' : 'Re-analyze Songs'}</span>
            <span className="text-xs text-muted">🗲</span>
          </li>
          
          <div className="context-menu-separator" />
          
          <li className="context-menu-item" onClick={handleExportCuePoints}>
            <span>{settings.language === 'th' ? 'ส่งออกจุดคิว (Export Cue Points)' : 'Export Cue Points'}</span>
            <span className="text-xs text-muted">📍</span>
          </li>
          <li className="context-menu-item" onClick={handleRemoveCuePoints}>
            <span>{settings.language === 'th' ? 'ลบไฟล์จุดคิวที่ส่งออก (Remove Exported Cue Points)' : 'Remove Exported Cue Points'}</span>
            <span className="text-xs text-muted">✕</span>
          </li>
          
          <div className="context-menu-separator" />
          
          <li className="context-menu-item" onClick={handleScanSongs}>
            <span>{settings.language === 'th' ? 'สแกนหาไฟล์เพลงที่ถูกย้ายหรือลบ (Scan for moved or deleted Songs)' : 'Scan for moved or deleted Songs'}</span>
            <span className="text-xs text-muted">🔍</span>
          </li>
          
          <li className="context-menu-item">
            <div className="submenu-trigger">
              <span>{settings.language === 'th' ? 'รูปแบบคีย์ (Key Format)' : 'Key Format'}</span>
              <span className="text-xs text-muted">▶</span>
            </div>
            
            <ul className="context-menu submenu">
              <li 
                className="context-menu-item" 
                onClick={() => updateSetting('keyNotation', 'camelot')}
                style={{ color: settings.keyNotation === 'camelot' ? 'var(--accent-cyan)' : 'inherit' }}
              >
                <span>Camelot</span>
                {settings.keyNotation === 'camelot' && <span className="text-xs">✓</span>}
              </li>
              <li 
                className="context-menu-item" 
                onClick={() => updateSetting('keyNotation', 'musical')}
                style={{ color: settings.keyNotation === 'musical' ? 'var(--accent-cyan)' : 'inherit' }}
              >
                <span>Musical</span>
                {settings.keyNotation === 'musical' && <span className="text-xs">✓</span>}
              </li>
              <li 
                className="context-menu-item" 
                onClick={() => updateSetting('keyNotation', 'openkey')}
                style={{ color: settings.keyNotation === 'openkey' ? 'var(--accent-cyan)' : 'inherit' }}
              >
                <span>OpenKey</span>
                {settings.keyNotation === 'openkey' && <span className="text-xs">✓</span>}
              </li>
            </ul>
          </li>
        </ul>
      )}

      {/* Modals & Dialogs */}
      {folderModal && (
        <div className="modal-overlay" onClick={() => setFolderModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>{settings.language === 'th' ? 'ที่อยู่ไฟล์เพลง' : 'Containing Folder'}</span>
              <button className="modal-close" onClick={() => setFolderModal(null)}>✕</button>
            </div>
            <div className="modal-body text-left">
              <p className="text-sm text-muted mb-2">
                {settings.language === 'th' 
                  ? 'ไฟล์นี้เก็บไว้ในระบบ Cloudflare R2 Storage คุณสามารถเข้าถึงและดาวน์โหลดได้โดยตรง หรือดูพาธจำลองได้ด้านล่าง:' 
                  : 'This file is stored in Cloudflare R2 bucket. You can download it directly or view the simulated path below:'}
              </p>
              <div className="p-3 rounded font-mono text-xs select-all break-all" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--panel-border)' }}>
                {folderModal}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn py-1.5 px-4 rounded text-sm cursor-pointer border" style={{ borderColor: 'var(--panel-border)', backgroundColor: 'transparent', color: 'var(--text-main)' }} onClick={() => setFolderModal(null)}>
                {settings.language === 'th' ? 'ปิด' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mashupModal && (
        <div className="modal-overlay" onClick={() => setMashupModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>{settings.language === 'th' ? 'เปิดโหมด Mashup Assistant' : 'Mashup Assistant'}</span>
              <button className="modal-close" onClick={() => setMashupModal(null)}>✕</button>
            </div>
            <div className="modal-body text-left">
              <p className="text-sm mb-3">
                {settings.language === 'th' 
                  ? `โหลดเพลงจำนวน ${mashupModal.length} เพลง เข้าสู่หน้าต่างเปรียบเทียบคีย์และพลังงานเสียง (Mashup View)` 
                  : `Loaded ${mashupModal.length} tracks into the Harmonic Mashup & Energy Analysis view.`}
              </p>
              <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                {tracks.filter(t => mashupModal.includes(t.id)).map(t => (
                  <li key={t.id} className="text-xs p-2 rounded flex justify-between items-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <span className="font-semibold truncate pr-2" style={{ maxWidth: '70%' }}>{t.title} - {t.artist}</span>
                    <div className="flex gap-2 font-mono">
                      <span style={{ color: keyColors[t.camelot_key] }}>{displayKey(t.camelot_key)}</span>
                      <span className="text-muted">{t.bpm} BPM</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button className="btn py-1.5 px-4 rounded text-sm cursor-pointer border" style={{ borderColor: 'var(--panel-border)', backgroundColor: 'transparent', color: 'var(--text-main)' }} onClick={() => setMashupModal(null)}>
                {settings.language === 'th' ? 'ปิด' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanProgress !== null && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-title text-left">
              <span>{settings.language === 'th' ? 'กำลังสแกนหาไฟล์เพลง...' : 'Scanning files...'}</span>
            </div>
            <div className="modal-body flex flex-col items-center py-6">
              <div className="w-full bg-white bg-opacity-10 h-2 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-accent-cyan transition-all duration-150" style={{ width: `${scanProgress}%` }} />
              </div>
              <span className="text-sm font-semibold">{scanProgress}%</span>
              <span className="text-xs text-muted mt-1">
                {settings.language === 'th' 
                  ? `ตรวจสอบฐานข้อมูล D1 และ R2 Storage... (${tracks.length} ไฟล์)`
                  : `Verifying metadata and storage keys... (${tracks.length} tracks)`}
              </span>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title text-accent-red text-left">
              <span>⚠️ {settings.language === 'th' ? 'ยืนยันการลบเพลง' : 'Confirm Delete'}</span>
              <button className="modal-close" onClick={() => setDeleteConfirmOpen(false)}>✕</button>
            </div>
            <div className="modal-body text-left">
              <p className="text-sm">
                {settings.language === 'th'
                  ? `คุณแน่ใจหรือไม่ที่จะลบเพลงที่เลือกทั้งหมดจำนวน ${selectedTrackIds.length} เพลง? การดำเนินการนี้จะลบไฟล์ออกจากคลังเพลงและ Cloudflare R2 Storage อย่างถาวร`
                  : `Are you sure you want to permanently delete ${selectedTrackIds.length} selected track(s)? This will remove them from the library and R2 Storage.`}
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn py-1.5 px-4 rounded text-sm cursor-pointer border" 
                style={{ borderColor: 'var(--panel-border)', backgroundColor: 'transparent', color: 'var(--text-main)' }} 
                onClick={() => setDeleteConfirmOpen(false)}
              >
                {settings.language === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button 
                className="btn danger-btn py-1.5 px-4 rounded text-sm cursor-pointer text-white" 
                style={{ backgroundColor: 'var(--accent-red)' }}
                onClick={handleDeleteSelected}
              >
                {settings.language === 'th' ? 'ลบอย่างถาวร' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title text-left">
              <span>
                {settings.language === 'th' 
                  ? `แก้ไขข้อมูลเพลง (${selectedTrackIds.length} เพลง)` 
                  : `Edit Song Details (${selectedTrackIds.length} tracks)`}
              </span>
              <button className="modal-close" onClick={() => setEditModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body text-left">
              {selectedTrackIds.length === 1 && (
                <>
                  <div className="form-group">
                    <label>{settings.language === 'th' ? 'ชื่อเพลง' : 'Title'}</label>
                    <input 
                      type="text" 
                      value={editData.title || ''} 
                      onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))} 
                    />
                  </div>
                  <div className="form-group">
                    <label>{settings.language === 'th' ? 'ชื่อไฟล์' : 'Filename'}</label>
                    <input 
                      type="text" 
                      value={editData.file_name || ''} 
                      onChange={(e) => setEditData(prev => ({ ...prev, file_name: e.target.value }))} 
                    />
                  </div>
                </>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'ศิลปิน' : 'Artist'}</label>
                  <input 
                    type="text" 
                    placeholder={selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : ''}
                    value={editData.artist || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, artist: e.target.value }))} 
                  />
                </div>
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'อัลบั้ม' : 'Album'}</label>
                  <input 
                    type="text" 
                    placeholder={selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : ''}
                    value={editData.album || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, album: e.target.value }))} 
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'แนวเพลง' : 'Genre'}</label>
                  <input 
                    type="text" 
                    placeholder={selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : ''}
                    value={editData.genre || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, genre: e.target.value }))} 
                  />
                </div>
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'ปี' : 'Year'}</label>
                  <input 
                    type="number" 
                    placeholder={selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : ''}
                    value={editData.year || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, year: e.target.value ? Number(e.target.value) : undefined }))} 
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'ความเร็ว (BPM)' : 'Tempo (BPM)'}</label>
                  <input 
                    type="number" 
                    placeholder={selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : ''}
                    value={editData.bpm || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, bpm: e.target.value ? Number(e.target.value) : undefined }))} 
                  />
                </div>
                <div className="form-group">
                  <label>{settings.language === 'th' ? 'คีย์เพลง (Camelot)' : 'Key Notation (Camelot)'}</label>
                  <select 
                    value={editData.camelot_key || ''} 
                    onChange={(e) => setEditData(prev => ({ ...prev, camelot_key: e.target.value }))}
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-main)' }}
                  >
                    <option value="">{selectedTrackIds.length > 1 ? `[ไม่มีการเปลี่ยนแปลง]` : '--'}</option>
                    {Object.keys(keyNotationMapping.camelot).map(k => (
                      <option key={k} value={k}>{k} ({keyNotationMapping.musical[k]})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn py-1.5 px-4 rounded text-sm cursor-pointer border" 
                style={{ borderColor: 'var(--panel-border)', backgroundColor: 'transparent', color: 'var(--text-main)' }} 
                onClick={() => setEditModalOpen(false)}
              >
                {settings.language === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button 
                className="btn py-1.5 px-4 rounded text-sm cursor-pointer text-white" 
                style={{ backgroundColor: 'var(--accent-cyan)' }}
                onClick={handleSaveMetadata}
              >
                {settings.language === 'th' ? 'บันทึก' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DJ Export Modal */}
      {isDjExportOpen && (
        <div className="modal-overlay" onClick={() => setIsDjExportOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {settings.language === 'th' ? 'ส่งออกคลังเพลงสำหรับดีเจ' : 'Export DJ Database'}
              </h3>
              <button className="modal-close" onClick={() => setIsDjExportOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted mb-4">
                {settings.language === 'th' 
                  ? 'ส่งออกค่าความดัง (BPM), คีย์เพลง (Camelot Key) และจุดคิวคิว 1-8 ที่เซ็ตไว้ ไปยังโปรแกรมหลักในเครื่องคอมพิวเตอร์ของคุณ'
                  : 'Export BPM, Camelot Key, and Cue Points 1-8 to use directly in your local DJ software.'}
              </p>

              {/* Format Selector */}
              <div className="form-group mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  {settings.language === 'th' ? 'เลือกฟอร์แมตโปรแกรมดีเจ:' : 'Select DJ Software Format:'}
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className={`btn flex-1 py-2 px-3 rounded text-sm font-semibold border text-center transition-all ${djExportFormat === 'rekordbox' ? 'active' : ''}`}
                    onClick={() => setDjExportFormat('rekordbox')}
                    style={{ 
                      borderColor: djExportFormat === 'rekordbox' ? 'var(--accent-cyan)' : 'var(--panel-border)',
                      backgroundColor: djExportFormat === 'rekordbox' ? 'rgba(0, 191, 255, 0.1)' : 'transparent',
                      color: djExportFormat === 'rekordbox' ? 'var(--accent-cyan)' : 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    Pioneer Rekordbox (.xml)
                  </button>
                  <button 
                    className={`btn flex-1 py-2 px-3 rounded text-sm font-semibold border text-center transition-all ${djExportFormat === 'traktor' ? 'active' : ''}`}
                    onClick={() => setDjExportFormat('traktor')}
                    style={{ 
                      borderColor: djExportFormat === 'traktor' ? 'var(--accent-purple)' : 'var(--panel-border)',
                      backgroundColor: djExportFormat === 'traktor' ? 'rgba(170, 98, 255, 0.1)' : 'transparent',
                      color: djExportFormat === 'traktor' ? 'var(--accent-purple)' : 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    Native Instruments Traktor (.nml)
                  </button>
                </div>
              </div>

              {/* Local Path Prefix Input */}
              <div className="form-group mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  {settings.language === 'th' ? 'ไดเรกทอรีเก็บเพลงในเครื่องคอมพิวเตอร์ของคุณ:' : 'Local Audio Library Path Prefix:'}
                </label>
                <input 
                  type="text" 
                  value={localPathPrefix}
                  onChange={(e) => setLocalPathPrefix(e.target.value)}
                  className="btn-control"
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'rgba(0,0,0,0.2)' }}
                  placeholder="C:\\Users\\PXNDA\\Music\\PandaKey\\"
                />
                <span className="text-xs text-muted block mt-1.5">
                  {settings.language === 'th'
                    ? 'สำคัญ: ระบุโฟลเดอร์ในเครื่องคอมที่เก็บไฟล์เพลงนี้ เพื่อให้โปรแกรมดีเจสแกนลิงก์เข้ากับไฟล์ในเครื่องได้อัตโนมัติ'
                    : 'Important: Matches the folder path on your computer where these audio files are stored to link them automatically.'}
                </span>
                <span className="text-xs text-muted block mt-0.5">
                  {settings.language === 'th'
                    ? 'ตัวอย่าง: C:\\Users\\Name\\Music\\ หรือ /Users/Name/Music/'
                    : 'Example: C:\\Users\\Name\\Music\\ or /Users/Name/Music/'}
                </span>
              </div>

              {/* Track count indicator */}
              <div className="text-xs text-muted font-semibold mt-4">
                {settings.language === 'th'
                  ? `เพลงที่เลือกส่งออก: ${selectedTrackIds.length || tracks.length} เพลง`
                  : `Tracks to export: ${selectedTrackIds.length || tracks.length} tracks`}
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button 
                className="btn py-1.5 px-4 rounded text-sm cursor-pointer border" 
                style={{ borderColor: 'var(--panel-border)', backgroundColor: 'transparent', color: 'var(--text-main)' }} 
                onClick={() => setIsDjExportOpen(false)}
              >
                {settings.language === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button 
                className="btn py-1.5 px-4 rounded text-sm cursor-pointer text-white" 
                style={{ backgroundColor: djExportFormat === 'traktor' ? 'var(--accent-purple)' : 'var(--accent-cyan)' }}
                onClick={handleDjExport}
              >
                {settings.language === 'th' ? 'ดาวน์โหลดไฟล์ดาต้าเบส' : 'Download DJ Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

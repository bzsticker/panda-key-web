// src/context/AppContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface Track {
  id: string;
  file_name: string;
  r2_key: string;
  file_size: number;
  file_type: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  comments: string;
  musical_key: string;
  camelot_key: string;
  bpm: number;
  energy: number;
  duration: number;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  trackCount: number;
  totalTime: string;
}

export interface AnalysisJob {
  id: string;
  track_id: string;
  file_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  current_step: string;
  error_message: string;
}

interface AppContextType {
  tracks: Track[];
  playlists: Playlist[];
  collections: Playlist[]; // Custom Collections
  jobs: AnalysisJob[];
  loading: boolean;
  user: any;
  activePage: string;
  activeFilter: string; // 'all', 'recent', 'favorites'
  searchQuery: string;
  selectedTrackId: string | null;
  selectedPlaylistId: string | null;
  selectedCollectionId: string | null;
  sortBy: string;
  sortDesc: boolean;
  layoutMode: 'table' | 'grid';
  filterGenre: string;
  filterKeyGroup: string;
  filterKey: string;
  settings: Record<string, any>;
  
  // Audio Player State
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  durationSeconds: number;
  loop: boolean;
  
  // Operations
  setActivePage: (p: string) => void;
  setActiveFilter: (f: string) => void;
  setSearchQuery: (q: string) => void;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  setSelectedCollectionId: (id: string | null) => void;
  setSortBy: (field: string) => void;
  setSortDesc: (desc: boolean) => void;
  setLayoutMode: (mode: 'table' | 'grid') => void;
  setFilterGenre: (g: string) => void;
  setFilterKeyGroup: (k: string) => void;
  setFilterKey: (k: string) => void;
  updateSetting: (key: string, val: any) => void;
  
  // D1 / R2 Operations
  fetchLibrary: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
  updateTrackMetadata: (trackId: string, metadata: Partial<Track>) => Promise<void>;
  createPlaylist: (name: string, description: string) => Promise<void>;
  updatePlaylistTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  createCollection: (name: string, description: string) => Promise<void>;
  updateCollectionTracks: (collectionId: string, trackIds: string[]) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  reEnqueueAnalysis: (trackId: string) => Promise<void>;
  logout: () => Promise<void>;
  
  // Player Controls
  playTrack: (track: Track) => void;
  togglePlayback: () => void;
  playNext: () => void;
  playPrev: () => void;
  toggleLoop: () => void;
  toggleTrackFavorite: (track: Track) => void;
  seekPlayer: (seconds: number) => void;
  cues: Array<{ id: string; time: number; label: string; color: string }>;
  saveCues: (trackId: string, cues: Array<{ id: string; time: number; label: string; color: string }>) => Promise<void>;
  volume: number;
  setVolume: (val: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [collections, setCollections] = useState<Playlist[]>([]);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Filters & Layouts
  const [activePage, setActivePageState] = useState('collection');

  // Sync activePage state with the current URL pathname on route change
  useEffect(() => {
    if (pathname) {
      const parts = pathname.split('/');
      const page = parts[parts.length - 1] || 'collection';
      if (['collection', 'tags', 'analysis', 'playlists', 'settings', 'analytics'].includes(page)) {
        setActivePageState(page);
      }
    }
  }, [pathname]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('id');
  const [sortDesc, setSortDesc] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'table' | 'grid'>('table');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterKeyGroup, setFilterKeyGroup] = useState('');
  const [filterKey, setFilterKey] = useState('');

  // Settings
  const [settings, setSettings] = useState<Record<string, any>>({
    language: 'en',
    theme: 'dark',
    crossfade: 5,
    autoPlay: true,
    rememberPos: true,
    autoAnalyze: true,
    saveCuePoints: true,
    keyNotation: 'camelot',
    metadataFormat: 'ID3v2.4',
  });

  // Load settings from localStorage on start
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('pandakey_settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings(prev => ({ ...prev, ...parsed }));
          
          // Apply theme
          if (parsed.theme) {
            document.body.className = '';
            if (parsed.theme === 'light') {
              document.body.classList.add('light-theme');
            } else if (parsed.theme === 'cyber') {
              document.body.classList.add('cyber-theme');
            }
          }
        } catch (e) {
          console.error('Failed to parse saved settings', e);
        }
      }

      // Load layoutMode
      const savedLayout = localStorage.getItem('collection_layout_mode');
      if (savedLayout === 'table' || savedLayout === 'grid') {
        setLayoutMode(savedLayout);
      }
    }
  }, []);

  // Save layoutMode to localStorage on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('collection_layout_mode', layoutMode);
    }
  }, [layoutMode]);

  // Audio Player State
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [loop, setLoop] = useState(false);
  const [cues, setCues] = useState<Array<{ id: string; time: number; label: string; color: string }>>([]);
  const [volume, setVolumeState] = useState(0.8);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize HTML5 Audio
  useEffect(() => {
    audioRef.current = new Audio();
    
    const audio = audioRef.current;
    audio.volume = volume;
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDurationSeconds(audio.duration);
    };

    const handleEnded = () => {
      if (loop) {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
      } else if (settings.autoPlay) {
        playNext();
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [loop, settings.autoPlay, tracks, selectedTrackId]);

  // Sync player state with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  // Load user profile and library on start
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = (await res.json()) as any;
        setUser(data.user);
        await fetchLibrary();
      } catch (err) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Sync jobs state to a ref to avoid stale closures in setInterval
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Poll analysis jobs in real time
  useEffect(() => {
    if (!user) return;

    // Start polling if there are pending/running jobs
    const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'running');
    
    if (hasActiveJobs) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(pollJobs, 1500);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobs, user]);

  const pollJobs = async () => {
    try {
      const res = await fetch(`/api/analysis/jobs?t=${Date.now()}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setJobs(data);
        
        // If any job recently completed/failed, refresh library
        const hasFinished = data.some((job: any) => {
          const oldJob = jobsRef.current.find(j => j.id === job.id);
          const isDone = job.status === 'completed' || job.status === 'failed';
          const wasNotDone = !oldJob || (oldJob.status !== 'completed' && oldJob.status !== 'failed');
          return isDone && wasNotDone;
        });
        
        if (hasFinished) {
          await fetchTracksOnly();
        }
      }
    } catch (e) {
      console.error('Jobs polling error:', e);
    }
  };

  const fetchTracksOnly = async () => {
    try {
      const res = await fetch(`/api/tracks?t=${Date.now()}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setTracks(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLibrary = async () => {
    try {
      const [tracksRes, playlistsRes, jobsRes] = await Promise.all([
        fetch(`/api/tracks?t=${Date.now()}`),
        fetch(`/api/playlists?t=${Date.now()}`),
        fetch(`/api/analysis/jobs?t=${Date.now()}`)
      ]);

      if (tracksRes.ok) setTracks(await tracksRes.json());
      if (playlistsRes.ok) {
        const allPlaylists = (await playlistsRes.json()) as any[];
        setPlaylists(allPlaylists.filter((p: any) => !p.id.startsWith('collection-')));
        setCollections(allPlaylists.filter((p: any) => p.id.startsWith('collection-')));
      }
      if (jobsRes.ok) setJobs(await jobsRes.json());
    } catch (error) {
      console.error('Fetch library error:', error);
    }
  };

  const setActivePage = (p: string) => {
    setActivePageState(p);
    // Clear page-specific filters on navigation
    if (p !== 'collection') {
      setFilterKey('');
    }
    router.push(`/app/${p}`);
  };

  // R2 Direct browser uploading
  const uploadFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Step 1: Create upload URL
        const createRes = await fetch('/api/uploads/create-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'audio/mpeg'
          })
        });

        if (!createRes.ok) {
          throw new Error(await createRes.text());
        }

        const { trackId, r2Key, uploadUrl, useFallbackUpload } = (await createRes.json()) as any;

        // Add dummy pending track to UI immediately for better responsiveness
        const tempTrack: Track = {
          id: trackId,
          file_name: file.name,
          r2_key: '',
          file_size: file.size,
          file_type: file.type,
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Uploading...',
          album: 'Pending Upload',
          genre: 'Pending',
          year: new Date().getFullYear(),
          comments: '',
          musical_key: '--',
          camelot_key: '--',
          bpm: 0,
          energy: 0,
          duration: 0,
          analysis_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setTracks(prev => {
          if (prev.some(t => t.id === trackId)) {
            return prev;
          }
          return [tempTrack, ...prev];
        });

        // Step 2: R2 Upload
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isLocalDev || useFallbackUpload || !uploadUrl) {
          // Upload via Next.js API route to bypass local R2 browser-direct upload limits
          // or as a fallback when S3-compatible R2 direct-upload credentials are not set up in production
          const formData = new FormData();
          formData.append('file', file);
          formData.append('trackId', trackId);
          formData.append('r2Key', r2Key);
          
          const localRes = await fetch('/api/uploads/local', {
            method: 'POST',
            body: formData
          });
          
          if (!localRes.ok) {
            throw new Error('Failed to upload file to storage');
          }
        } else {
          // Direct browser PUT upload to R2 (Production)
          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'audio/mpeg' },
            body: file
          });

          if (!putRes.ok) {
            throw new Error('Failed to upload file chunk to storage');
          }
        }

        // Step 3: Complete upload and enqueue background job
        const completeRes = await fetch('/api/uploads/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId })
        });

        if (!completeRes.ok) {
          throw new Error('Failed to trigger analysis queue');
        }

        // Refresh libraries and start active polling
        await fetchLibrary();

      } catch (err) {
        console.error(`Upload failed for file ${file.name}:`, err);
        alert(`Failed to upload ${file.name}: ${err}`);
      }
    }
  };

  const deleteTrack = async (trackId: string) => {
    try {
      const res = await fetch(`/api/tracks/${trackId}`, { method: 'DELETE' });
      if (res.ok) {
        setTracks(prev => prev.filter(t => t.id !== trackId));
        if (selectedTrackId === trackId) setSelectedTrackId(null);
        if (currentTrack?.id === trackId) {
          setCurrentTrack(null);
          setIsPlaying(false);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateTrackMetadata = async (trackId: string, metadata: Partial<Track>) => {
    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });
      if (res.ok) {
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...metadata } : t));
        if (currentTrack?.id === trackId) {
          setCurrentTrack(prev => prev ? { ...prev, ...metadata } : null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createPlaylist = async (name: string, description: string) => {
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      if (res.ok) {
        const newPlaylist = (await res.json()) as Playlist;
        setPlaylists(prev => [newPlaylist, ...prev]);
        setSelectedPlaylistId(newPlaylist.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updatePlaylistTracks = async (playlistId: string, trackIds: string[]) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds })
      });
      if (res.ok) {
        setPlaylists(prev => prev.map(p => {
          if (p.id === playlistId) {
            return {
              ...p,
              trackIds,
              trackCount: trackIds.length
            };
          }
          return p;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      if (res.ok) {
        setPlaylists(prev => prev.filter(p => p.id !== playlistId));
        if (selectedPlaylistId === playlistId) {
          setSelectedPlaylistId(playlists.length > 1 ? playlists[0].id : null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createCollection = async (name: string, description: string) => {
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, type: 'collection' })
      });
      if (res.ok) {
        const newCollection = (await res.json()) as Playlist;
        setCollections(prev => [newCollection, ...prev]);
        setSelectedCollectionId(newCollection.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateCollectionTracks = async (collectionId: string, trackIds: string[]) => {
    try {
      const res = await fetch(`/api/playlists/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds })
      });
      if (res.ok) {
        setCollections(prev => prev.map(c => {
          if (c.id === collectionId) {
            return {
              ...c,
              trackIds,
              trackCount: trackIds.length
            };
          }
          return c;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteCollection = async (collectionId: string) => {
    try {
      const res = await fetch(`/api/playlists/${collectionId}`, { method: 'DELETE' });
      if (res.ok) {
        setCollections(prev => prev.filter(c => c.id !== collectionId));
        if (selectedCollectionId === collectionId) {
          setSelectedCollectionId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const reEnqueueAnalysis = async (trackId: string) => {
    try {
      const res = await fetch('/api/analysis/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId })
      });
      if (res.ok) {
        await fetchLibrary();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setTracks([]);
      setPlaylists([]);
      setCollections([]);
      setJobs([]);
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  // Player Operations
  const playTrack = (track: Track) => {
    setSelectedTrackId(track.id);
    setCurrentTrack(track);
    setIsPlaying(true);

    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        // Point the audio element directly to our streaming API route
        audio.src = `/api/tracks/${track.id}/audio`;
        audio.load();
        audio.play().catch(() => console.log('Mock Audio playback started.'));
      } catch (err) {
        console.error('Error starting audio playback:', err);
      }
    }
  };

  const togglePlayback = () => {
    if (!currentTrack) {
      if (tracks.length > 0) playTrack(tracks[0]);
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    let list = tracks;
    if (activePage === 'playlists') {
      const pl = playlists.find(p => p.id === selectedPlaylistId);
      if (pl) {
        list = tracks.filter(t => pl.trackIds.includes(t.id));
      }
    }
    
    if (list.length === 0) return;
    
    const currentIndex = list.findIndex(t => t.id === selectedTrackId);
    const nextIndex = (currentIndex + 1) % list.length;
    playTrack(list[nextIndex]);
  };

  const playPrev = () => {
    let list = tracks;
    if (activePage === 'playlists') {
      const pl = playlists.find(p => p.id === selectedPlaylistId);
      if (pl) {
        list = tracks.filter(t => pl.trackIds.includes(t.id));
      }
    }
    
    if (list.length === 0) return;
    
    const currentIndex = list.findIndex(t => t.id === selectedTrackId);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = list.length - 1;
    playTrack(list[prevIndex]);
  };

  const toggleLoop = () => {
    setLoop(!loop);
  };

  const toggleTrackFavorite = async (track: Track) => {
    // We will save favorites as tag or D1 comment boolean. Let's toggle comments or use comments as JSON tags.
    // In tracks table, we can just save track metadata changes.
    // Let's modify comments to store JSON or we can just update genre or year.
    // Since tracks table does not have an explicit `is_fav` column in D1, 
    // we can save "favorite" status in the `comments` column: "favorites"
    const isFav = track.comments === 'favorites';
    const newComments = isFav ? '' : 'favorites';
    
    await updateTrackMetadata(track.id, { comments: newComments });
  };

  const seekPlayer = (seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  // Fetch cue points for current track
  useEffect(() => {
    if (!currentTrack) {
      setCues([]);
      return;
    }

    const fetchCues = async () => {
      try {
        const res = await fetch(`/api/tracks/${currentTrack.id}/cues`);
        if (res.ok) {
          const data = (await res.json()) as Array<{ id: string; time: number; label: string; color: string }>;
          setCues(data);
        }
      } catch (err) {
        console.error('Error fetching cues:', err);
      }
    };

    fetchCues();
  }, [currentTrack]);

  const saveCues = async (trackId: string, updatedCues: typeof cues) => {
    setCues(updatedCues);
    try {
      const res = await fetch(`/api/tracks/${trackId}/cues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cues: updatedCues })
      });
      if (!res.ok) {
        console.error('Failed to sync cues to backend');
      }
    } catch (err) {
      console.error('Error saving cues:', err);
    }
  };

  const setVolume = (val: number) => {
    setVolumeState(val);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = val;
    }
  };

  const updateSetting = (key: string, val: any) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: val };
      if (typeof window !== 'undefined') {
        localStorage.setItem('pandakey_settings', JSON.stringify(updated));
      }
      return updated;
    });
    
    if (key === 'theme') {
      document.body.className = '';
      if (val === 'light') {
        document.body.classList.add('light-theme');
      } else if (val === 'cyber') {
        document.body.classList.add('cyber-theme');
      }
    }
  };

  return (
    <AppContext.Provider
      value={{
        tracks,
        playlists,
        collections,
        jobs,
        loading,
        user,
        activePage,
        activeFilter,
        searchQuery,
        selectedTrackId,
        selectedPlaylistId,
        selectedCollectionId,
        sortBy,
        sortDesc,
        layoutMode,
        filterGenre,
        filterKeyGroup,
        filterKey,
        settings,
        currentTrack,
        isPlaying,
        currentTime,
        durationSeconds,
        loop,
        cues,
        volume,
        audioRef,
        
        setActivePage,
        setActiveFilter,
        setSearchQuery,
        setSelectedTrackId,
        setSelectedPlaylistId,
        setSelectedCollectionId,
        setSortBy,
        setSortDesc,
        setLayoutMode,
        setFilterGenre,
        setFilterKeyGroup,
        setFilterKey,
        updateSetting,
        
        fetchLibrary,
        uploadFiles,
        deleteTrack,
        updateTrackMetadata,
        createPlaylist,
        updatePlaylistTracks,
        deletePlaylist,
        createCollection,
        updateCollectionTracks,
        deleteCollection,
        reEnqueueAnalysis,
        logout,
        
        playTrack,
        togglePlayback,
        playNext,
        playPrev,
        toggleLoop,
        toggleTrackFavorite,
        seekPlayer,
        saveCues,
        setVolume
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

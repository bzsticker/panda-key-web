// src/components/MiniPlayer.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useApp, Track } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  ZoomIn, 
  ZoomOut, 
  Flag, 
  Volume2, 
  VolumeX, 
  Undo 
} from 'lucide-react';

// Predefined colors for Cues 1-8
const CUE_COLORS = [
  '#ff3b30', // Red (Cue 1)
  '#ff9500', // Orange (Cue 2)
  '#ffcc00', // Yellow (Cue 3)
  '#4cd964', // Green (Cue 4)
  '#5ac8fa', // Cyan (Cue 5)
  '#007aff', // Blue (Cue 6)
  '#5856d6', // Purple (Cue 7)
  '#ff2d55'  // Pink (Cue 8)
];

// Helper to format seconds to MM:SS
function formatTime(secs: number): string {
  if (isNaN(secs) || !isFinite(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Helper to format cue time to MM:SS.mmm
function formatCueTime(secs: number): string {
  if (isNaN(secs) || !isFinite(secs) || secs < 0) return '00:00.000';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export default function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    durationSeconds,
    loop,
    togglePlayback,
    playNext,
    playPrev,
    toggleLoop,
    seekPlayer,
    cues,
    saveCues,
    volume,
    setVolume,
    audioRef,
    settings,
    fetchLibrary,
    updateTrackMetadata
  } = useApp();

  const t = getTranslation(settings.language);

  // Wavesurfer state
  const [wavesurfer, setWavesurfer] = useState<any>(null);
  const [regionsPlugin, setRegionsPlugin] = useState<any>(null);
  const [zoom, setZoom] = useState(0); // 0 means fit container width
  const [undoStack, setUndoStack] = useState<Array<typeof cues>>([]);
  const [prevVolume, setPrevVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  // DJ Deck States
  const [pitchOffset, setPitchOffset] = useState(0); // -10% to +10%
  const [isNudging, setIsNudging] = useState(0); // temporary speed adjustment (-0.03 or 0.03)
  const [keyLock, setKeyLock] = useState(true); // preserves pitch
  const [djCuePoint, setDjCuePoint] = useState(0); // temporary cue point
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);

  // Edit Cue Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCueForEdit, setSelectedCueForEdit] = useState<any>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');

  // Refs for DOM nodes
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Keep references to avoid re-binding keydown event listener frequently
  const currentTimeRef = useRef(currentTime);
  const cuesRef = useRef(cues);
  const currentTrackRef = useRef(currentTrack);
  const isDraggingRef = useRef(false);
  const dragStartCueTimeRef = useRef(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isLoopActiveRef = useRef(isLoopActive);
  const loopStartRef = useRef(loopStart);
  const loopEndRef = useRef(loopEnd);
  const isCuePreviewingRef = useRef(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
    cuesRef.current = cues;
    currentTrackRef.current = currentTrack;
  }, [currentTime, cues, currentTrack]);

  useEffect(() => {
    isLoopActiveRef.current = isLoopActive;
    loopStartRef.current = loopStart;
    loopEndRef.current = loopEnd;
  }, [isLoopActive, loopStart, loopEnd]);

  // Reset DJ state on track change
  useEffect(() => {
    setPitchOffset(0);
    setIsNudging(0);
    setDjCuePoint(0);
    setLoopStart(null);
    setLoopEnd(null);
    setIsLoopActive(false);
  }, [currentTrack?.id]);

  // Sync Audio Properties (Tempo, Key Lock, Nudging)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Apply Key Lock (preserves pitch)
    audio.preservesPitch = keyLock;
    (audio as any).mozPreservesPitch = keyLock;
    (audio as any).webkitPreservesPitch = keyLock;

    // Calculate actual speed based on pitch slider and nudging
    const baseRate = 1 + (pitchOffset / 100);
    const actualRate = baseRate + isNudging;
    const clampedRate = Math.max(0.06, Math.min(16.0, actualRate));
    
    audio.playbackRate = clampedRate;

    if (wavesurfer) {
      wavesurfer.setPlaybackRate(clampedRate);
    }
  }, [pitchOffset, isNudging, keyLock, wavesurfer, currentTrack?.id, audioRef]);

  // High-precision loop checker (runs on animation frames)
  useEffect(() => {
    let animFrameId: number;
    const audio = audioRef.current;
    if (!audio) return;

    const checkLoop = () => {
      if (isLoopActiveRef.current && loopStartRef.current !== null && loopEndRef.current !== null) {
        if (audio.currentTime >= loopEndRef.current) {
          audio.currentTime = loopStartRef.current;
          seekPlayer(loopStartRef.current);
        }
      }
      animFrameId = requestAnimationFrame(checkLoop);
    };

    if (isPlaying) {
      animFrameId = requestAnimationFrame(checkLoop);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [isPlaying, seekPlayer, audioRef]);

  // 1. Initialize WaveSurfer client-side
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!currentTrack || !audioEl || !waveformContainerRef.current) return;

    let ws: any = null;
    let rp: any = null;

    const initWaveSurfer = async () => {
      // Dynamic imports to prevent SSR errors
      const { default: WaveSurfer } = await import('wavesurfer.js');
      const { default: RegionsPlugin } = await import('wavesurfer.js/dist/plugins/regions.js');

      if (!waveformContainerRef.current) return;

      ws = WaveSurfer.create({
        container: waveformContainerRef.current,
        waveColor: 'rgba(0, 191, 255, 0.25)',
        progressColor: 'rgba(0, 191, 255, 0.65)',
        cursorColor: 'var(--accent-cyan)',
        cursorWidth: 2,
        height: 90,
        media: audioEl,
        url: `/api/tracks/${currentTrack.id}/audio`,
        minPxPerSec: zoom,
        fillParent: zoom === 0,
        interact: true
      });

      // Regions plugin
      rp = ws.registerPlugin(RegionsPlugin.create());
      setRegionsPlugin(rp);
      setWavesurfer(ws);
    };

    initWaveSurfer();

    return () => {
      if (ws) ws.destroy();
      setWavesurfer(null);
      setRegionsPlugin(null);
    };
  }, [currentTrack?.id]);

  // 2. Handle Zoom updates
  useEffect(() => {
    if (wavesurfer) {
      wavesurfer.setOptions({
        minPxPerSec: zoom,
        fillParent: zoom === 0
      });
    }
  }, [zoom, wavesurfer]);

  // 3. Manage Timeline Plugin lifecycle with Bar calculation
  useEffect(() => {
    if (!wavesurfer || !timelineContainerRef.current) return;

    let timelinePlugin: any = null;

    const initTimeline = async () => {
      const { default: TimelinePlugin } = await import('wavesurfer.js/dist/plugins/timeline.js');

      const timelineOptions = {
        container: timelineContainerRef.current!,
        height: 20,
        get timeInterval() {
          const duration = wavesurfer.getDuration();
          if (!duration || !isFinite(duration) || duration <= 0) {
            return Infinity; // Safe value to prevent infinite loop during loading
          }

          const bpm = currentTrack?.bpm && currentTrack.bpm > 0 ? currentTrack.bpm : 120;
          const beatDuration = 60 / bpm;
          const barDuration = beatDuration * 4;

          let pxPerSec = zoom;
          if (zoom === 0) {
            const containerWidth = wavesurfer.getWidth() || timelineContainerRef.current?.clientWidth || 800;
            pxPerSec = containerWidth / duration;
          }
          if (pxPerSec <= 0) pxPerSec = 5;

          const minIntervalSec = 45 / pxPerSec;
          const possibleBarIntervals = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
          let chosenBarInterval = 1;
          for (const barInt of possibleBarIntervals) {
            if (barInt * barDuration >= minIntervalSec) {
              chosenBarInterval = barInt;
              break;
            }
          }
          return chosenBarInterval * barDuration;
        },
        get primaryLabelInterval() {
          return this.timeInterval;
        },
        formatTimeCallback: (secs: number) => {
          const bpm = currentTrack?.bpm && currentTrack.bpm > 0 ? currentTrack.bpm : 120;
          const beatDuration = 60 / bpm;
          const barDuration = beatDuration * 4;

          // Parse grid offset from comments
          let gridOffset = 0;
          if (currentTrack?.comments) {
            const match = currentTrack.comments.match(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/);
            if (match) {
              gridOffset = parseFloat(match[1]);
            }
          }

          const adjustedSecs = Math.max(0, secs - gridOffset);
          const totalBeats = Math.round((adjustedSecs / beatDuration) * 100) / 100;
          const bar = Math.floor(totalBeats / 4) + 1;
          const beat = Math.round(totalBeats % 4) + 1;

          const duration = wavesurfer.getDuration();
          if (!duration || !isFinite(duration) || duration <= 0) {
            return `${bar}`;
          }

          let pxPerSec = zoom;
          if (zoom === 0) {
            const containerWidth = wavesurfer.getWidth() || timelineContainerRef.current?.clientWidth || 800;
            pxPerSec = containerWidth / duration;
          }
          if (pxPerSec <= 0) pxPerSec = 5;

          const minIntervalSec = 45 / pxPerSec;
          const possibleBarIntervals = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
          let chosenBarInterval = 1;
          for (const barInt of possibleBarIntervals) {
            if (barInt * barDuration >= minIntervalSec) {
              chosenBarInterval = barInt;
              break;
            }
          }

          if (chosenBarInterval < 1) {
            const displayBeat = beat > 4 ? 1 : beat;
            const displayBar = beat > 4 ? bar + 1 : bar;
            return `${displayBar}.${displayBeat}`;
          }
          return `${bar}`;
        }
      };

      timelinePlugin = TimelinePlugin.create(timelineOptions);
      wavesurfer.registerPlugin(timelinePlugin);
    };

    initTimeline();

    return () => {
      if (timelinePlugin) {
        try {
          wavesurfer.unregisterPlugin(timelinePlugin);
          timelinePlugin.destroy();
        } catch (e) {
          // Ignore errors during cleanup of destroyed wavesurfer
        }
      }
    };
  }, [wavesurfer, zoom, currentTrack?.id, currentTrack?.bpm, currentTrack?.comments]);

  // Helper to create flag DOM element for a region
  const createRegionContent = (cue: typeof cues[0]) => {
    const flag = document.createElement('div');
    flag.className = 'cue-flag';
    flag.style.backgroundColor = cue.color;
    flag.style.borderColor = cue.color;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = cue.label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'cue-flag-time';
    timeSpan.textContent = formatCueTime(cue.time);

    flag.appendChild(labelSpan);
    flag.appendChild(timeSpan);

    return flag;
  };

  // 3. Render Cue point regions in WaveSurfer
  useEffect(() => {
    if (!regionsPlugin || !wavesurfer) return;
    if (isDraggingRef.current) return;

    // Define handlers first so they can be attached directly in the loop
    const handleDragStart = (region: any) => {
      if (region.id === 'active-loop') return;
      isDraggingRef.current = true;
      dragStartCueTimeRef.current = region.start;
    };

    const handleRegionUpdated = (region: any) => {
      if (region.id === 'active-loop') {
        setLoopStart(region.start);
        setLoopEnd(region.end);
        return;
      }

      // Update DOM text directly for performance to avoid lag during drag
      const timeEl = region.element?.querySelector('.cue-flag-time');
      if (timeEl) {
        timeEl.textContent = formatCueTime(region.start);
      }

      // Debounced database update
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (!currentTrackRef.current) return;
        
        // Push original to undo stack before saving
        setUndoStack(prev => {
          const newStack = [...prev, cuesRef.current];
          if (newStack.length > 20) newStack.shift();
          return newStack;
        });

        const updatedCues = cuesRef.current.map(c => {
          if (c.id === region.id) {
            return { ...c, time: region.start };
          }
          return c;
        });
        saveCues(currentTrackRef.current.id, updatedCues);
        isDraggingRef.current = false;
      }, 500);
    };

    const handleRegionClicked = (region: any, e: MouseEvent) => {
      e.stopPropagation();
      if (region.id === 'active-loop') return;
      seekPlayer(region.start);
    };

    const handleRegionDoubleClicked = (region: any, e: MouseEvent) => {
      e.stopPropagation();
      if (region.id === 'active-loop') return;
      const cue = cuesRef.current.find(c => c.id === region.id);
      if (!cue) return;
      setSelectedCueForEdit(cue);
      setEditLabel(cue.label);
      setEditColor(cue.color);
      setIsEditModalOpen(true);
    };

    const handleContextMenu = (region: any, e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (region.id === 'active-loop') return;
      if (!currentTrackRef.current) return;
      
      const confirmDelete = window.confirm(
        settings.language === 'th' 
          ? `คุณต้องการลบจุดคิว ${region.id.replace('cue-', '')} ใช่หรือไม่?`
          : `Are you sure you want to delete Cue ${region.id.replace('cue-', '')}?`
      );
      if (confirmDelete) {
        setUndoStack(prev => [...prev, cuesRef.current]);
        const updatedCues = cuesRef.current.filter(c => c.id !== region.id);
        saveCues(currentTrackRef.current.id, updatedCues);
      }
    };

    // Clear existing regions to prevent duplication
    // Keep active loop region if it exists
    const loopRegion = regionsPlugin.getRegions().find((r: any) => r.id === 'active-loop');
    regionsPlugin.clearRegions();
    if (loopRegion) {
      regionsPlugin.addRegion(loopRegion);
    }

    // Create regions and attach handlers directly
    cues.forEach(cue => {
      const reg = regionsPlugin.addRegion({
        id: cue.id,
        start: cue.time,
        end: cue.time,
        drag: true,
        color: 'transparent', // Make region rectangle invisible, we style the border
        content: createRegionContent(cue)
      });

      if (reg.element) {
        reg.element.style.borderLeft = `2px solid ${cue.color}`;
        reg.element.style.overflow = 'visible';
        reg.element.addEventListener('contextmenu', (e: MouseEvent) => handleContextMenu(reg, e));
      }

      reg.on('update', () => handleDragStart(reg));
    });

    // Subscriptions
    regionsPlugin.on('region-updated', handleRegionUpdated);
    regionsPlugin.on('region-clicked', handleRegionClicked);
    regionsPlugin.on('region-double-clicked', handleRegionDoubleClicked);

    // Clean up
    return () => {
      regionsPlugin.un('region-updated', handleRegionUpdated);
      regionsPlugin.un('region-clicked', handleRegionClicked);
      regionsPlugin.un('region-double-clicked', handleRegionDoubleClicked);
    };

  }, [cues, regionsPlugin, wavesurfer]);

  // Manage Visual Loop Region in WaveSurfer
  useEffect(() => {
    if (!regionsPlugin) return;

    const loopRegionId = 'active-loop';

    try {
      const existing = regionsPlugin.getRegions().find((r: any) => r.id === loopRegionId);
      if (existing) {
        existing.remove();
      }
    } catch (e) {}

    if (isLoopActive && loopStart !== null && loopEnd !== null) {
      try {
        const reg = regionsPlugin.addRegion({
          id: loopRegionId,
          start: loopStart,
          end: loopEnd,
          color: 'rgba(76, 217, 100, 0.18)', // transparent green
          drag: true,
          resize: true
        });
        if (reg.element) {
          reg.element.style.borderLeft = '2px solid #4cd964';
          reg.element.style.borderRight = '2px solid #4cd964';
        }
      } catch (e) {
        console.error('Error adding loop region:', e);
      }
    }
  }, [isLoopActive, loopStart, loopEnd, regionsPlugin]);

  // Global Keyboard Hotkeys (1-8 to jump, Shift + 1-8 to record)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        e.preventDefault();
        if (!currentTrackRef.current) return;

        const cueId = `cue-${num}`;

        if (e.shiftKey) {
          // Record new Cue Point
          setUndoStack(prev => [...prev, cuesRef.current]);

          const updatedCues = [...cuesRef.current];
          const idx = updatedCues.findIndex(c => c.id === cueId);
          const newCue = {
            id: cueId,
            time: currentTimeRef.current,
            label: `Cue ${num}`,
            color: CUE_COLORS[num - 1]
          };

          if (idx >= 0) {
            updatedCues[idx] = newCue;
          } else {
            updatedCues.push(newCue);
          }
          saveCues(currentTrackRef.current.id, updatedCues);
        } else {
          // Jump to Cue Point
          const cue = cuesRef.current.find(c => c.id === cueId);
          if (cue) {
            seekPlayer(cue.time);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [saveCues]);

  // DJ Cue button handlers
  const handleCueMouseDown = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      // If playing, CUE pauses and seeks back to cue point
      audio.pause();
      audio.currentTime = djCuePoint;
      seekPlayer(djCuePoint);
      togglePlayback(); // sets isPlaying = false
    } else {
      // If paused, if we are at a new position, tapping sets it
      const diff = Math.abs(currentTime - djCuePoint);
      if (diff > 0.08) {
        setDjCuePoint(currentTime);
      } else {
        // Hold to play preview
        isCuePreviewingRef.current = true;
        audio.currentTime = djCuePoint;
        audio.play().catch(() => {});
      }
    }
  };

  const handleCueMouseUp = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isCuePreviewingRef.current) {
      isCuePreviewingRef.current = false;
      audio.pause();
      audio.currentTime = djCuePoint;
      seekPlayer(djCuePoint);
    }
  };

  // Hot Cue Pad click handlers
  const handleHotCueClick = (slot: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentTrack) return;

    const cueId = `cue-${slot}`;
    const cue = cues.find(c => c.id === cueId);

    if (e.shiftKey) {
      // Shift + Click to clear/delete
      if (cue) {
        const confirmDelete = window.confirm(
          settings.language === 'th'
            ? `คุณต้องการลบจุดคิว ${slot} ใช่หรือไม่?`
            : `Delete Cue ${slot}?`
        );
        if (confirmDelete) {
          setUndoStack(prev => [...prev, cues]);
          const updatedCues = cues.filter(c => c.id !== cueId);
          saveCues(currentTrack.id, updatedCues);
        }
      }
      return;
    }

    if (cue) {
      // Jump and play
      seekPlayer(cue.time);
      if (!isPlaying) {
        togglePlayback();
      }
    } else {
      // Record new cue point at slot
      setUndoStack(prev => [...prev, cues]);
      const newCue = {
        id: cueId,
        time: currentTime,
        label: `Cue ${slot}`,
        color: CUE_COLORS[slot - 1]
      };
      saveCues(currentTrack.id, [...cues, newCue]);
    }
  };

  const handleHotCueContextMenu = (slot: number, e: React.MouseEvent) => {
    e.preventDefault();
    const cueId = `cue-${slot}`;
    const cue = cues.find(c => c.id === cueId);
    if (cue) {
      setSelectedCueForEdit(cue);
      setEditLabel(cue.label);
      setEditColor(cue.color);
      setIsEditModalOpen(true);
    }
  };

  // Looping actions
  const handleLoopIn = () => {
    setLoopStart(currentTime);
    if (loopEnd !== null && loopEnd > currentTime) {
      setIsLoopActive(true);
    }
  };

  const handleLoopOut = () => {
    if (loopStart !== null && currentTime > loopStart) {
      setLoopEnd(currentTime);
      setIsLoopActive(true);
    } else {
      setLoopStart(0);
      setLoopEnd(currentTime);
      setIsLoopActive(true);
    }
  };

  const handleReloopExit = () => {
    if (isLoopActive) {
      setIsLoopActive(false);
    } else if (loopStart !== null && loopEnd !== null) {
      setIsLoopActive(true);
      seekPlayer(loopStart);
    }
  };

  const handleLoopHalve = () => {
    if (loopStart !== null && loopEnd !== null) {
      const len = loopEnd - loopStart;
      const newEnd = loopStart + (len / 2);
      setLoopEnd(newEnd);
    }
  };

  const handleLoopDouble = () => {
    if (loopStart !== null && loopEnd !== null) {
      const len = loopEnd - loopStart;
      const newEnd = loopStart + (len * 2);
      const maxDuration = durationSeconds || currentTrack?.duration || 0;
      setLoopEnd(Math.min(maxDuration, newEnd));
    }
  };

  const handleAutoLoop = (beats: number) => {
    if (!currentTrack) return;
    const bpm = currentTrack.bpm && currentTrack.bpm > 0 ? currentTrack.bpm : 120;
    const beatDuration = 60 / bpm;
    const duration = beatDuration * beats;
    const start = currentTime;
    const end = Math.min(durationSeconds || currentTrack.duration, start + duration);
    setLoopStart(start);
    setLoopEnd(end);
    setIsLoopActive(true);
    seekPlayer(start);
  };

  // Tempo/Nudge actions
  const handleNudgeStart = (direction: number) => {
    setIsNudging(direction * 0.03); // Temp speed adjustment of 3%
  };

  const handleNudgeEnd = () => {
    setIsNudging(0);
  };

  const handleResetTempo = () => {
    setPitchOffset(0);
  };

  // Save Cue Modal Changes
  const handleSaveCueEdit = () => {
    if (!currentTrack || !selectedCueForEdit) return;

    setUndoStack(prev => [...prev, cues]);

    const updatedCues = cues.map(c => {
      if (c.id === selectedCueForEdit.id) {
        return { ...c, label: editLabel, color: editColor };
      }
      return c;
    });

    saveCues(currentTrack.id, updatedCues);
    setIsEditModalOpen(false);
    setSelectedCueForEdit(null);
  };

  // Delete Cue Point helper
  const handleDeleteCue = (cueId: string) => {
    if (!currentTrack || !selectedCueForEdit) return;

    setUndoStack(prev => [...prev, cues]);
    const updatedCues = cues.filter(c => c.id !== cueId);
    saveCues(currentTrack.id, updatedCues);
    setIsEditModalOpen(false);
    setSelectedCueForEdit(null);
  };

  // Undo Handler
  const handleUndo = () => {
    if (undoStack.length === 0 || !currentTrack) return;
    const previousCues = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    saveCues(currentTrack.id, previousCues);
  };

  // Volume slider and mute controls
  const handleMuteToggle = () => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleShiftGrid = async (amount: number) => {
    if (!currentTrack) return;
    
    // Parse existing offset
    let gridOffset = 0;
    let baseComments = currentTrack.comments || '';
    const match = baseComments.match(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/);
    if (match) {
      gridOffset = parseFloat(match[1]);
      baseComments = baseComments.replace(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/, '').trim();
    }
    
    const newOffset = Math.max(-10, Math.min(10, gridOffset + amount));
    const newComments = `${baseComments} [grid_offset=${newOffset.toFixed(3)}]`.trim();
    
    try {
      await updateTrackMetadata(currentTrack.id, { comments: newComments });
    } catch (err) {
      console.error('Failed to shift beat grid:', err);
    }
  };

  const handleSetFirstBeat = async () => {
    if (!currentTrack) return;
    
    let baseComments = currentTrack.comments || '';
    baseComments = baseComments.replace(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/, '').trim();
    
    const newOffset = currentTime;
    const newComments = `${baseComments} [grid_offset=${newOffset.toFixed(3)}]`.trim();
    
    try {
      await updateTrackMetadata(currentTrack.id, { comments: newComments });
    } catch (err) {
      console.error('Failed to set first beat downbeat:', err);
    }
  };

  // Render when no track is loaded
  if (!currentTrack) {
    return (
      <div className="mini-player panel" id="miniPlayer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '110px', color: 'var(--text-muted)' }}>
          <b>{settings.language === 'th' ? 'กรุณาเลือกเพลงเพื่อเริ่มต้นเล่น' : 'Select a track to start playback'}</b>
        </div>
      </div>
    );
  }

  // Key displaying helper
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

  return (
    <div className={`mini-player panel ${isPlaying ? 'playing' : ''}`} id="miniPlayer">
      
      {/* Tier 1: Waveform Panel */}
      <div className="waveform-panel">
        <div ref={waveformContainerRef} id="waveform" />
        <div ref={timelineContainerRef} id="timeline" />
      </div>

      {/* Tier 2: DJ Deck Interface */}
      <div className="dj-deck-container">
        
        {/* Left Section: Deck Control (PLAY/PAUSE, CUE, SYNC) */}
        <div className="dj-deck-left">
          <button 
            className={`dj-big-btn dj-cue-btn ${!isPlaying && Math.abs(currentTime - djCuePoint) <= 0.08 ? 'cue-active' : ''}`}
            onMouseDown={handleCueMouseDown}
            onMouseUp={handleCueMouseUp}
            onMouseLeave={handleCueMouseUp}
            onTouchStart={handleCueMouseDown}
            onTouchEnd={handleCueMouseUp}
            title={settings.language === 'th' ? 'กดคิวชั่วคราว (Hold ค้างเพื่อพรีวิว)' : 'DJ Cue (Hold to preview)'}
          >
            CUE
          </button>
          
          <button 
            className={`dj-big-btn dj-play-btn ${isPlaying ? 'play-active' : ''}`}
            onClick={togglePlayback}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>

          <button 
            className="dj-sync-btn"
            onClick={handleResetTempo}
            title={settings.language === 'th' ? 'รีเซ็ตความเร็วกลับสู่ค่าเริ่มต้น' : 'Reset Tempo to Original'}
          >
            SYNC
          </button>
        </div>

        {/* Center Section: Track Info, Hot Cues Grid, Loop Control Row */}
        <div className="dj-deck-center">
          
          {/* Top metadata & timing */}
          <div className="dj-track-meta-row">
            <div className="player-track-info">
              <b className="track-title" title={currentTrack.title}>{currentTrack.title}</b>
              <span className="track-artist" title={currentTrack.artist}>{currentTrack.artist || 'Unknown Artist'}</span>
            </div>
            
            <div className="dj-stats-row">
              <div className="stat-item">
                <span className="stat-label">Key</span>
                <span className="stat-value" style={{ color: keyColors[currentTrack.camelot_key] || '#fff' }}>
                  {displayKey(currentTrack.camelot_key)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Energy</span>
                <span className="stat-value" style={{ color: 'var(--accent-purple)' }}>
                  {currentTrack.energy || 5}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">BPM</span>
                <span className="stat-value">
                  {((currentTrack.bpm || 120) * (1 + (pitchOffset / 100))).toFixed(1)}
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    ({currentTrack.bpm})
                  </span>
                </span>
              </div>
            </div>

            <div className="time-display-large">
              <span className="time-current">{formatTime(currentTime)}</span>
              <span className="time-divider">/</span>
              <span className="time-total">{formatTime(durationSeconds || currentTrack.duration)}</span>
            </div>
          </div>

          {/* Hot Cue Pads Grid (8 pads) */}
          <div className="hot-cue-section">
            <span className="section-title">Hot Cues</span>
            <div className="hot-cue-grid">
              {Array.from({ length: 8 }).map((_, idx) => {
                const slot = idx + 1;
                const cueId = `cue-${slot}`;
                const cue = cues.find(c => c.id === cueId);
                const color = CUE_COLORS[idx];
                
                return (
                  <button
                    key={cueId}
                    className={`hot-cue-pad ${cue ? 'has-cue' : 'empty'}`}
                    style={{
                      borderColor: color,
                      boxShadow: cue ? `0 0 8px ${color}50` : 'none',
                      backgroundColor: cue ? `${color}30` : 'transparent',
                      color: cue ? '#fff' : `${color}aa`
                    }}
                    onClick={(e) => handleHotCueClick(slot, e)}
                    onContextMenu={(e) => handleHotCueContextMenu(slot, e)}
                    title={
                      cue
                        ? `${cue.label} (${formatTime(cue.time)}) - Click: Jump & Play, Shift+Click: Clear, Right-click: Edit`
                        : `Empty Slot ${slot} - Click to set Cue at current position`
                    }
                  >
                    <span className="pad-number" style={{ backgroundColor: color }}>{slot}</span>
                    <span className="pad-label">{cue ? cue.label : 'EMPTY'}</span>
                    <span className="pad-time">{cue ? formatTime(cue.time) : '--:--'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loop Row controls */}
          <div className="loop-section">
            <div className="loop-controls-wrapper">
              <span className="section-title">Loop Controls</span>
              
              <div className="loop-row">
                <button 
                  className={`btn-loop ${loopStart !== null && loopEnd === null ? 'active' : ''}`}
                  onClick={handleLoopIn}
                  title="Loop In (Set Start)"
                >
                  Loop In
                </button>
                <button 
                  className={`btn-loop ${isLoopActive ? 'active' : ''}`}
                  onClick={handleLoopOut}
                  title="Loop Out (Set End & Start Loop)"
                >
                  Loop Out
                </button>
                <button 
                  className={`btn-loop ${isLoopActive ? 'active-reloop' : ''}`}
                  onClick={handleReloopExit}
                  disabled={loopStart === null || loopEnd === null}
                  title="Exit / Reloop"
                >
                  Exit / Reloop
                </button>
                
                <div className="loop-divider" />
                
                <button className="btn-loop btn-loop-math" onClick={handleLoopHalve} disabled={!isLoopActive} title="Half Loop Size (1/2x)">
                  1/2x
                </button>
                <button className="btn-loop btn-loop-math" onClick={handleLoopDouble} disabled={!isLoopActive} title="Double Loop Size (2x)">
                  2x
                </button>
                
                <div className="loop-divider" />
                
                {/* Auto Loop Beat sizes */}
                {[0.5, 1, 2, 4, 8, 16].map((beats) => {
                  const label = beats === 0.5 ? '1/2' : String(beats);
                  return (
                    <button
                      key={`autoloop-${beats}`}
                      className="btn-loop btn-autoloop"
                      onClick={() => handleAutoLoop(beats)}
                      title={`Auto Loop ${beats} Beat(s)`}
                    >
                      {label}B
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Pitch & Tempo Control (Vertical Tempo Fader, Nudge, Key Lock) */}
        <div className="dj-deck-right">
          <div className="pitch-info">
            <span className="pitch-percent">
              {pitchOffset >= 0 ? '+' : ''}{pitchOffset.toFixed(2)}%
            </span>
            <button 
              className={`key-lock-btn ${keyLock ? 'active' : ''}`}
              onClick={() => setKeyLock(!keyLock)}
              title="Key Lock / Master Tempo"
            >
              🔑 KEY LOCK
            </button>
          </div>

          <div className="pitch-fader-container">
            <button 
              className="nudge-btn nudge-minus"
              onMouseDown={() => handleNudgeStart(-1)}
              onMouseUp={handleNudgeEnd}
              onMouseLeave={handleNudgeEnd}
              onTouchStart={() => handleNudgeStart(-1)}
              onTouchEnd={handleNudgeEnd}
              title="Nudge Tempo Down (-)"
            >
              -
            </button>
            
            <div className="vertical-slider-wrapper">
              <input 
                type="range"
                min="-10"
                max="10"
                step="0.05"
                value={pitchOffset}
                onChange={(e) => setPitchOffset(parseFloat(e.target.value))}
                onDoubleClick={handleResetTempo}
                className="vertical-pitch-slider"
                title="Tempo Slider (Double-click to reset)"
              />
            </div>
            
            <button 
              className="nudge-btn nudge-plus"
              onMouseDown={() => handleNudgeStart(1)}
              onMouseUp={handleNudgeEnd}
              onMouseLeave={handleNudgeEnd}
              onTouchStart={() => handleNudgeStart(1)}
              onTouchEnd={handleNudgeEnd}
              title="Nudge Tempo Up (+)"
            >
              +
            </button>
          </div>

          <div className="deck-right-bottom">
            {/* Zoom / Beat Grid / Volume Panel in compact styling */}
            <div className="compact-controls-grid">
              
              {/* Zoom row */}
              <div className="control-row">
                <span className="compact-label">Zoom</span>
                <button className="compact-btn" onClick={() => setZoom(prev => Math.max(0, prev - 10))} disabled={zoom <= 0}>-</button>
                <button className="compact-btn" onClick={() => setZoom(prev => (prev === 0 ? 10 : prev + 10))} disabled={zoom >= 150}>+</button>
              </div>

              {/* Grid shift row */}
              <div className="control-row">
                <span className="compact-label">Grid</span>
                <button className="compact-btn" onClick={() => handleShiftGrid(-0.01)}>◀</button>
                <button className="compact-btn" onClick={handleSetFirstBeat} style={{ fontSize: '9px', fontWeight: 'bold' }}>Set 1st</button>
                <button className="compact-btn" onClick={() => handleShiftGrid(0.01)}>▶</button>
              </div>

              {/* Volume & Loop row */}
              <div className="control-row-volume">
                <button 
                  className="compact-icon-btn" 
                  onClick={handleMuteToggle}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={isMuted ? 0 : volume} 
                  onChange={handleVolumeChange} 
                  className="compact-volume-slider"
                />
                <button 
                  className="compact-icon-btn"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  title="Undo Last Action"
                >
                  <Undo size={13} />
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Edit Cue Point Modal */}
      {isEditModalOpen && selectedCueForEdit && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '320px' }}>
            <h3 className="modal-title" style={{ marginBottom: '16px' }}>
              {settings.language === 'th' ? 'แก้ไขจุดคิว' : 'Edit Cue Point'}
            </h3>
            
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', display: 'block', marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                {settings.language === 'th' ? 'ป้ายข้อความ:' : 'Label:'}
              </label>
              <input 
                type="text" 
                value={editLabel} 
                onChange={e => setEditLabel(e.target.value)}
                className="btn-control" 
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'rgba(0,0,0,0.2)' }}
                placeholder={selectedCueForEdit.label}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', display: 'block', marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                {settings.language === 'th' ? 'สีจุดคิว:' : 'Color:'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {CUE_COLORS.map(c => (
                  <div 
                    key={c}
                    onClick={() => setEditColor(c)}
                    style={{
                      backgroundColor: c,
                      width: '36px',
                      height: '36px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: editColor === c ? '3px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                      boxShadow: editColor === c ? '0 0 10px rgba(255,255,255,0.6)' : '',
                      transition: 'all 0.1s ease'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                className="btn-control"
                onClick={() => handleDeleteCue(selectedCueForEdit.id)}
                style={{ marginRight: 'auto', color: 'var(--accent-red)', borderColor: 'rgba(255, 59, 48, 0.3)', background: 'rgba(255, 59, 48, 0.05)' }}
              >
                {settings.language === 'th' ? 'ลบจุดคิว' : 'Delete'}
              </button>
              <button 
                className="btn-control"
                onClick={() => setIsEditModalOpen(false)}
              >
                {settings.language === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button 
                className="btn-control active"
                onClick={handleSaveCueEdit}
              >
                {settings.language === 'th' ? 'บันทึก' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

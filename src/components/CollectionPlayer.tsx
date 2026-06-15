// src/components/CollectionPlayer.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Play, Pause, Volume2, VolumeX, Zap, RefreshCcw } from 'lucide-react';

// Predefined colors for key matching
const keyColors: Record<string, string> = {
  '12B':'#18d5ff', '1B':'#37f1af', '2B':'#a4f369', '3B':'#ffd65b',
  '4B':'#ff934e', '5B':'#ff607b', '6B':'#e55af1', '7B':'#aa62ff',
  '8B':'#69a3ff', '9B':'#42d3ff', '10B':'#18d5ff', '11B':'#23f2bd',
  '12A':'#00bfff', '1A':'#18ffb0', '2A':'#27e38c', '3A':'#ffd600',
  '4A':'#ffaa00', '5A':'#ff4b5c', '6A':'#ff5074', '7A':'#ec5bff',
  '8A':'#ec5bff', '9A':'#16b7ff', '10A':'#00d8ff', '11A':'#2fb8ff'
};

const CUE_COLORS = [
  '#ff3b30', // Red
  '#ff9500', // Orange
  '#ffcc00', // Yellow
  '#4cd964', // Green
  '#5ac8fa', // Light Blue
  '#007aff', // Blue
  '#5856d6', // Purple
  '#ff2d55'  // Pink
];

// Global cache to store analyzed waveforms
const waveformCache = new Map<string, Array<{ amplitude: number; r: number; g: number; b: number }>>();

// Global cache to store decoded audio buffers for reverse playback
const audioBufferCache = new Map<string, AudioBuffer>();

// Helper to format seconds to MM:SS:CC (minutes:seconds:centiseconds) for pro DJ feel
function formatProTime(secs: number): string {
  if (isNaN(secs) || !isFinite(secs) || secs < 0) return '00:00.00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const c = Math.floor((secs % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export default function CollectionPlayer() {
  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    currentTime,
    durationSeconds,
    togglePlayback,
    seekPlayer,
    volume,
    setVolume,
    audioRef,
    settings,
    cues,
    saveCues,
    updateTrackMetadata
  } = useApp();

  const zoomedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeActiveRef = useRef<HTMLSpanElement | null>(null);

  // Drag-to-seek Refs
  const isDraggingOverviewRef = useRef(false);
  const isDraggingZoomedRef = useRef(false);
  const wasPlayingBeforeDragRef = useRef(false);
  const dragStartClientXRef = useRef(0);
  const dragStartAudioTimeRef = useRef(0);
  const seekFromMouseEventRef = useRef<(clientX: number) => void>(() => {});

  // DJ Player States
  const [waveform, setWaveform] = useState<Array<{ amplitude: number; r: number; g: number; b: number }> | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  
  const [djCuePoint, setDjCuePoint] = useState<number>(0);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Loop States
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);

  // Flux (Slip) & Reverse States
  const [isFluxActive, setIsFluxActive] = useState(false);
  const [inFluxState, setInFluxState] = useState(false);
  const [fluxStartRealTime, setFluxStartRealTime] = useState<number>(0);
  const [fluxStartAudioTime, setFluxStartAudioTime] = useState<number>(0);
  const [isReverseActive, setIsReverseActive] = useState(false);

  // Quantize & Waveform Zoom States
  const [zoomWindow, setZoomWindow] = useState<number>(12); // default zoom window (seconds)
  const [isQuantized, setIsQuantized] = useState<boolean>(true); // default true for DJ feel

  // Pitch & Key Lock (Master Tempo) States
  const [pitch, setPitch] = useState<number>(0);
  const [isKeyLock, setIsKeyLock] = useState<boolean>(true);

  // Quantize Snapping Helper
  const getNearestBeatTime = (time: number): number => {
    if (!currentTrack || !currentTrack.bpm) return time;
    const bpm = currentTrack.bpm;
    const beatSecs = 60 / bpm;
    
    // Retrieve grid offset from comments (e.g. [grid_offset=0.250])
    let gridOffset = 0;
    if (currentTrack.comments) {
      const match = currentTrack.comments.match(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/);
      if (match) {
        gridOffset = parseFloat(match[1]);
      }
    }
    
    const n = Math.round((time - gridOffset) / beatSecs);
    const target = gridOffset + n * beatSecs;
    const maxDur = durationSeconds || currentTrack.duration || 180;
    return Math.max(0, Math.min(maxDur, target));
  };

  // Web Audio Reverse Playback Refs
  const decodedAudioBufferRef = useRef<AudioBuffer | null>(null);
  const reverseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const reverseGainRef = useRef<GainNode | null>(null);
  const reverseCtxRef = useRef<AudioContext | null>(null);
  const reverseAnimRef = useRef<number | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.8);

  // 1. Asynchronous Audio Decoding & 3-Band Analysis
  useEffect(() => {
    if (!currentTrack) {
      Promise.resolve().then(() => {
        setWaveform(null);
        setDjCuePoint(0);
        setLoopStart(null);
        setLoopEnd(null);
        setIsLoopActive(false);
      });
      decodedAudioBufferRef.current = null;
      return;
    }

    // Default DJ Cue Point is 0 or first hot cue
    Promise.resolve().then(() => {
      setDjCuePoint(0);
      setLoopStart(null);
      setLoopEnd(null);
      setIsLoopActive(false);
    });

    if (waveformCache.has(currentTrack.id) && audioBufferCache.has(currentTrack.id)) {
      Promise.resolve().then(() => {
        setWaveform(waveformCache.get(currentTrack.id) || null);
      });
      decodedAudioBufferRef.current = audioBufferCache.get(currentTrack.id) || null;
      return;
    }

    let active = true;
    const analyzeAudio = async () => {
      setIsDecoding(true);
      try {
        const response = await fetch(`/api/tracks/${currentTrack.id}/audio`);
        if (!response.ok) throw new Error('Fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        if (!active) return;

        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (!active) return;

        audioBufferCache.set(currentTrack.id, audioBuffer);
        decodedAudioBufferRef.current = audioBuffer;

        const numPoints = 4000;
        const channelData = audioBuffer.getChannelData(0); // Left channel
        const step = Math.floor(channelData.length / numPoints);
        
        // Skip samples to speed up the loop processing
        const sampleStep = 8;

        // First pass: calculate raw values and find max RMS
        const rawPoints: Array<{ rms: number; lowRms: number; midRms: number; highRms: number }> = [];
        let maxRms = 0.0001;

        for (let i = 0; i < numPoints; i++) {
          const start = i * step;
          const end = Math.min(start + step, channelData.length);
          
          let sumSq = 0;
          let lowPassSumSq = 0;
          let diffSumSq = 0;
          
          let prevVal = 0;
          let prevLow = 0;
          let count = 0;

          for (let j = start; j < end; j += sampleStep) {
            const val = channelData[j];
            sumSq += val * val;

            // Bass: IIR Low-pass Filter
            const low = 0.94 * prevLow + 0.06 * val;
            lowPassSumSq += low * low;
            prevLow = low;

            // Treble: High-pass Filter
            const diff = val - prevVal;
            diffSumSq += diff * diff;
            prevVal = val;

            count++;
          }

          const rms = Math.sqrt(sumSq / (count || 1));
          const lowRms = Math.sqrt(lowPassSumSq / (count || 1));
          const highRms = Math.sqrt(diffSumSq / (count || 1)) * 1.8;
          const midRms = Math.max(0, rms - lowRms - highRms * 0.15);

          if (rms > maxRms) {
            maxRms = rms;
          }

          rawPoints.push({ rms, lowRms, midRms, highRms });
        }

        // Second pass: normalize and map to points (mix with pro DJ neon color palette)
        const points: Array<{ amplitude: number; r: number; g: number; b: number }> = [];
        for (const pt of rawPoints) {
          const lowW = pt.lowRms;
          const midW = pt.midRms;
          const highW = pt.highRms * 1.2; // boost high transients

          const totalW = lowW + midW + highW + 0.0001;

          // Target vectors:
          // Low: Neon Green [57, 255, 20]
          // Mid: Neon Pink [255, 0, 128]
          // High: Neon Cyan [0, 240, 255]
          const r = Math.floor((lowW * 57 + midW * 255 + highW * 0) / totalW);
          const g = Math.floor((lowW * 255 + midW * 0 + highW * 240) / totalW);
          const b = Math.floor((lowW * 20 + midW * 128 + highW * 255) / totalW);

          points.push({
            amplitude: Math.min(1.0, (pt.rms / maxRms) * 0.95), // Normalize to peak at 0.95
            r, g, b
          });
        }

        waveformCache.set(currentTrack.id, points);
        if (active) {
          setWaveform(points);
        }
      } catch (err) {
        console.error('Audio analysis error:', err);
        // Fallback: colored placeholder
        const dummy: Array<{ amplitude: number; r: number; g: number; b: number }> = [];
        for (let i = 0; i < 1200; i++) {
          const amp = 0.15 + 0.45 * Math.abs(Math.sin(i * 0.015)) * Math.random();
          dummy.push({
            amplitude: amp,
            r: i < 350 ? 57 : (i < 850 ? 255 : 0),
            g: i < 350 ? 255 : (i < 850 ? 0 : 240),
            b: i < 350 ? 20 : (i < 850 ? 128 : 255)
          });
        }
        if (active) setWaveform(dummy);
      } finally {
        if (active) setIsDecoding(false);
      }
    };

    analyzeAudio();
    return () => {
      active = false;
    };
  }, [currentTrack]);

  // Sync default DJ Cue Point with first fetched Hot Cue if available
  useEffect(() => {
    if (cues && cues.length > 0) {
      const firstCue = cues.find(c => c.id.startsWith('cue-'));
      if (firstCue) {
        Promise.resolve().then(() => {
          setDjCuePoint(firstCue.time);
        });
      }
    }
  }, [cues]);

  // 2. High-precision Loop Checker & Flux Manager
  useEffect(() => {
    if (!isPlaying) return;

    const audio = audioRef.current;
    if (!audio) return;

    const checkInterval = setInterval(() => {
      // Loop wrapping logic
      if (isLoopActive && loopStart !== null && loopEnd !== null) {
        if (audio.currentTime >= loopEnd) {
          if (isFluxActive && !inFluxState) {
            // Activate flux tracking
            setInFluxState(true);
            setFluxStartRealTime(Date.now());
            setFluxStartAudioTime(audio.currentTime);
          }
          audio.currentTime = loopStart;
          seekPlayer(loopStart);
        }
      }
    }, 15);

    return () => clearInterval(checkInterval);
  }, [isPlaying, isLoopActive, loopStart, loopEnd, isFluxActive, inFluxState, audioRef, seekPlayer]);

  // 3. Web Audio API Reverse Playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isReverseActive && isPlaying) {
      const buffer = decodedAudioBufferRef.current;
      if (!buffer) {
        // Fallback: If not decoded yet, use simulated seek back
        const fallbackInterval = setInterval(() => {
          if (audio.currentTime > 0.08) {
            audio.currentTime -= 0.16;
          } else {
            audio.currentTime = 0;
            setIsReverseActive(false);
            audio.pause();
          }
        }, 80);
        return () => clearInterval(fallbackInterval);
      }

      // We have the buffer! Play it in reverse using Web Audio API
      let ctx = reverseCtxRef.current;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        reverseCtxRef.current = ctx;
      }

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Pause HTML5 audio element
      audio.pause();

      // Create nodes
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = -1; // Play backwards

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume;
      reverseGainRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      reverseSourceRef.current = source;

      // Start playback from current position
      const startTime = audio.currentTime;
      source.start(0, startTime);

      const startRealTime = performance.now();

      const updatePlayhead = () => {
        const elapsed = (performance.now() - startRealTime) / 1000;
        const currentPos = startTime - elapsed;

        if (currentPos > 0) {
          audio.currentTime = currentPos;
          seekPlayer(currentPos);
          reverseAnimRef.current = requestAnimationFrame(updatePlayhead);
        } else {
          audio.currentTime = 0;
          seekPlayer(0);
          setIsReverseActive(false);
          setIsPlaying(false);
        }
      };

      reverseAnimRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      // Clean up reverse nodes if we stop reversing or pause
      if (reverseSourceRef.current) {
        try {
          reverseSourceRef.current.stop();
        } catch {}
        reverseSourceRef.current = null;
      }
      if (reverseAnimRef.current) {
        cancelAnimationFrame(reverseAnimRef.current);
        reverseAnimRef.current = null;
      }

      // If we stopped reversing but are still supposed to be playing, resume HTML5 audio
      if (isPlaying && !isReverseActive) {
        audio.play().catch(err => console.error("Error resuming audio after reverse:", err));
      }
    }

    return () => {
      if (reverseSourceRef.current) {
        try {
          reverseSourceRef.current.stop();
        } catch {}
      }
      if (reverseAnimRef.current) {
        cancelAnimationFrame(reverseAnimRef.current);
      }
    };
  }, [isReverseActive, isPlaying, seekPlayer, setIsPlaying, audioRef, volume]);

  // Sync reverse gain with player volume
  useEffect(() => {
    if (reverseGainRef.current) {
      reverseGainRef.current.gain.value = volume;
    }
  }, [volume]);

  // Clean up Web Audio Context on unmount
  useEffect(() => {
    return () => {
      if (reverseCtxRef.current) {
        reverseCtxRef.current.close().catch(err => console.error("Error closing reverse AudioContext:", err));
        reverseCtxRef.current = null;
      }
    };
  }, []);

  // Sync pitch and key lock to HTML5 audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Calculate playback rate (e.g. +2% pitch -> playbackRate = 1.02)
    const rate = 1 + pitch / 100;
    audio.playbackRate = rate;

    // Apply master tempo key lock
    if ('preservesPitch' in audio) {
      audio.preservesPitch = isKeyLock;
    }
  }, [pitch, isKeyLock, currentTrack, isPlaying, audioRef]);

  // Sync refs to avoid restarting the useEffect animation loop and causing stutter
  let initialGridOffset = 0;
  if (currentTrack?.comments) {
    const match = currentTrack.comments.match(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/);
    if (match) {
      initialGridOffset = parseFloat(match[1]);
    }
  }

  const drawParamsRef = useRef({
    loopStart,
    loopEnd,
    isLoopActive,
    inFluxState,
    fluxStartRealTime,
    fluxStartAudioTime,
    cues,
    isPlaying,
    currentTime,
    durationSeconds: durationSeconds || currentTrack?.duration || 180,
    bpm: currentTrack?.bpm || 0,
    gridOffset: initialGridOffset,
    zoomWindow
  });

  useEffect(() => {
    let gridOffset = 0;
    if (currentTrack?.comments) {
      const match = currentTrack.comments.match(/\[grid_offset=(-?\d+(?:\.\d+)?)\]/);
      if (match) {
        gridOffset = parseFloat(match[1]);
      }
    }
    drawParamsRef.current = {
      loopStart,
      loopEnd,
      isLoopActive,
      inFluxState,
      fluxStartRealTime,
      fluxStartAudioTime,
      cues,
      isPlaying,
      currentTime,
      durationSeconds: durationSeconds || currentTrack?.duration || 180,
      bpm: currentTrack?.bpm || 0,
      gridOffset,
      zoomWindow
    };
  }, [loopStart, loopEnd, isLoopActive, inFluxState, fluxStartRealTime, fluxStartAudioTime, cues, isPlaying, currentTime, durationSeconds, currentTrack, zoomWindow]);

  // 4. Combined Waveform Animation Loop
  useEffect(() => {
    const zoomedCanvas = zoomedCanvasRef.current;
    const overviewCanvas = overviewCanvasRef.current;
    if (!zoomedCanvas || !overviewCanvas || !waveform) return;

    const zCtx = zoomedCanvas.getContext('2d');
    const oCtx = overviewCanvas.getContext('2d');
    if (!zCtx || !oCtx) return;

    // Resize canvases to fit wrappers only on window resize or when waveform loads
    const resizeCanvases = () => {
      if (zoomedCanvas && zoomedCanvas.parentElement) {
        zoomedCanvas.width = zoomedCanvas.parentElement.clientWidth || 800;
      }
      zoomedCanvas.height = 130;

      if (overviewCanvas && overviewCanvas.parentElement) {
        overviewCanvas.width = overviewCanvas.parentElement.clientWidth || 800;
      }
      overviewCanvas.height = 48;
    };

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    let localAnimRef: number;

    const draw = () => {
      if (!waveform) return;

      const audio = audioRef.current;
      const params = drawParamsRef.current;

      const dur = params.durationSeconds;
      
      // Get smooth, real-time playhead directly from HTML5 Audio element
      const cur = audio ? audio.currentTime : params.currentTime;

      // Update time display directly on the DOM node for 60fps smooth counter
      if (timeActiveRef.current) {
        timeActiveRef.current.textContent = formatProTime(cur);
      }

      // Calculate background playhead if in Flux mode
      let bgPlayhead = cur;
      if (params.inFluxState) {
        const elapsed = (Date.now() - params.fluxStartRealTime) / 1000;
        bgPlayhead = Math.min(params.fluxStartAudioTime + elapsed, dur);
      }

      // ==========================================
      // A. DRAW ZOOMED SCROLLING WAVEFORM (Top)
      // ==========================================
      const zw = zoomedCanvas.width;
      const zh = zoomedCanvas.height;
      zCtx.clearRect(0, 0, zw, zh);

      // Dark Tech grid background
      zCtx.fillStyle = '#060a0f';
      zCtx.fillRect(0, 0, zw, zh);

      // Render scrolling waveform as a Solid Waveform with horizontal gradient
      const zoomWindow = params.zoomWindow || 12; 
      const startT = cur - zoomWindow / 2;
      
      const topPoints: Array<{x: number, y: number}> = [];
      const bottomPoints: Array<{x: number, y: number}> = [];
      const centerY = zh / 2;

      for (let x = 0; x < zw; x += 2) {
        const t = startT + (x / zw) * zoomWindow;
        if (t >= 0 && t <= dur) {
          const wIdx = Math.floor((t / dur) * waveform.length);
          if (wIdx >= 0 && wIdx < waveform.length) {
            const pt = waveform[wIdx];
            const halfH = pt.amplitude * (zh - 12) / 2;
            topPoints.push({ x, y: centerY - halfH });
            bottomPoints.push({ x, y: centerY + halfH });
          } else {
            topPoints.push({ x, y: centerY });
            bottomPoints.push({ x, y: centerY });
          }
        } else {
          topPoints.push({ x, y: centerY });
          bottomPoints.push({ x, y: centerY });
        }
      }

      if (topPoints.length > 0) {
        // Create horizontal linear gradient based on frequency colors
        const grad = zCtx.createLinearGradient(0, 0, zw, 0);
        const sampleCount = 20;
        for (let s = 0; s <= sampleCount; s++) {
          const ratio = s / sampleCount;
          const tVal = startT + ratio * zoomWindow;
          let r = 57, g = 255, b = 20; // fallback green
          if (tVal >= 0 && tVal <= dur) {
            const wIdx = Math.floor((tVal / dur) * waveform.length);
            if (wIdx >= 0 && wIdx < waveform.length) {
              r = waveform[wIdx].r;
              g = waveform[wIdx].g;
              b = waveform[wIdx].b;
            }
          }
          grad.addColorStop(ratio, `rgba(${r}, ${g}, ${b}, 0.85)`);
        }

        // 1. Draw solid fill
        zCtx.beginPath();
        zCtx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < topPoints.length; i++) {
          zCtx.lineTo(topPoints[i].x, topPoints[i].y);
        }
        for (let i = bottomPoints.length - 1; i >= 0; i--) {
          zCtx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
        }
        zCtx.closePath();
        zCtx.fillStyle = grad;
        zCtx.fill();

        // 2. Draw bright neon outline (Top and Bottom)
        zCtx.strokeStyle = grad;
        zCtx.lineWidth = 2.0;
        zCtx.lineCap = 'round';
        zCtx.lineJoin = 'round';
        zCtx.shadowBlur = 10;
        zCtx.shadowColor = 'rgba(0, 240, 255, 0.7)'; // Cyberpunk neon glow

        // Top line
        zCtx.beginPath();
        zCtx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < topPoints.length; i++) {
          zCtx.lineTo(topPoints[i].x, topPoints[i].y);
        }
        zCtx.stroke();

        // Bottom line
        zCtx.beginPath();
        zCtx.moveTo(bottomPoints[0].x, bottomPoints[0].y);
        for (let i = 1; i < bottomPoints.length; i++) {
          zCtx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
        }
        zCtx.stroke();

        // Reset shadowBlur
        zCtx.shadowBlur = 0;
      }

      // Draw Beat Grid Lines based on BPM
      if (params.bpm) {
        const beatSecs = 60 / params.bpm;
        const offset = params.gridOffset || 0;
        
        // Find visible beat indices
        const firstVisibleBeat = Math.floor((startT - offset) / beatSecs);
        const lastVisibleBeat = Math.ceil((startT + zoomWindow - offset) / beatSecs);

        zCtx.font = 'bold 8px monospace';

        for (let b = firstVisibleBeat; b <= lastVisibleBeat; b++) {
          const beatTime = offset + b * beatSecs;
          if (beatTime >= 0) {
            const x = ((beatTime - startT) / zoomWindow) * zw;
            if (x >= 0 && x <= zw) {
              const isDownbeat = b % 4 === 0;
              zCtx.strokeStyle = isDownbeat ? 'rgba(0, 191, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
              zCtx.lineWidth = isDownbeat ? 1.5 : 1;
              
              zCtx.beginPath();
              zCtx.moveTo(x, 0);
              zCtx.lineTo(x, zh);
              zCtx.stroke();

              // Beat number label: e.g. bar.beat (1.1, 1.2, 1.3, 1.4, 2.1)
              zCtx.fillStyle = isDownbeat ? 'rgba(0, 191, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)';
              const barNum = Math.floor(b / 4) + 1;
              const beatNum = (b % 4) + 1;
              zCtx.fillText(`${barNum}.${beatNum}`, x + 4, 10);
            }
          }
        }
      }

      // Draw Loop Region on Zoomed Waveform
      if (params.isLoopActive && params.loopStart !== null && params.loopEnd !== null) {
        const lx1 = ((params.loopStart - startT) / zoomWindow) * zw;
        const lx2 = ((params.loopEnd - startT) / zoomWindow) * zw;

        zCtx.fillStyle = 'rgba(76, 217, 100, 0.25)'; // Transparent Green
        zCtx.fillRect(lx1, 0, lx2 - lx1, zh);
        
        zCtx.strokeStyle = '#4cd964';
        zCtx.lineWidth = 1.5;
        zCtx.beginPath();
        zCtx.moveTo(lx1, 0); zCtx.lineTo(lx1, zh);
        zCtx.moveTo(lx2, 0); zCtx.lineTo(lx2, zh);
        zCtx.stroke();
      }

      // Draw Hot Cues on Zoomed Waveform
      params.cues.forEach(cue => {
        const cx = ((cue.time - startT) / zoomWindow) * zw;
        if (cx >= 0 && cx <= zw) {
          zCtx.strokeStyle = cue.color || '#ffcc00';
          zCtx.lineWidth = 2;
          zCtx.beginPath();
          zCtx.moveTo(cx, 0);
          zCtx.lineTo(cx, zh);
          zCtx.stroke();

          // Labeled Cue Flag
          zCtx.fillStyle = cue.color || '#ffcc00';
          zCtx.fillRect(cx - 2, 4, 38, 12);
          zCtx.fillStyle = '#000';
          zCtx.font = 'bold 8px "Inter", sans-serif';
          zCtx.fillText(cue.label.replace('Cue ', 'C'), cx + 2, 13);
        }
      });

      // Draw Red Centered Playhead Line with Triangular Markers
      const px = zw / 2;
      zCtx.strokeStyle = '#ff3b30';
      zCtx.lineWidth = 2;
      zCtx.beginPath();
      zCtx.moveTo(px, 0);
      zCtx.lineTo(px, zh);
      zCtx.stroke();

      zCtx.fillStyle = '#ff3b30';
      // Top Triangle
      zCtx.beginPath();
      zCtx.moveTo(px - 6, 0);
      zCtx.lineTo(px + 6, 0);
      zCtx.lineTo(px, 6);
      zCtx.fill();
      // Bottom Triangle
      zCtx.beginPath();
      zCtx.moveTo(px - 6, zh);
      zCtx.lineTo(px + 6, zh);
      zCtx.lineTo(px, zh - 6);
      zCtx.fill();


      // ==========================================
      // B. DRAW OVERVIEW WAVEFORM (Bottom)
      // ==========================================
      const ow = overviewCanvas.width;
      const oh = overviewCanvas.height;
      oCtx.clearRect(0, 0, ow, oh);

      oCtx.fillStyle = '#060a0f';
      oCtx.fillRect(0, 0, ow, oh);

      const oTopPoints: Array<{x: number, y: number}> = [];
      const oBottomPoints: Array<{x: number, y: number}> = [];
      const oCenterY = oh / 2;

      for (let i = 0; i < ow; i += 2) {
        const wIdx = Math.floor((i / ow) * waveform.length);
        if (wIdx >= 0 && wIdx < waveform.length) {
          const pt = waveform[wIdx];
          const halfH = pt.amplitude * (oh - 6) / 2;
          oTopPoints.push({ x: i, y: oCenterY - halfH });
          oBottomPoints.push({ x: i, y: oCenterY + halfH });
        } else {
          oTopPoints.push({ x: i, y: oCenterY });
          oBottomPoints.push({ x: i, y: oCenterY });
        }
      }

      if (oTopPoints.length > 0) {
        // Create horizontal linear gradient across overview
        const oGrad = oCtx.createLinearGradient(0, 0, ow, 0);
        const oSampleCount = 30;
        for (let s = 0; s <= oSampleCount; s++) {
          const ratio = s / oSampleCount;
          const wIdx = Math.floor(ratio * waveform.length);
          let r = 57, g = 255, b = 20;
          if (wIdx >= 0 && wIdx < waveform.length) {
            r = waveform[wIdx].r;
            g = waveform[wIdx].g;
            b = waveform[wIdx].b;
          }
          oGrad.addColorStop(ratio, `rgba(${r}, ${g}, ${b}, 0.85)`);
        }

        // 1. Draw solid fill
        oCtx.beginPath();
        oCtx.moveTo(oTopPoints[0].x, oTopPoints[0].y);
        for (let i = 1; i < oTopPoints.length; i++) {
          oCtx.lineTo(oTopPoints[i].x, oTopPoints[i].y);
        }
        for (let i = oBottomPoints.length - 1; i >= 0; i--) {
          oCtx.lineTo(oBottomPoints[i].x, oBottomPoints[i].y);
        }
        oCtx.closePath();
        oCtx.fillStyle = oGrad;
        oCtx.fill();

        // 2. Draw neon outline
        oCtx.strokeStyle = oGrad;
        oCtx.lineWidth = 1.5;
        oCtx.lineCap = 'round';
        oCtx.lineJoin = 'round';
        oCtx.shadowBlur = 5;
        oCtx.shadowColor = 'rgba(0, 240, 255, 0.6)';

        // Top line
        oCtx.beginPath();
        oCtx.moveTo(oTopPoints[0].x, oTopPoints[0].y);
        for (let i = 1; i < oTopPoints.length; i++) {
          oCtx.lineTo(oTopPoints[i].x, oTopPoints[i].y);
        }
        oCtx.stroke();

        // Bottom line
        oCtx.beginPath();
        oCtx.moveTo(oBottomPoints[0].x, oBottomPoints[0].y);
        for (let i = 1; i < oBottomPoints.length; i++) {
          oCtx.lineTo(oBottomPoints[i].x, oBottomPoints[i].y);
        }
        oCtx.stroke();

        // Reset shadowBlur
        oCtx.shadowBlur = 0;
      }

      // Draw Loop Region on Overview
      if (params.isLoopActive && params.loopStart !== null && params.loopEnd !== null) {
        const lx1 = (params.loopStart / dur) * ow;
        const lx2 = (params.loopEnd / dur) * ow;
        oCtx.fillStyle = 'rgba(76, 217, 100, 0.35)';
        oCtx.fillRect(lx1, 0, lx2 - lx1, oh);
      }

      // Draw Hot Cues on Overview
      params.cues.forEach(cue => {
        const cx = (cue.time / dur) * ow;
        oCtx.fillStyle = cue.color || '#ffcc00';
        oCtx.fillRect(cx - 1, 0, 2, oh);
      });

      // Draw Zoom Viewport Boundary overlay
      const vx1 = (startT / dur) * ow;
      const vx2 = ((startT + zoomWindow) / dur) * ow;
      oCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      oCtx.fillRect(vx1, 0, vx2 - vx1, oh);
      oCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      oCtx.lineWidth = 1;
      oCtx.strokeRect(vx1, 0, vx2 - vx1, oh);

      // Draw Red Playhead Line
      const ox = (cur / dur) * ow;
      oCtx.fillStyle = '#ff3b30';
      oCtx.fillRect(ox - 1, 0, 2, oh);

      // Draw Ghost Playhead for Flux Mode
      if (params.inFluxState) {
        const fgx = (bgPlayhead / dur) * ow;
        oCtx.fillStyle = '#ffcc00'; // Yellow ghost playhead
        oCtx.fillRect(fgx - 1, 0, 2, oh);
      }

      localAnimRef = requestAnimationFrame(draw);
    };

    localAnimRef = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(localAnimRef);
      window.removeEventListener('resize', resizeCanvases);
    };
  }, [waveform, audioRef]);

  // Handle Overview MouseDown / Drag-to-seek
  const handleOverviewMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDraggingOverviewRef.current = true;
    wasPlayingBeforeDragRef.current = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
    }
    seekFromMouseEventRef.current(e.clientX);
  };

  const handleZoomedMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDraggingZoomedRef.current = true;
    dragStartClientXRef.current = e.clientX;
    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    dragStartAudioTimeRef.current = activeTime;
    wasPlayingBeforeDragRef.current = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
    }
  };

  const handleZoomedTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    isDraggingZoomedRef.current = true;
    dragStartClientXRef.current = e.touches[0].clientX;
    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    dragStartAudioTimeRef.current = activeTime;
    wasPlayingBeforeDragRef.current = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
    }
  };

  // Beat Grid Editor functions
  const handleShiftGrid = async (amount: number) => {
    if (!currentTrack) return;
    
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
    
    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    const newOffset = activeTime;
    const newComments = `${baseComments} [grid_offset=${newOffset.toFixed(3)}]`.trim();
    
    try {
      await updateTrackMetadata(currentTrack.id, { comments: newComments });
    } catch (err) {
      console.error('Failed to set first beat downbeat:', err);
    }
  };

  useEffect(() => {
    seekFromMouseEventRef.current = (clientX: number) => {
      const canvas = overviewCanvasRef.current;
      if (!canvas || !durationSeconds) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      seekPlayer(pct * durationSeconds);
    };
  }, [durationSeconds, seekPlayer]);

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isDraggingOverviewRef.current) {
        seekFromMouseEventRef.current(e.clientX);
      } else if (isDraggingZoomedRef.current) {
        const canvas = zoomedCanvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const zw = rect.width || canvas.width || 800;
          const dx = e.clientX - dragStartClientXRef.current;
          
          const dt = - (dx / zw) * zoomWindow;
          const dur = durationSeconds || currentTrack?.duration || 180;
          const targetTime = Math.max(0, Math.min(dur, dragStartAudioTimeRef.current + dt));
          
          seekPlayer(targetTime);
          if (audioRef.current) {
            audioRef.current.currentTime = targetTime;
          }
        }
      }
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const clientX = e.touches[0].clientX;
      if (isDraggingOverviewRef.current) {
        seekFromMouseEventRef.current(clientX);
      } else if (isDraggingZoomedRef.current) {
        const canvas = zoomedCanvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const zw = rect.width || canvas.width || 800;
          const dx = clientX - dragStartClientXRef.current;
          
          const dt = - (dx / zw) * zoomWindow;
          const dur = durationSeconds || currentTrack?.duration || 180;
          const targetTime = Math.max(0, Math.min(dur, dragStartAudioTimeRef.current + dt));
          
          seekPlayer(targetTime);
          if (audioRef.current) {
            audioRef.current.currentTime = targetTime;
          }
        }
      }
    };

    const handleWindowMouseUp = () => {
      const wasDragging = isDraggingOverviewRef.current || isDraggingZoomedRef.current;
      isDraggingOverviewRef.current = false;
      isDraggingZoomedRef.current = false;
      if (wasDragging && wasPlayingBeforeDragRef.current) {
        setIsPlaying(true);
        wasPlayingBeforeDragRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: true });
    window.addEventListener('touchend', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowMouseUp);
    };
  }, [durationSeconds, currentTrack, setIsPlaying, zoomWindow, audioRef, seekPlayer]);

  // Pioneer DJ CUE Button logic
  const handleCueMouseDown = () => {
    if (!currentTrack) return;
    if (!isPlaying) {
      // Preview mode
      setIsPreviewing(true);
      seekPlayer(djCuePoint);
      if (audioRef.current) {
        audioRef.current.currentTime = djCuePoint;
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleCueMouseUp = () => {
    if (isPreviewing) {
      setIsPreviewing(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = djCuePoint;
      }
      seekPlayer(djCuePoint);
    }
  };

  const handleCueClick = () => {
    if (isPreviewing) return; // Managed by mouse hold
    if (!currentTrack) return;

    if (isPlaying) {
      // Pause and jump back to active cue
      togglePlayback();
      seekPlayer(djCuePoint);
    } else {
      // Set new cue point at current playhead
      const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
      const targetTime = isQuantized ? getNearestBeatTime(activeTime) : activeTime;
      setDjCuePoint(targetTime);
    }
  };

  // CUP: Cue Play (Jumps to cue point and plays instantly)
  const handleCupClick = () => {
    if (!currentTrack) return;
    seekPlayer(djCuePoint);
    if (audioRef.current) {
      audioRef.current.currentTime = djCuePoint;
    }
    if (!isPlaying) {
      togglePlayback();
    }
  };

  // Flux Mode (Slip Mode) Toggle
  const handleFluxToggle = () => {
    if (isFluxActive && inFluxState) {
      // Escape flux state and jump playhead
      const dur = durationSeconds || currentTrack?.duration || 180;
      const elapsed = (Date.now() - fluxStartRealTime) / 1000;
      const targetTime = Math.min(fluxStartAudioTime + elapsed, dur);
      seekPlayer(targetTime);
      setInFluxState(false);
    }
    setIsFluxActive(!isFluxActive);
  };

  // Reverse playback toggle
  const handleReverseToggle = () => {
    if (isDecoding) {
      const msg = settings.language === 'th'
        ? 'กำลังวิเคราะห์สเปกตรัมเพลงสำหรับเล่นย้อนกลับ กรุณารอสักครู่...'
        : 'Analyzing audio spectrum for reverse playback. Please wait...';
      window.dispatchEvent(new CustomEvent('pandakey:toast', {
        detail: { message: msg, type: 'info' }
      }));
      return;
    }
    setIsReverseActive(!isReverseActive);
  };

  // Manual Loop In / Out / Exit
  const handleLoopIn = () => {
    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    const start = isQuantized ? getNearestBeatTime(activeTime) : activeTime;
    setLoopStart(start);
    setIsLoopActive(false);
  };

  const handleLoopOut = () => {
    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    const end = isQuantized ? getNearestBeatTime(activeTime) : activeTime;
    if (loopStart !== null && end > loopStart) {
      setLoopEnd(end);
      setIsLoopActive(true);
    }
  };

  const handleLoopToggle = () => {
    if (isLoopActive) {
      // Exit loop
      if (isFluxActive && inFluxState) {
        const dur = durationSeconds || currentTrack?.duration || 180;
        const elapsed = (Date.now() - fluxStartRealTime) / 1000;
        const targetTime = Math.min(fluxStartAudioTime + elapsed, dur);
        seekPlayer(targetTime);
        setInFluxState(false);
      }
      setIsLoopActive(false);
    } else if (loopStart !== null && loopEnd !== null) {
      setIsLoopActive(true);
    }
  };

  // Auto Loop size triggers (calculated based on BPM)
  const handleAutoLoop = (beats: number) => {
    if (!currentTrack || !currentTrack.bpm) return;
    const bpm = currentTrack.bpm;
    const beatSecs = 60 / bpm;
    const loopDuration = beats * beatSecs;

    const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    const start = isQuantized ? getNearestBeatTime(activeTime) : activeTime;
    setLoopStart(start);
    setLoopEnd(start + loopDuration);
    setIsLoopActive(true);
  };

  // 8 Hot Cues Pad Manager
  const handleHotCueClick = (slot: number, e: React.MouseEvent) => {
    if (!currentTrack) return;
    const cueId = `cue-${slot}`;
    const cue = cues.find(c => c.id === cueId);

    if (e.shiftKey) {
      // Shift+Click: delete cue
      if (cue) {
        const confirmDelete = window.confirm(
          settings.language === 'th' ? `ลบจุดคิวที่ ${slot} ใช่หรือไม่?` : `Delete Hot Cue ${slot}?`
        );
        if (confirmDelete) {
          const updatedCues = cues.filter(c => c.id !== cueId);
          saveCues(currentTrack.id, updatedCues);
        }
      }
    } else {
      if (cue) {
        // Jump and play
        if (isFluxActive && !inFluxState && isPlaying) {
          // Initialize flux state
          setInFluxState(true);
          // eslint-disable-next-line react-hooks/purity
          setFluxStartRealTime(Date.now());
          const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
          setFluxStartAudioTime(activeTime);
        }
        seekPlayer(cue.time);
        setDjCuePoint(cue.time);
        if (!isPlaying) {
          togglePlayback();
        }
      } else {
        // Save new hotcue
        const activeTime = audioRef.current ? audioRef.current.currentTime : currentTime;
        const targetTime = isQuantized ? getNearestBeatTime(activeTime) : activeTime;
        const newCue = {
          id: cueId,
          time: targetTime,
          label: `Cue ${slot}`,
          color: CUE_COLORS[slot - 1]
        };
        saveCues(currentTrack.id, [...cues, newCue]);
        setDjCuePoint(targetTime);
      }
    }
  };

  // Volume Handlers
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

  if (!currentTrack) {
    return (
      <div className="collection-player panel empty-state-player">
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {settings.language === 'th' ? 'เลือกเพลงในตารางด้านบนเพื่อเริ่มฟังเพลง' : 'Select a track above to start listening'}
        </span>
      </div>
    );
  }

  const keyColor = keyColors[currentTrack.camelot_key] || '#fff';
  const displayBpm = currentTrack.bpm ? (currentTrack.bpm * (1 + pitch / 100)).toFixed(1) : '--';

  return (
    <div className="collection-player panel col-player-deck">
      
      {/* 1. TOP TIER: METADATA & VOLUME SECTION */}
      <div className="col-player-top-bar">
        {/* Left: Metadata */}
        <div className="col-player-left">
          <img 
            src={`/api/tracks/${currentTrack.id}/cover`} 
            alt="cover" 
            className="col-player-cover"
          />
          <div className="col-player-meta">
            <b className="col-player-title" title={currentTrack.title}>{currentTrack.title}</b>
            <span className="col-player-artist" title={currentTrack.artist}>{currentTrack.artist || 'Unknown Artist'}</span>
            <div className="col-player-badge-row">
              <span className="col-badge-key" style={{ color: keyColor }}>{currentTrack.camelot_key}</span>
              <span className="col-badge-bpm">{displayBpm} BPM</span>
            </div>
          </div>
        </div>

        {/* Right: Volume & Time readout */}
        <div className="col-player-right">
          <div className="col-time-display">
            <span ref={timeActiveRef} className="pro-time-active">{formatProTime(currentTime)}</span>
            <span style={{ opacity: 0.25, margin: '0 6px' }}>/</span>
            <span>{formatProTime(durationSeconds || currentTrack.duration)}</span>
          </div>

          <div className="col-volume-control">
            <button onClick={handleMuteToggle} className="col-volume-btn">
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="col-volume-slider"
            />
          </div>
        </div>
      </div>

      {/* 2. MIDDLE TIER: DUAL WAVEFORMS PANEL */}
      <div className="col-player-waveforms">
        {isDecoding && (
          <div className="col-waveform-loader">
            <RefreshCcw size={16} className="animate-spin text-cyan-400" />
            <span>{settings.language === 'th' ? 'กำลังวิเคราะห์สเปกตรัมเพลง...' : 'Analyzing audio spectrum...'}</span>
          </div>
        )}
        {/* A. Zoomed scrolling Waveform */}
        <div className="col-zoomed-wrapper" style={{ position: 'relative' }}>
          <canvas 
            ref={zoomedCanvasRef} 
            className="col-zoomed-canvas" 
            onMouseDown={handleZoomedMouseDown}
            onTouchStart={handleZoomedTouchStart}
            style={{ cursor: 'grab' }}
          />
          {/* Zoom Controls Overlay */}
          <div className="col-zoom-widget">
            <button 
              onClick={() => {
                const zoomLevels = [4, 8, 12, 16, 24, 32];
                const currentIndex = zoomLevels.indexOf(zoomWindow);
                if (currentIndex > 0) {
                  setZoomWindow(zoomLevels[currentIndex - 1]);
                }
              }}
              className="col-zoom-btn"
              title="Zoom In"
              disabled={zoomWindow === 4}
            >
              ＋
            </button>
            <span className="col-zoom-label">{zoomWindow}s</span>
            <button 
              onClick={() => {
                const zoomLevels = [4, 8, 12, 16, 24, 32];
                const currentIndex = zoomLevels.indexOf(zoomWindow);
                if (currentIndex < zoomLevels.length - 1) {
                  setZoomWindow(zoomLevels[currentIndex + 1]);
                }
              }}
              className="col-zoom-btn"
              title="Zoom Out"
              disabled={zoomWindow === 32}
            >
              －
            </button>
          </div>
        </div>
        {/* B. Overview Waveform */}
        <div className="col-overview-wrapper">
          <canvas 
            ref={overviewCanvasRef} 
            className="col-overview-canvas" 
            onMouseDown={handleOverviewMouseDown}
          />
        </div>
      </div>

      {/* 3. BOTTOM TIER: DJ CONTROLS ROW */}
      <div className="col-dj-controls">
        {/* Playback Buttons Group */}
        <div className="col-dj-btn-group">
          <button 
            onClick={togglePlayback} 
            className={`col-btn-play-pause ${isPlaying ? 'active' : ''}`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          
          <button 
            onMouseDown={handleCueMouseDown}
            onMouseUp={handleCueMouseUp}
            onMouseLeave={handleCueMouseUp}
            onClick={handleCueClick}
            className={`col-btn-dj col-btn-cue ${isPreviewing ? 'active' : ''}`}
            title="Pioneer DJ Cue"
          >
            CUE
          </button>

          <button 
            onClick={handleCupClick}
            className="col-btn-dj col-btn-cup"
            title="Cue Play (CUP)"
          >
            CUP
          </button>

          <button 
            onClick={() => setIsQuantized(!isQuantized)}
            className={`col-btn-dj col-btn-quantize ${isQuantized ? 'active' : ''}`}
            title="Quantize (Snap to Beat Grid)"
          >
            Q
          </button>

          <button 
            onClick={handleFluxToggle}
            className={`col-btn-dj col-btn-flux ${isFluxActive ? 'active' : ''}`}
            title="Flux Mode (Slip)"
          >
            <Zap size={14} className="inline mr-1" />
            FLX
          </button>

          <button 
            onClick={handleReverseToggle}
            className={`col-btn-dj col-btn-rev ${isReverseActive ? 'active' : ''} ${isDecoding ? 'loading-rev' : ''}`}
            title={isDecoding 
              ? (settings.language === 'th' ? 'กำลังถอดรหัส...' : 'Decoding...') 
              : 'Reverse Play'}
            style={isDecoding ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
          >
            {isDecoding ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCcw size={10} className="animate-spin text-pink-400" />
                REV
              </span>
            ) : 'REV'}
          </button>
        </div>

        {/* Beats / Auto Loop controls */}
        <div className="col-dj-loop-group">
          <button onClick={() => handleAutoLoop(0.0625)} className="col-btn-loop-val">1/16</button>
          <button onClick={() => handleAutoLoop(0.125)} className="col-btn-loop-val">1/8</button>
          <button onClick={() => handleAutoLoop(0.25)} className="col-btn-loop-val">1/4</button>
          <button onClick={() => handleAutoLoop(0.5)} className="col-btn-loop-val">1/2</button>
          <button onClick={() => handleAutoLoop(1)} className="col-btn-loop-val">1</button>
          <button onClick={() => handleAutoLoop(2)} className="col-btn-loop-val">2</button>
          <button onClick={() => handleAutoLoop(4)} className="col-btn-loop-val">4</button>
          <button onClick={() => handleAutoLoop(8)} className="col-btn-loop-val">8</button>
          <button onClick={() => handleAutoLoop(16)} className="col-btn-loop-val">16</button>
          <button onClick={() => handleAutoLoop(32)} className="col-btn-loop-val">32</button>
          
          <div className="col-loop-divider" />
          
          <button onClick={handleLoopIn} className="col-btn-loop-val font-bold">IN</button>
          <button onClick={handleLoopOut} className="col-btn-loop-val font-bold">OUT</button>
          <button 
            onClick={handleLoopToggle} 
            className={`col-btn-loop-toggle ${isLoopActive ? 'active' : ''}`}
          >
            🔄
          </button>
        </div>

        {/* Beat Grid Editor Controls */}
        <div className="col-dj-grid-group">
          <span className="col-grid-label">GRID</span>
          <button onClick={() => handleShiftGrid(-0.01)} className="col-btn-grid-val" title="Shift Grid Left (-10ms)">◀</button>
          <button onClick={handleSetFirstBeat} className="col-btn-grid-val font-bold" style={{ fontSize: '9px' }} title="Set First Beat (Downbeat)">SET 1st</button>
          <button onClick={() => handleShiftGrid(0.01)} className="col-btn-grid-val" title="Shift Grid Right (+10ms)">▶</button>
        </div>

        {/* Pitch / Speed Controls */}
        <div className="col-dj-pitch-group">
          <button 
            onClick={() => setIsKeyLock(!isKeyLock)} 
            className={`col-btn-dj col-btn-keylock ${isKeyLock ? 'active' : ''}`}
            title="Master Tempo (Key Lock)"
            style={{ fontSize: '9px', fontWeight: 'bold', minWidth: '32px' }}
          >
            {isKeyLock ? 'LOCK' : 'PITCH'}
          </button>
          <div className="col-pitch-slider-container">
            <input 
              type="range"
              min="-8"
              max="8"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="col-pitch-slider"
              title="Pitch Control"
            />
            <span className="col-pitch-value">{(pitch >= 0 ? '+' : '') + pitch.toFixed(1)}%</span>
          </div>
          <button 
            onClick={() => setPitch(0)}
            className="col-btn-dj col-btn-pitch-reset"
            title="Reset Pitch to 0%"
            style={{ fontSize: '9px', fontWeight: 'bold' }}
          >
            RST
          </button>
        </div>
      </div>

      {/* 4. HOT CUES PAD GRID */}
      <div className="col-hotcue-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(slot => {
          const cue = cues.find(c => c.id === `cue-${slot}`);
          return (
            <button 
              key={slot}
              onClick={(e) => handleHotCueClick(slot, e)}
              className={`col-hotcue-pad ${cue ? 'active' : ''}`}
              style={{
                borderColor: cue ? cue.color : 'rgba(255, 255, 255, 0.08)',
                boxShadow: cue ? `0 0 10px ${cue.color}33` : 'none'
              }}
            >
              <span className="col-pad-num">{slot}</span>
              <span className="col-pad-time">{cue ? formatProTime(cue.time).split('.')[0] : 'EMPTY'}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}

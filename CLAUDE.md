# CLAUDE.md - Developer Guide

This guide details commands and guidelines for working on the Panda Key codebase.

## Build and Run Commands

- **Local Dev Server (Next.js + local bindings)**:
  ```bash
  npx wrangler pages dev --port 3000 -- npx next dev
  ```
- **Run Queue Consumer Worker**:
  ```bash
  cd worker-consumer && npx wrangler dev
  ```
- **Run Python FastAPI Audio Worker**:
  ```bash
  cd python-worker
  # Activate venv
  venv\Scripts\activate # On Windows
  source venv/bin/activate # On Unix
  # Run FastAPI
  uvicorn main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Project Type Checking & Build**:
  ```bash
  npm run build
  ```
- **Cloudflare Pages Production Build**:
  ```bash
  npm run pages:build
  ```
- **Linting Checks**:
  ```bash
  npm run lint
  npx eslint src/components/CollectionPlayer.tsx # Single file check
  ```

## Code Guidelines

### 1. Strict Type Safety
- **No Implicit/Explicit `any`**: TypeScript compiler rules in this project forbid the `any` type (`@typescript-eslint/no-explicit-any`). 
- **API Castings**: Safely type cast experimental browser APIs instead of using `any`. Example:
  ```typescript
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  ```
- **State Typings**: Explicitly declare interfaces or exact types for complex states (e.g. `settings` and `user` state models in [AppContext.tsx](file:///e:/PandaKey/panda-key-web/src/context/AppContext.tsx)) to prevent downstream compilation errors.

### 2. React Hook State Updates
- **Synchronous Updates Warning**: Synchronously calling state setters inside the body of a `useEffect` loop triggers cascading rendering alerts.
- **Microtask Deferral**: Wrap any synchronous state mutations in a microtask using `Promise.resolve().then(...)` to decouple state synchronization:
  ```typescript
  useEffect(() => {
    if (!currentTrack) {
      Promise.resolve().then(() => {
        setWaveform(null);
      });
      return;
    }
  }, [currentTrack]);
  ```

### 3. Waveform Rendering & Canvas Optimization
- **Cyberpunk Theme**: Use Neon Green `rgb(57, 255, 20)`, Neon Pink `rgb(255, 0, 128)`, and Neon Cyan `rgb(0, 240, 255)` based on the audio frequency analysis.
- **Continuous Solid Form**: Draw continuous, closed top/bottom curves rather than drawing hundreds of separate vertical capsule bars. 
- **Linear Gradient stops**: Create dynamic horizontal gradients across the canvas width using sampled frequency colors to maximize drawing performance.
- **Shadow Glows**: Apply `shadowBlur = 10` on the outline strokes for the main zoomed-in canvas and `shadowBlur = 5` for the overview track deck. Reset the shadow property to `0` immediately after drawing the wave to avoid bleeding blurred filters into other canvas components.

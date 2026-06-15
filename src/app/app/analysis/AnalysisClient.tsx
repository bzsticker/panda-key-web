// src/app/app/analysis/AnalysisClient.tsx
'use client';

import React from 'react';
import { useApp, AnalysisJob } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function AnalysisClient() {
  const {
    tracks,
    jobs,
    reEnqueueAnalysis,
    settings
  } = useApp();

  const t = getTranslation(settings.language);

  // 1. Calculate stats from tracks
  const totalCount = tracks.length;
  const analyzedTracks = tracks.filter(t => t.analysis_status === 'completed');
  const analyzedCount = analyzedTracks.length;
  const missingCount = tracks.filter(t => t.analysis_status !== 'completed').length;
  const analyzedPct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;

  // Calculate average BPM
  const completedBPMTracks = analyzedTracks.filter(t => t.bpm > 0);
  const avgBPM = completedBPMTracks.length > 0
    ? Math.round(completedBPMTracks.reduce((sum, t) => sum + t.bpm, 0) / completedBPMTracks.length)
    : 0;

  // 2. Identify the active job
  const activeJob = jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'pending');

  // 3. Clear Queue & Pause Queue Mock Alerts (Since Cloudflare Queue is server-side and manages itself, local dev just runs)
  const handleClearQueue = () => {
    alert(t('analysis_clear_alert'));
  };

  const handleStartAnalysis = () => {
    const pendingTracks = tracks.filter(t => t.analysis_status !== 'completed');
    if (pendingTracks.length === 0) {
      alert(t('analysis_all_completed'));
      return;
    }
    // Re-enqueue all unanalyzed tracks to trigger analysis
    pendingTracks.forEach(t => reEnqueueAnalysis(t.id));
  };

  // Key Colors
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

  // 4. Calculate distributions for charts
  // Key Distribution
  const keyCounts: Record<string, number> = {};
  analyzedTracks.forEach(t => {
    if (t.camelot_key && t.camelot_key !== '--') {
      keyCounts[t.camelot_key] = (keyCounts[t.camelot_key] || 0) + 1;
    }
  });
  const topKeys = Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxKeyCount = topKeys.length > 0 ? topKeys[0][1] : 1;

  // BPM Distribution
  const bpmGroups = {
    '< 120 BPM': 0,
    '120 - 123': 0,
    '124 - 127': 0,
    '128+ BPM': 0
  };
  analyzedTracks.forEach(t => {
    if (!t.bpm) return;
    if (t.bpm < 120) bpmGroups['< 120 BPM']++;
    else if (t.bpm <= 123) bpmGroups['120 - 123']++;
    else if (t.bpm <= 127) bpmGroups['124 - 127']++;
    else bpmGroups['128+ BPM']++;
  });
  const maxBpmCount = Math.max(...Object.values(bpmGroups), 1);

  // Energy Distribution
  const energyGroups = {
    'Chilled (1-4)': 0,
    'Active (5-7)': 0,
    'Intense (8-10)': 0
  };
  analyzedTracks.forEach(t => {
    if (!t.energy) return;
    if (t.energy <= 4) energyGroups['Chilled (1-4)']++;
    else if (t.energy <= 7) energyGroups['Active (5-7)']++;
    else energyGroups['Intense (8-10)']++;
  });
  const maxEnergyCount = Math.max(...Object.values(energyGroups), 1);

  return (
    <section className="page active" id="analysis" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading">
        <h1>{t('analysis_title')}</h1>
        <div className="toolbar">
          <button className="primary" onClick={handleStartAnalysis}>▶ {t('start_analysis')}</button>
          <button onClick={() => alert(t('analysis_pause_alert'))}>{t('analysis_pause_btn')}</button>
          <button onClick={handleClearQueue}>{t('analysis_clear_btn')}</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat panel">
          <span>{t('total_tracks').toUpperCase()}</span>
          <b>{totalCount}</b>
          <small>{t('analysis_in_library')}</small>
        </div>
        <div className="stat panel">
          <span>{t('analyzed').toUpperCase()}</span>
          <b>{analyzedCount}</b>
          <small>{analyzedPct}% {t('analysis_pct_library')}</small>
        </div>
        <div className="stat panel">
          <span>{t('missing_analysis').toUpperCase()}</span>
          <b>{missingCount}</b>
          <small>{t('analysis_req_analysis')}</small>
        </div>
        <div className="stat panel">
          <span>{t('avg_tempo').toUpperCase()}</span>
          <b>{avgBPM}</b>
          <small>BPM</small>
        </div>
      </div>

      {/* Queue Details and List */}
      <div className="analysis-layout mt-4">
        {/* Active Analysis Detail */}
        <div className="panel queue-card">
          <h2>{t('analysis_now_analyzing')}</h2>
          {activeJob ? (
            <div id="nowAnalyzingContent">
              <p className="font-semibold text-cyan-300" id="nowAnalyzingFile">
                {activeJob.file_name}
              </p>
              <div className="progress mt-2">
                <span id="nowAnalyzingProgressBar" style={{ width: `${activeJob.progress}%` }}></span>
              </div>
              <p className="muted text-xs mt-2" id="nowAnalyzingStep">
                {(activeJob.current_step === 'Processing...' ? t('processing') : activeJob.current_step) || t('processing')} ({activeJob.progress}%)
              </p>
            </div>
          ) : (
            <div id="nowAnalyzingContent">
              <p className="muted" id="nowAnalyzingFile">{t('no_active_jobs')}</p>
              <div className="progress mt-2">
                <span id="nowAnalyzingProgressBar" style={{ width: '0%' }}></span>
              </div>
              <p className="muted text-xs mt-2" id="nowAnalyzingStep">{t('analysis_idle')}</p>
            </div>
          )}
        </div>

        {/* Queue Items List */}
        <div className="panel queue-list flex flex-col" style={{ minHeight: '200px' }}>
          <h2>{t('active_queue')} ({jobs.length})</h2>
          <div className="queue-items-container flex-grow overflow-y-auto mt-2 pr-1" id="queueItemsList">
            {jobs.length === 0 ? (
              <p className="muted text-center py-10 text-sm">{t('analysis_empty_queue')}</p>
            ) : (
              jobs.map(job => {
                let statusColor = 'var(--line-color)';
                if (job.status === 'running') statusColor = 'var(--accent-cyan)';
                if (job.status === 'completed') statusColor = 'var(--accent-green)';
                if (job.status === 'failed') statusColor = 'var(--accent-red)';

                return (
                  <div key={job.id} className="queue-item">
                    <span title={job.file_name}>{job.file_name}</span>
                    <div>
                      <i style={{ width: `${job.progress}%`, backgroundColor: statusColor }}></i>
                    </div>
                    <b className={job.status} style={job.status === 'failed' ? { color: 'var(--accent-red)' } : undefined}>
                      {job.status === 'pending' ? t('analysis_waiting') : (job.status === 'failed' ? (settings.language === 'th' ? 'ล้มเหลว' : 'Failed') : `${job.progress}%`)}
                    </b>
                    {job.status === 'failed' && job.error_message && (
                      <div className="text-left font-mono mt-1 text-red-400 break-words leading-relaxed" style={{ gridColumn: '1 / -1', fontSize: '11px', opacity: 0.85 }}>
                        Error: {job.error_message}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* CSS Distribution Insights Charts */}
      <div className="charts-heading mt-6">
        <h2>{t('analysis_distribution_insights')}</h2>
      </div>

      <div className="charts-grid mt-2 mb-6">
        {/* Key Distribution Chart */}
        <div className="panel chart-card">
          <h3>{t('analysis_key_distribution')}</h3>
          <div className="bar-chart-vertical" id="keyChartContainer">
            {topKeys.length === 0 ? (
              <p className="muted text-center w-full py-10">{t('analysis_no_key_data')}</p>
            ) : (
              topKeys.map(([k, count]) => {
                const heightPct = (count / maxKeyCount) * 100;
                const accent = keyColors[k] || 'var(--accent-cyan)';
                return (
                  <div key={k} className="chart-bar-vert-wrapper">
                    <div 
                      className="chart-bar-vert" 
                      style={{ 
                        height: `${Math.max(10, heightPct)}%`,
                        background: `linear-gradient(180deg, ${accent} 0%, rgba(0,0,0,0.4) 100%)`
                      }}
                      title={`${count} tracks`}
                    ></div>
                    <span className="chart-label-vert text-xs">{displayKey(k)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BPM Distribution Chart */}
        <div className="panel chart-card">
          <h3>{t('analysis_bpm_distribution')}</h3>
          <div className="bar-chart-horizontal" id="bpmChartContainer">
            {analyzedCount === 0 ? (
              <p className="muted text-center w-full py-10">{t('analysis_no_bpm_data')}</p>
            ) : (
              Object.entries(bpmGroups).map(([label, count]) => {
                const widthPct = (count / maxBpmCount) * 100;
                return (
                  <div key={label} className="chart-row-horiz">
                    <span className="chart-label-horiz">{label}</span>
                    <div className="chart-bar-horiz-bg">
                      <div className="chart-bar-horiz" style={{ width: `${widthPct}%` }}></div>
                    </div>
                    <span className="chart-val-horiz">{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Energy Distribution Chart */}
        <div className="panel chart-card">
          <h3>{t('analysis_energy_distribution')}</h3>
          <div className="bar-chart-horizontal" id="energyChartContainer">
            {analyzedCount === 0 ? (
              <p className="muted text-center w-full py-10">{t('analysis_no_energy_data')}</p>
            ) : (
              Object.entries(energyGroups).map(([label, count]) => {
                const widthPct = (count / maxEnergyCount) * 100;
                return (
                  <div key={label} className="chart-row-horiz">
                    <span className="chart-label-horiz">{label}</span>
                    <div className="chart-bar-horiz-bg">
                      <div 
                        className="chart-bar-horiz" 
                        style={{ 
                          width: `${widthPct}%`,
                          background: 'linear-gradient(90deg, var(--accent-pink) 0%, var(--accent-purple) 100%)'
                        }}
                      ></div>
                    </div>
                    <span className="chart-val-horiz">{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

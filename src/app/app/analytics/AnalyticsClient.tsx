// src/app/app/analytics/AnalyticsClient.tsx
'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function AnalyticsClient() {
  const { tracks, settings } = useApp();
  const t = getTranslation(settings.language);

  // Compute metrics
  const totalTracks = tracks.length;
  const analyzedTracks = tracks.filter(t => t.analysis_status === 'completed');
  const analysisRate = totalTracks > 0 ? (analyzedTracks.length / totalTracks) * 100 : 0;
  
  const averageBpm = analyzedTracks.length > 0 
    ? analyzedTracks.reduce((acc, t) => acc + (t.bpm || 0), 0) / analyzedTracks.length 
    : 0;

  const averageEnergy = analyzedTracks.length > 0
    ? analyzedTracks.reduce((acc, t) => acc + (t.energy || 0), 0) / analyzedTracks.length
    : 0;

  // Key Distribution
  const keyDistribution = React.useMemo(() => {
    const counts: Record<string, number> = {};
    analyzedTracks.forEach(t => {
      if (t.camelot_key) {
        counts[t.camelot_key] = (counts[t.camelot_key] || 0) + 1;
      }
    });
    return counts;
  }, [analyzedTracks]);

  // Genre Distribution
  const genreDistribution = React.useMemo(() => {
    const counts: Record<string, number> = {};
    tracks.forEach(t => {
      const g = t.genre || 'Unknown';
      counts[g] = (counts[g] || 0) + 1;
    });
    
    // Sort and take top 5, rest as others
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const othersCount = sorted.slice(5).reduce((acc, [, val]) => acc + val, 0);
    
    if (othersCount > 0) {
      top5.push(['Others', othersCount]);
    }
    return top5;
  }, [tracks]);

  // Key Colors
  const keyColors: Record<string, string> = {
    '12B':'#18d5ff', '1B':'#37f1af', '2B':'#a4f369', '3B':'#ffd65b',
    '4B':'#ff934e', '5B':'#ff607b', '6B':'#e55af1', '7B':'#aa62ff',
    '8B':'#69a3ff', '9B':'#42d3ff', '10B':'#18d5ff', '11B':'#23f2bd',
    '12A':'#00bfff', '1A':'#18ffb0', '2A':'#27e38c', '3A':'#ffd600',
    '4A':'#ffaa00', '5A':'#ff4b5c', '6A':'#ff5074', '7A':'#ec5bff',
    '8A':'#ec5bff', '9A':'#16b7ff', '10A':'#00d8ff', '11A':'#2fb8ff'
  };

  // Render SVG Donut Chart
  const renderGenreChart = () => {
    if (tracks.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 muted text-sm">
          {settings.language === 'th' ? 'ไม่มีข้อมูลแนวเพลง' : 'No genre data available'}
        </div>
      );
    }

    const total = genreDistribution.reduce((acc, [, val]) => acc + val, 0);
    let cumulativePercent = 0;
    
    // Donut configuration
    const size = 180;
    const center = size / 2;
    const r = 55;
    const strokeWidth = 22;
    
    const colors = ['#0098ff', '#3ce57c', '#ec5bff', '#ffd300', '#aa62ff', '#9cafc4'];
    
    const slices = genreDistribution.map(([name, val], idx) => {
      const percent = (val / total) * 100;
      const strokeDasharray = `${(percent / 100) * (2 * Math.PI * r)} ${2 * Math.PI * r}`;
      const strokeDashoffset = `${- (cumulativePercent / 100) * (2 * Math.PI * r)}`;
      cumulativePercent += percent;
      
      return {
        name,
        val,
        percent,
        strokeDasharray,
        strokeDashoffset,
        color: colors[idx % colors.length]
      };
    });

    return (
      <div className="flex flex-col md:flex-row items-center gap-6 mt-4">
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>
          <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="transparent"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={strokeWidth}
            />
            {slices.map((slice, idx) => (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={r}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'all 0.3s ease' }}
              />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{totalTracks}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('tracks_count')}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-grow">
          {slices.map((slice, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: slice.color }} />
                <span className="font-semibold">{slice.name}</span>
              </div>
              <span className="muted">{slice.val} ({slice.percent.toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render SVG Key Distribution Bar Chart
  const renderKeyBarChart = () => {
    if (analyzedTracks.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 muted text-sm">
          {settings.language === 'th' ? 'ไม่มีข้อมูลคีย์เพลง' : 'No key data available'}
        </div>
      );
    }

    const keyList = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B'];
    const maxVal = Math.max(...keyList.map(k => keyDistribution[k] || 0), 1);
    
    return (
      <div className="key-bar-chart-container mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '4px', alignItems: 'end', height: '120px', paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)' }}>
          {keyList.map(k => {
            const val = keyDistribution[k] || 0;
            const percentHeight = (val / maxVal) * 100;
            const barColor = keyColors[k] || 'var(--accent-neon)';
            return (
              <div key={k} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'end', alignItems: 'center' }} title={`${k}: ${val} tracks`}>
                <div style={{ height: `${percentHeight}%`, width: '100%', minHeight: val > 0 ? '4px' : '0', background: barColor, borderRadius: '2px 2px 0 0', opacity: val > 0 ? 0.95 : 0.05, boxShadow: val > 0 ? `0 0 8px ${barColor}77` : 'none', transition: 'all 0.3s ease' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '4px', textAlign: 'center' }}>
          {keyList.map(k => (
            <span key={k} style={{ fontSize: '8px', fontWeight: 'bold', color: keyDistribution[k] ? 'var(--text-main)' : 'var(--text-muted)' }}>{k}</span>
          ))}
        </div>
      </div>
    );
  };

  // Determine Signature Vibe description
  const getSignatureVibe = () => {
    if (analyzedTracks.length === 0) return { title: 'Unknown', desc: 'Add and analyze some tracks first!' };
    
    // Check minor vs major
    let minor = 0;
    let major = 0;
    analyzedTracks.forEach(t => {
      if (t.camelot_key?.endsWith('A')) minor++;
      else if (t.camelot_key?.endsWith('B')) major++;
    });

    const isMinorDominant = minor >= major;
    const energyLevel = averageEnergy >= 7 ? 'Peak Time' : (averageEnergy >= 4.5 ? 'Groovy/House' : 'Deep/Chill');
    const tempoLevel = averageBpm >= 125 ? 'High Tempo' : (averageBpm >= 110 ? 'Mid Tempo' : 'Low Tempo');
    
    let title = `${energyLevel} ${isMinorDominant ? 'Moody' : 'Bright'} Vibe`;
    let desc = settings.language === 'th'
      ? `คลังเพลงของคุณประกอบไปด้วยคีย์ไมเนอร์ ${minor} เพลง และคีย์เมเจอร์ ${major} เพลง สไตล์เด่นของคุณคือทำนองเพลงแนว ${isMinorDominant ? 'มีอารมณ์ดิ่ง ลึกและเร้าอารมณ์ (Minor keys)' : 'สว่างสดใส สนุกสนานและเป็นบวก (Major keys)'} โดยมีความเร็วเฉลี่ยประมาณ ${Math.round(averageBpm)} BPM`
      : `Your library consists of ${minor} minor keys and ${major} major keys. You lean towards ${isMinorDominant ? 'darker, emotional melodies (Minor keys)' : 'uplifting, happy club sets (Major keys)'} at a average tempo of ${Math.round(averageBpm)} BPM.`;
    
    return { title, desc };
  };

  const signatureVibe = getSignatureVibe();

  return (
    <section className="page active" id="analytics" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading">
        <h1>{settings.language === 'th' ? 'สถิติคลังเพลงดีเจ (DJ Library Analytics)' : 'DJ Library Analytics'}</h1>
        <p className="muted text-xs">{settings.language === 'th' ? 'ข้อมูลสรุปโครงสร้างแนวดนตรีและคีย์เพลง' : 'Overview of your music style and library structure'}</p>
      </div>

      {/* Grid of stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div className="panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{t('all_tracks')}</span>
          <b style={{ fontSize: '28px', color: 'var(--accent-neon)' }}>{totalTracks}</b>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{settings.language === 'th' ? `วิเคราะห์เสร็จ: ${analyzedTracks.length}` : `Analyzed: ${analyzedTracks.length}`}</span>
        </div>
        <div className="panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{settings.language === 'th' ? 'ความสำเร็จของการวิเคราะห์' : 'Analysis Coverage'}</span>
          <b style={{ fontSize: '28px', color: 'var(--accent-green)' }}>{analysisRate.toFixed(0)}%</b>
          <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
            <div style={{ height: '100%', width: `${analysisRate}%`, background: 'var(--accent-green)' }} />
          </div>
        </div>
        <div className="panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{settings.language === 'th' ? 'ค่าความเร็วเฉลี่ย' : 'Average Tempo'}</span>
          <b style={{ fontSize: '28px', color: 'var(--accent-yellow)' }}>{averageBpm > 0 ? averageBpm.toFixed(1) : '--'} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>BPM</span></b>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{settings.language === 'th' ? 'ช่วงความเร็วดีเจมาตรฐาน' : 'Standard DJ tempo range'}</span>
        </div>
        <div className="panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{settings.language === 'th' ? 'ค่าพลังงานเฉลี่ย' : 'Average Energy'}</span>
          <b style={{ fontSize: '28px', color: 'var(--accent-pink)' }}>{averageEnergy > 0 ? averageEnergy.toFixed(1) : '--'} <span style={{ fontSize: '14px', fontWeight: 'normal' }}>/10</span></b>
          <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
            <div style={{ height: '100%', width: `${averageEnergy * 10}%`, background: 'var(--accent-pink)' }} />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px', marginTop: '16px' }}>
        
        {/* Left: Genre Chart */}
        <div className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{settings.language === 'th' ? 'สัดส่วนแนวเพลง (Genre Distribution)' : 'Genre Distribution'}</h3>
          {renderGenreChart()}
        </div>

        {/* Right: Key Chart */}
        <div className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{settings.language === 'th' ? 'การกระจายตัวของคีย์เพลง (Key Distribution)' : 'Camelot Key Distribution'}</h3>
          {renderKeyBarChart()}
        </div>
      </div>

      {/* Signature Vibe section */}
      <div className="panel mt-4 mb-6" style={{ padding: '20px', borderLeft: '4px solid var(--accent-purple)', background: 'var(--panel-bg)' }}>
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-purple)', marginBottom: '8px' }}>
          {settings.language === 'th' ? 'เอกลักษณ์สไตล์ดนตรีของคุณ (Signature Vibe)' : 'Your Signature DJ Vibe'}
        </h3>
        <b style={{ fontSize: '18px', display: 'block', marginBottom: '4px' }}>{signatureVibe.title}</b>
        <p className="muted" style={{ fontSize: '13px', lineHeight: '1.5' }}>{signatureVibe.desc}</p>
      </div>
    </section>
  );
}

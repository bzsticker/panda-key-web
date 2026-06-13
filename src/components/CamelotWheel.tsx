// src/components/CamelotWheel.tsx
'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { keyColors, keyNotationMapping, getCompatibleCamelotKeys } from '@/lib/keys';

const keysOuter = ['12B', '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B'];
const keysInner = ['12A', '1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A'];

// Convert hex color to rgba format with custom opacity
function getRgbaColor(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Generate the SVG arc sector path
const getSectorPath = (
  x: number,
  y: number,
  rIn: number,
  rOut: number,
  startAngle: number,
  endAngle: number
) => {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  const x1_out = x + rOut * Math.cos(startRad);
  const y1_out = y + rOut * Math.sin(startRad);
  const x2_out = x + rOut * Math.cos(endRad);
  const y2_out = y + rOut * Math.sin(endRad);

  const x1_in = x + rIn * Math.cos(startRad);
  const y1_in = y + rIn * Math.sin(startRad);
  const x2_in = x + rIn * Math.cos(endRad);
  const y2_in = y + rIn * Math.sin(endRad);

  return [
    `M ${x1_out} ${y1_out}`,
    `A ${rOut} ${rOut} 0 0 1 ${x2_out} ${y2_out}`,
    `L ${x2_in} ${y2_in}`,
    `A ${rIn} ${rIn} 0 0 0 ${x1_in} ${y1_in}`,
    'Z',
  ].join(' ');
};

export default function CamelotWheel() {
  const {
    filterKey,
    setFilterKey,
    setActivePage,
    setActiveFilter,
    setFilterGenre,
    setFilterKeyGroup,
    setSearchQuery,
    settings,
  } = useApp();

  const getDisplayKey = (key: string) => {
    const notation = settings.keyNotation || 'camelot';
    return keyNotationMapping[notation]?.[key] || key;
  };

  const handleKeyClick = (key: string) => {
    setActivePage('collection');
    setActiveFilter('all');
    setFilterGenre('');
    setFilterKeyGroup('');
    setSearchQuery('');

    if (filterKey === key) {
      setFilterKey('');
    } else {
      setFilterKey(key);
    }
  };

  const handleResetFilter = () => {
    setFilterKey('');
  };

  // Compatibility array if a filter key is selected
  const compatibleKeys = filterKey ? getCompatibleCamelotKeys(filterKey) : [];

  const renderSectors = (keys: string[], isOuter: boolean) => {
    const rIn = isOuter ? 64 : 34;
    const rOut = isOuter ? 94 : 64;
    const textRadius = isOuter ? 79 : 49;

    return keys.map((k) => {
      const match = k.match(/^(\d+)([AB])$/);
      if (!match) return null;

      const num = parseInt(match[1], 10);
      
      // Calculate sector angle range (each spans 30 degrees)
      const startAngle = num * 30 - 15;
      const endAngle = num * 30 + 15;

      // Calculate text position angle
      const thetaRad = ((num * 30 - 90) * Math.PI) / 180;
      const tx = 100 + textRadius * Math.cos(thetaRad);
      const ty = 100 + textRadius * Math.sin(thetaRad);

      const isActive = filterKey === k;
      const isCompatible = compatibleKeys.includes(k);
      const hasFilter = !!filterKey;

      // Determine colors
      let fill = 'rgba(255, 255, 255, 0.02)';
      let stroke = 'rgba(255, 255, 255, 0.05)';
      let textColor = 'rgba(255, 255, 255, 0.35)';
      let opacity = 1;

      if (hasFilter) {
        if (isActive) {
          fill = keyColors[k];
          stroke = '#ffffff';
          textColor = '#ffffff';
        } else if (isCompatible) {
          fill = getRgbaColor(keyColors[k], 0.85); // High opacity for compatible keys
          stroke = 'rgba(255, 255, 255, 0.5)';
          textColor = '#ffffff';
        } else {
          fill = 'rgba(255, 255, 255, 0.02)';
          stroke = 'rgba(255, 255, 255, 0.04)';
          textColor = 'rgba(255, 255, 255, 0.2)';
          opacity = 0.3; // Faded out for incompatible keys
        }
      } else {
        // Default color wheel when no filter is active: Bright, solid colors, no opacity
        fill = keyColors[k];
        stroke = 'rgba(0, 0, 0, 0.35)';
        textColor = '#ffffff';
      }

      return (
        <g 
          key={k} 
          onClick={() => handleKeyClick(k)}
          style={{ cursor: 'pointer', transition: 'opacity 0.2s ease', opacity }}
        >
          <path
            d={getSectorPath(100, 100, rIn, rOut, startAngle, endAngle)}
            fill={fill}
            stroke={stroke}
            strokeWidth="0.75"
            style={{ transition: 'fill 0.2s ease, stroke 0.2s ease' }}
            className="wheel-sector"
          />
          <text
            x={tx}
            y={ty}
            textAnchor="middle"
            dominantBaseline="central"
            fill={textColor}
            style={{
              fontSize: '11.5px',
              fontWeight: '900',
              pointerEvents: 'none',
              userSelect: 'none',
              textShadow: '1px 1px 0px #000000, -1px 1px 0px #000000, 1px -1px 0px #000000, -1px -1px 0px #000000, 0px 2px 4px rgba(0, 0, 0, 0.85)',
              transition: 'fill 0.2s ease',
            }}
          >
            {getDisplayKey(k)}
          </text>
        </g>
      );
    });
  };

  const centerColor = filterKey ? keyColors[filterKey] : 'var(--text-muted)';

  return (
    <div className="camelot-card">
      <div className="camelot-wheel-header">
        <h3 className="camelot-wheel-title">Camelot Wheel Filter</h3>
        <p className="camelot-wheel-subtitle">Click a key to isolate compatible tracks</p>
      </div>

      <div className="camelot-wheel svg-wheel" id="camelotWheel" aria-label="Camelot key wheel">
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: 'visible' }}>
          {/* Outer ring */}
          {renderSectors(keysOuter, true)}
          
          {/* Inner ring */}
          {renderSectors(keysInner, false)}

          {/* Concentric boundary strokes */}
          <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" pointerEvents="none" />
          <circle cx="100" cy="100" r="64" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" pointerEvents="none" />
          
          {/* Center circle */}
          <circle 
            cx="100" 
            cy="100" 
            r="34" 
            fill="var(--panel-bg-solid)" 
            stroke={filterKey ? centerColor : 'rgba(255, 255, 255, 0.1)'} 
            strokeWidth={filterKey ? '1.5' : '1'} 
            style={{ transition: 'stroke 0.2s ease' }}
          />

          {/* Center text */}
          <text
            x="100"
            y="88"
            textAnchor="middle"
            fill="rgba(255, 255, 255, 0.65)"
            style={{ 
              fontSize: '8px', 
              fontWeight: '900', 
              letterSpacing: '1.2px', 
              userSelect: 'none', 
              pointerEvents: 'none',
              textShadow: '0px 1px 2px rgba(0, 0, 0, 0.8)'
            }}
          >
            ACTIVE KEY
          </text>
          <text
            x="100"
            y="112"
            textAnchor="middle"
            fill={filterKey ? centerColor : 'var(--text-main)'}
            style={{ 
              fontSize: '20px', 
              fontWeight: '900', 
              userSelect: 'none', 
              pointerEvents: 'none',
              textShadow: filterKey 
                ? `0px 1px 3px rgba(0, 0, 0, 0.9), 0 0 10px ${getRgbaColor(centerColor, 0.75)}` 
                : '0px 1px 3px rgba(0, 0, 0, 0.9)',
              transition: 'fill 0.2s ease'
            }}
          >
            {filterKey ? getDisplayKey(filterKey) : '--'}
          </text>
        </svg>
      </div>

      <button 
        className="camelot-reset-btn"
        onClick={handleResetFilter}
        disabled={!filterKey}
      >
        Reset Filter
      </button>
    </div>
  );
}

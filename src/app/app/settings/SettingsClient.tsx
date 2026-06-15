// src/app/app/settings/page.tsx
'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTranslation } from '@/lib/translations';

export default function SettingsPage() {
  const { settings, updateSetting, tracks } = useApp();
  const [activeSection, setActiveSection] = useState('general');
  const t = getTranslation(settings.language);

  const handleClearCache = () => {
    alert(t('cache_cleared_alert'));
  };

  const unanalyzedTracks = tracks.filter(t => t.analysis_status !== 'completed').length;

  return (
    <section className="page active" id="settings" style={{ display: 'flex', flexDirection: 'column', flex: '1', minHeight: 0 }}>
      <div className="page-heading">
        <h1>{t('tab_settings')}</h1>
      </div>

      <div className="settings-layout mt-4">
        {/* Left Menu Section Selectors */}
        <div className="panel settings-menu">
          <button 
            className={activeSection === 'general' ? 'active' : ''} 
            onClick={() => setActiveSection('general')}
          >
            {t('sidebar_general')}
          </button>
          <button 
            className={activeSection === 'audio' ? 'active' : ''} 
            onClick={() => setActiveSection('audio')}
          >
            {t('sidebar_audio')}
          </button>
          <button 
            className={activeSection === 'analysis' ? 'active' : ''} 
            onClick={() => setActiveSection('analysis')}
          >
            {t('sidebar_analysis')}
          </button>
          <button 
            className={activeSection === 'tags' ? 'active' : ''} 
            onClick={() => setActiveSection('tags')}
          >
            {t('sidebar_tags')}
          </button>
          <button 
            className={activeSection === 'file' ? 'active' : ''} 
            onClick={() => setActiveSection('file')}
          >
            {t('sidebar_file')}
          </button>
          <button 
            className={activeSection === 'account' ? 'active' : ''} 
            onClick={() => setActiveSection('account')}
          >
            {t('sidebar_account')}
          </button>
          <button 
            className={activeSection === 'about' ? 'active' : ''} 
            onClick={() => setActiveSection('about')}
          >
            {t('sidebar_about')}
          </button>
        </div>

        {/* Right Content Form Section */}
        <div className="panel settings-form flex-grow p-6 overflow-y-auto">
          {/* General Section */}
          {activeSection === 'general' && (
            <div className="settings-section">
              <h2>{t('title_general')}</h2>
              <label>{t('lang_label')}
                <select 
                  value={settings.language} 
                  onChange={(e) => updateSetting('language', e.target.value)}
                >
                  <option value="en">English (US)</option>
                  <option value="th">ไทย (Thai)</option>
                </select>
              </label>
              
              <label>{t('theme_label')}
                <select 
                  value={settings.theme} 
                  onChange={(e) => updateSetting('theme', e.target.value)}
                >
                  <option value="dark">{t('theme_dark')}</option>
                  <option value="light">{t('theme_light')}</option>
                  <option value="cyber">{t('theme_cyber')}</option>
                </select>
              </label>
              
              <label>{t('crossfade')}
                <div className="slider-wrapper flex items-center gap-4 mt-1">
                  <input 
                    type="range" 
                    min="0" 
                    max="10" 
                    value={settings.crossfade} 
                    onChange={(e) => updateSetting('crossfade', parseInt(e.target.value))}
                  />
                  <span>{settings.crossfade}s</span>
                </div>
              </label>
              
              <label className="check flex items-center gap-2 mt-4">
                <input 
                  type="checkbox" 
                  checked={settings.autoPlay} 
                  onChange={(e) => updateSetting('autoPlay', e.target.checked)} 
                />
                <span>{t('autoplay_label')}</span>
              </label>
              
              <label className="check flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  checked={settings.rememberPos} 
                  onChange={(e) => updateSetting('rememberPos', e.target.checked)} 
                />
                <span>{t('remember_pos')}</span>
              </label>
            </div>
          )}

          {/* Audio Section */}
          {activeSection === 'audio' && (
            <div className="settings-section">
              <h2>{t('title_audio')}</h2>
              <p className="muted text-xs mb-4">{t('audio_desc')}</p>
              <label>{t('output_device')}
                <select>
                  <option>System Default Speakers</option>
                  <option>ASIO DJ Controller (CH 1/2)</option>
                  <option>Headphones Out (CH 3/4)</option>
                </select>
              </label>
              <label className="mt-4">{t('sample_rate')}
                <select>
                  <option>44.1 kHz</option>
                  <option>48.0 kHz</option>
                  <option>96.0 kHz</option>
                </select>
              </label>
              <label className="check flex items-center gap-2 mt-4">
                <input type="checkbox" defaultChecked />
                <span>{t('high_fidelity')}</span>
              </label>
            </div>
          )}

          {/* Analysis Settings Section */}
          {activeSection === 'analysis' && (
            <div className="settings-section">
              <h2>{t('title_analysis')}</h2>
              <label className="check flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  checked={settings.autoAnalyze} 
                  onChange={(e) => updateSetting('autoAnalyze', e.target.checked)} 
                />
                <span>{t('auto_analyze')}</span>
              </label>
              
              <label className="check flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  checked={settings.saveCuePoints} 
                  onChange={(e) => updateSetting('saveCuePoints', e.target.checked)} 
                />
                <span>{t('save_cues')}</span>
              </label>
              
              <label className="mt-4">{t('key_notation')}
                <select 
                  value={settings.keyNotation} 
                  onChange={(e) => updateSetting('keyNotation', e.target.value)}
                >
                  <option value="camelot">Camelot (8A, 9B, etc.)</option>
                  <option value="musical">Musical (Am, G, etc.)</option>
                  <option value="openkey">Open Key (1m, 2d, etc.)</option>
                </select>
              </label>
              
              <label className="mt-4">{t('bpm_range')}
                <select>
                  <option>78 - 148 BPM (Recommended)</option>
                  <option>90 - 180 BPM</option>
                  <option>58 - 118 BPM</option>
                </select>
              </label>
            </div>
          )}

          {/* Tag Editor Rules Section */}
          {activeSection === 'tags' && (
            <div className="settings-section">
              <h2>{t('title_tags')}</h2>
              <label>{t('meta_format')}
                <select 
                  value={settings.metadataFormat} 
                  onChange={(e) => updateSetting('metadataFormat', e.target.value)}
                >
                  <option value="ID3v2.4">ID3v2.4 (UTF-8)</option>
                  <option value="ID3v2.3">ID3v2.3 (ISO-8859-1)</option>
                  <option value="VorbisComment">Vorbis Comment (FLAC/OGG)</option>
                </select>
              </label>
              <label className="check flex items-center gap-2 mt-4">
                <input type="checkbox" defaultChecked />
                <span>{t('lowercase_ext')}</span>
              </label>
              <label className="check flex items-center gap-2 mt-2">
                <input type="checkbox" />
                <span>{t('backup_file')}</span>
              </label>
            </div>
          )}

          {/* File Management Section */}
          {activeSection === 'file' && (
            <div className="settings-section">
              <h2>{t('title_file')}</h2>
              <p className="muted text-xs mb-4">{t('file_desc')}</p>
              <label>{t('music_folder')}
                <div className="input-action-row flex gap-2 mt-1">
                  <input type="text" readOnly value="E:\PandaKey\Music" className="flex-grow px-3 py-2 rounded border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--panel-border)' }} />
                  <button className="small-btn py-2 px-4 text-sm">Browse...</button>
                </div>
              </label>
              <label className="mt-4">{t('cache_size')}
                <div className="input-action-row flex justify-between items-center gap-2 mt-2">
                  <span className="font-bold text-sm">1.42 GB (241 cached waveforms)</span>
                  <button className="small-btn danger-btn py-2 px-4 text-sm" onClick={handleClearCache}>{t('storage_cleanup')}</button>
                </div>
              </label>
            </div>
          )}

          {/* User Account Section */}
          {activeSection === 'account' && (
            <div className="settings-section">
              <h2>{t('title_account')}</h2>
              <p className="muted text-xs mb-4">{t('account_desc')}</p>
              <div className="account-profile-box flex items-center gap-4 p-4 rounded-lg border bg-opacity-20 bg-slate-900 border-slate-700">
                <div className="avatar-mock text-3xl p-3 bg-cyan-900 rounded-full">🐼</div>
                <div>
                  <h3 className="m-0 text-base font-bold">DJ Panda ({t('pro_member')})</h3>
                  <span className="muted text-xs">sync-active@pandakey.dj</span>
                </div>
              </div>
              <label className="check flex items-center gap-2 mt-4">
                <input type="checkbox" defaultChecked />
                <span>{t('cloud_sync')}</span>
              </label>
            </div>
          )}

          {/* About Section */}
          {activeSection === 'about' && (
            <div className="settings-section flex flex-col items-center text-center p-4">
              <h2>{t('title_about')}</h2>
              <div className="about-logo-wrapper flex flex-col items-center">
                <span className="logo-face text-5xl p-2 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-full" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>🐼</span>
                <h3 className="text-xl font-bold mt-3 mb-1">Panda Key</h3>
                <span className="muted text-xs">v1.1.0 (Release Build 2026.06.13)</span>
              </div>
              <p className="text-sm mt-4 max-w-md" style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                {t('about_desc')}
              </p>
              <p className="muted text-xs mt-8">
                {t('credits')}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

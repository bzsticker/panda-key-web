// src/app/api/export/dj/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// Helper to escape XML characters
function escapeXml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper to convert hex color (#ff3b30) to RGB
function hexToRgb(hex: string) {
  if (!hex || !hex.startsWith('#')) return { r: 255, g: 0, b: 0 };
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return {
    r: isNaN(r) ? 255 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b
  };
}

export async function GET(request: Request) {
  try {
    // 1. Authorize user
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'rekordbox';
    const idsParam = searchParams.get('ids') || '';
    const localPathPrefix = searchParams.get('localPathPrefix') || 'C:\\Users\\PXNDA\\Music\\PandaKey\\';

    const trackIds = idsParam.split(',').filter(Boolean);

    const env = getCloudflareEnv();
    const db = env.DB;

    // 2. Fetch tracks
    let queryStr = 'SELECT id, file_name, artist, title, camelot_key, bpm, energy, duration, file_size, album, genre FROM tracks WHERE user_id = ?';
    const binds: any[] = [user.id];
    if (trackIds.length > 0) {
      const placeholders = trackIds.map(() => '?').join(',');
      queryStr += ` AND id IN (${placeholders})`;
      binds.push(...trackIds);
    }
    queryStr += ' ORDER BY id ASC';
    const tracksRes = await db.prepare(queryStr).bind(...binds).all<any>();
    const tracks = tracksRes.results || [];

    if (tracks.length === 0) {
      return new Response('No tracks found to export', { status: 404 });
    }

    // 3. Fetch cue points in a single query
    let cueQuery = 'SELECT track_id, time, label, color FROM cue_points';
    let cueBinds: any[] = [];
    if (trackIds.length > 0) {
      const placeholders = trackIds.map(() => '?').join(',');
      cueQuery += ` WHERE track_id IN (${placeholders}) ORDER BY track_id, time ASC`;
      cueBinds = trackIds;
    } else {
      cueQuery += ' WHERE track_id IN (SELECT id FROM tracks WHERE user_id = ?) ORDER BY track_id, time ASC';
      cueBinds = [user.id];
    }
    const cuesRes = await db.prepare(cueQuery).bind(...cueBinds).all<any>();
    const allCues = cuesRes.results || [];

    // Group cues by track_id
    const cuesMap = new Map<string, any[]>();
    for (const c of allCues) {
      if (!cuesMap.has(c.track_id)) {
        cuesMap.set(c.track_id, []);
      }
      cuesMap.get(c.track_id)!.push(c);
    }

    // 4. Generate formats
    if (format === 'traktor') {
      // Parse localPathPrefix to Volume & Path components for Traktor
      let volume = 'C:';
      let pathPart = '/Users/PXNDA/Music/PandaKey/';
      
      const normalizedPrefix = localPathPrefix.replace(/\\/g, '/').replace(/\/+/g, '/');
      const driveMatch = normalizedPrefix.match(/^([a-zA-Z]:)(.*)/);
      if (driveMatch) {
        volume = driveMatch[1];
        pathPart = driveMatch[2];
      } else {
        volume = '/';
        pathPart = normalizedPrefix;
      }
      
      // Ensure path starts and ends with '/'
      if (!pathPart.startsWith('/')) pathPart = '/' + pathPart;
      if (!pathPart.endsWith('/')) pathPart = pathPart + '/';
      pathPart = pathPart.replace(/\/+/g, '/');

      const entryTags = tracks.map((t) => {
        const cues = cuesMap.get(t.id) || [];
        const cueTags = cues.slice(0, 8).map((cue, idx) => {
          const startMs = (cue.time * 1000).toFixed(1);
          return `<CUE_V2 NAME="${escapeXml(cue.label)}" TYPE="0" START="${startMs}" LEN="0.0" REPEATS="-1" HOTCUE="${idx}" COLOR="0"/>`;
        }).join('\n        ');

        return `      <ENTRY TYPE="audio" AUDIO_ID="${escapeXml(t.id)}">
        <TITLE>${escapeXml(t.title)}</TITLE>
        <ARTIST>${escapeXml(t.artist)}</ARTIST>
        <ALBUM>${escapeXml(t.album)}</ALBUM>
        <INFO KEY="${escapeXml(t.camelot_key)}" GENRE="${escapeXml(t.genre)}" FILESIZE="${t.file_size}" PLAYTIME="${Math.round(t.duration)}"/>
        <TEMPO BPM="${Number(t.bpm).toFixed(2)}"/>
        <LOCATION VOLUME="${escapeXml(volume)}" PATH="${escapeXml(pathPart)}" FILE="${escapeXml(t.file_name)}" VOLUMEID="${escapeXml(volume)}"/>
        ${cueTags}
      </ENTRY>`;
      }).join('\n');

      const nmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<NML Version="19">
  <HEADLISTING>
    <COLLECTION>
${entryTags}
    </COLLECTION>
  </HEADLISTING>
</NML>`.trim();

      return new Response(nmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="pandakey_traktor.nml"',
          'Cache-Control': 'no-cache'
        }
      });
    } else {
      // Default: Pioneer Rekordbox XML
      const normPrefix = localPathPrefix.replace(/\\/g, '/').replace(/\/+/g, '/');
      const cleanPrefix = normPrefix.endsWith('/') ? normPrefix : normPrefix + '/';

      const trackTags = tracks.map((t, index) => {
        const trackId = index + 1;
        const cues = cuesMap.get(t.id) || [];
        const positionMarks = cues.slice(0, 8).map((cue, idx) => {
          const { r, g, b } = hexToRgb(cue.color);
          return `<POSITION_MARK Name="${escapeXml(cue.label)}" Type="0" Start="${Number(cue.time).toFixed(3)}" Num="${idx}" Red="${r}" Green="${g}" Blue="${b}"/>`;
        }).join('\n      ');

        const ext = t.file_name.split('.').pop()?.toLowerCase() || 'mp3';
        let kind = 'MP3 File';
        if (ext === 'wav') kind = 'WAV File';
        else if (ext === 'flac') kind = 'FLAC File';
        else if (ext === 'm4a' || ext === 'mp4') kind = 'M4A File';
        else if (ext === 'aif' || ext === 'aiff') kind = 'AIFF File';

        const rawPath = cleanPrefix + t.file_name;
        // Escape location URI segment by segment
        const location = 'file://localhost/' + rawPath
          .split('/')
          .map((seg, i) => i === 0 && seg.endsWith(':') ? seg : encodeURIComponent(seg))
          .join('/');

        return `    <TRACK TrackID="${trackId}" Name="${escapeXml(t.title)}" Artist="${escapeXml(t.artist)}" Album="${escapeXml(t.album)}" Genre="${escapeXml(t.genre)}" Kind="${kind}" Size="${t.file_size}" TotalTime="${Math.round(t.duration)}" Bpm="${Number(t.bpm).toFixed(2)}" Key="${escapeXml(t.camelot_key)}" Location="${escapeXml(location)}">
      ${positionMarks}
    </TRACK>`;
      }).join('\n');

      const playlistEntries = tracks.map((_, index) => {
        const trackId = index + 1;
        return `      <TRACK Key="${trackId}"/>`;
      }).join('\n');

      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>
  <COLLECTION Entries="${tracks.length}">
${trackTags}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="PandaKey Export" Count="${tracks.length}">
${playlistEntries}
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`.trim();

      return new Response(xmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="pandakey_rekordbox.xml"',
          'Cache-Control': 'no-cache'
        }
      });
    }

  } catch (error: any) {
    console.error('Export DJ Format error:', error);
    return new Response(error.message || 'Internal server error', { status: 500 });
  }
}

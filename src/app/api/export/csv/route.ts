// src/app/api/export/csv/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// Helper to escape CSV fields
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;

    // Fetch all tracks for user
    const tracks = await db
      .prepare('SELECT file_name, artist, title, camelot_key, musical_key, bpm, energy, album, genre, duration, year, created_at FROM tracks WHERE user_id = ? ORDER BY id ASC')
      .bind(user.id)
      .all<any>();

    // CSV Headers
    const headers = [
      'File Name', 'Artist', 'Title', 'Camelot Key', 'Musical Key', 
      'BPM', 'Energy', 'Album', 'Genre', 'Duration', 'Year', 'Added Date'
    ];

    const csvRows = [headers.join(',')];

    for (const t of tracks.results) {
      const row = [
        escapeCSV(t.file_name),
        escapeCSV(t.artist),
        escapeCSV(t.title),
        escapeCSV(t.camelot_key),
        escapeCSV(t.musical_key),
        escapeCSV(t.bpm),
        escapeCSV(t.energy),
        escapeCSV(t.album),
        escapeCSV(t.genre),
        escapeCSV(t.duration),
        escapeCSV(t.year),
        escapeCSV(t.created_at)
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pandakey-library.csv"',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error: any) {
    console.error('Export CSV error:', error);
    return new Response(error.message || 'Internal server error', { status: 500 });
  }
}

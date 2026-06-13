// src/app/api/playlists/[id]/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// PATCH /api/playlists/:id - Update playlist details or its tracks
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;
    const body = (await request.json()) as any;

    const env = getCloudflareEnv();
    const db = env.DB;

    // Verify playlist belongs to user
    const playlist = await db
      .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
      .bind(playlistId, user.id)
      .first();

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found or access denied' }, { status: 404 });
    }

    // 1. Update text fields if provided
    if (body.name !== undefined || body.description !== undefined) {
      const name = body.name;
      const description = body.description ?? '';
      
      if (name === '') {
        return NextResponse.json({ error: 'Playlist name cannot be empty' }, { status: 400 });
      }

      const sets = [];
      const binds = [];
      if (name !== undefined) {
        sets.push('name = ?');
        binds.push(name);
      }
      if (body.description !== undefined) {
        sets.push('description = ?');
        binds.push(description);
      }
      binds.push(playlistId);

      await db
        .prepare(`UPDATE playlists SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(...binds)
        .run();
    }

    // 2. Sync track list if trackIds array is provided
    if (Array.isArray(body.trackIds)) {
      const trackIds: string[] = body.trackIds;

      // Delete existing playlist_tracks mapping
      await db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').bind(playlistId).run();

      // Insert new tracks in batch if any
      if (trackIds.length > 0) {
        const statements = trackIds.map((trackId, index) => {
          return db
            .prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)')
            .bind(playlistId, trackId, index + 1);
        });

        // Run batch insertion
        await db.batch(statements);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Update playlist error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/playlists/:id - Delete a playlist
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: playlistId } = await params;

    const env = getCloudflareEnv();
    const db = env.DB;

    // Verify playlist belongs to user
    const playlist = await db
      .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
      .bind(playlistId, user.id)
      .first();

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found or access denied' }, { status: 404 });
    }

    // Delete playlist (cascade delete will clean up playlist_tracks)
    await db.prepare('DELETE FROM playlists WHERE id = ?').bind(playlistId).run();

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Delete playlist error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

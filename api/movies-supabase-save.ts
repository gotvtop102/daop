/**
 * Tách khỏi movies-supabase.ts để bundle /api/movies không kéo movies-media (sharp, GitHub API).
 * Chỉ được import động từ api/movies.ts khi action=save.
 */
import { movieExistsByIdRest, moviePayloadToRow, upsertMovieRowRest, extractOphimModifiedForPersist, queueMovieChangeSb } from './movies-supabase.js';

export async function saveMovieSb(movieData: any) {
  const isNew = !movieData.id;
  if (isNew) {
    movieData.id = String(Date.now());
  }
  const canon = extractOphimModifiedForPersist(movieData);
  if (canon) {
    movieData.modified = canon;
  } else if (isNew && (movieData.modified == null || movieData.modified === '')) {
    movieData.modified = new Date().toISOString();
  }
  if (isNew && !movieData.update) {
    movieData.update = 'NEW';
  }

  const { applyMovieR2Uploads } = await import('./movies-media.js');
  await applyMovieR2Uploads(movieData);

  const row = moviePayloadToRow(movieData);
  const existedBefore = await movieExistsByIdRest(row.id);
  await upsertMovieRowRest(row);
  try {
    await queueMovieChangeSb({ movie_id: String(row.id), slug: String(row.slug || ''), reason: existedBefore ? 'admin_save' : 'admin_create' });
  } catch {
    // best-effort: queue failure should not block saving movie
  }
  return { success: true, id: row.id, isNew: !existedBefore };
}

/**
 * Tách khỏi movies-supabase.ts để bundle /api/movies không kéo movies-media (sharp, @aws-sdk/s3).
 * Chỉ được import động từ api/movies.ts khi action=save.
 */
import { movieExistsByIdRest, moviePayloadToRow, upsertMovieRowRest } from './movies-supabase';

export async function saveMovieSb(movieData: any) {
  const isNew = !movieData.id;
  if (isNew) {
    movieData.id = String(Date.now());
  }
  if (!movieData.modified) {
    movieData.modified = new Date().toISOString();
  }
  if (isNew && !movieData.update) {
    movieData.update = 'NEW';
  }

  const { applyMovieR2Uploads } = await import('./movies-media');
  await applyMovieR2Uploads(movieData);

  const row = moviePayloadToRow(movieData);
  const existedBefore = await movieExistsByIdRest(row.id);
  await upsertMovieRowRest(row);
  return { success: true, id: row.id, isNew: !existedBefore };
}

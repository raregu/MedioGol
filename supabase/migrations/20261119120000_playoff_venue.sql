/*
  # Cancha de los partidos de playoffs

  playoff_matches.venue: lugar donde se juega la llave (ej. "Cancha de Mundo Nuevo"), igual que matches.venue.
  Se muestra en el cuadro de la liga, en la próxima jornada y en el cuadro de cada serie,
  y el organizador la edita en el formulario del partido de playoff.

  Idempotente.
*/
ALTER TABLE public.playoff_matches ADD COLUMN IF NOT EXISTS venue text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playoff_matches_venue_len') THEN
    ALTER TABLE public.playoff_matches
      ADD CONSTRAINT playoff_matches_venue_len CHECK (venue IS NULL OR char_length(venue) <= 120);
  END IF;
END $$;

/*
  # Penales en los partidos de playoffs

  playoff_matches.team1_penalties / team2_penalties: resultado de la tanda de penales cuando
  el partido (o el global de ida y vuelta) termina igualado. Null = no hubo penales.
  Se muestran como "1 (4)" en los cuadros y el organizador los registra en el formulario del partido.

  Idempotente.
*/
ALTER TABLE public.playoff_matches ADD COLUMN IF NOT EXISTS team1_penalties smallint;
ALTER TABLE public.playoff_matches ADD COLUMN IF NOT EXISTS team2_penalties smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playoff_matches_penalties_chk') THEN
    ALTER TABLE public.playoff_matches
      ADD CONSTRAINT playoff_matches_penalties_chk CHECK (
        (team1_penalties IS NULL AND team2_penalties IS NULL)
        OR (team1_penalties BETWEEN 0 AND 99 AND team2_penalties BETWEEN 0 AND 99 AND team1_penalties <> team2_penalties)
      );
  END IF;
END $$;

/*
  # Datos de Ejemplo para ChampionHub

  ## Descripción
  Inserta datos de ejemplo para demostrar el funcionamiento de la aplicación.

  ## Datos Incluidos
  1. Campeonatos de ejemplo (fútbol y basketball)
  2. Equipos en cada campeonato
  3. Partidos programados y finalizados
  4. Estadísticas de partidos

  ## Notas
  - Los admin_id y captain_id se dejan NULL para que puedan ser asignados por usuarios reales
  - Los datos están diseñados para mostrar funcionalidad sin depender de usuarios específicos
*/

-- Insertar campeonatos de ejemplo
INSERT INTO championships (id, name, sport, venue, description, status, start_date, end_date) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Copa Primavera 2024', 'futbol', 'Estadio Municipal', 'Campeonato de fútbol amateur con equipos locales', 'active', '2024-03-01', '2024-05-31'),
  ('22222222-2222-2222-2222-222222222222', 'Liga Basketball Pro', 'basketball', 'Gimnasio Central', 'Liga profesional de basketball', 'active', '2024-02-15', '2024-06-30'),
  ('33333333-3333-3333-3333-333333333333', 'Torneo Verano 2024', 'futbol', 'Complejo Deportivo Norte', 'Torneo de verano para equipos juveniles', 'draft', '2024-06-01', '2024-08-31')
ON CONFLICT (id) DO NOTHING;

-- Insertar equipos para Copa Primavera 2024
INSERT INTO teams (id, championship_id, name, stamina, comments) VALUES
  ('aaaa1111-aaaa-1111-aaaa-111111111111', '11111111-1111-1111-1111-111111111111', 'Tigres FC', 85, 'Equipo defensivo sólido'),
  ('aaaa2222-aaaa-2222-aaaa-222222222222', '11111111-1111-1111-1111-111111111111', 'Leones United', 90, 'Excelente ataque'),
  ('aaaa3333-aaaa-3333-aaaa-333333333333', '11111111-1111-1111-1111-111111111111', 'Águilas Doradas', 78, 'Equipo joven y rápido'),
  ('aaaa4444-aaaa-4444-aaaa-444444444444', '11111111-1111-1111-1111-111111111111', 'Pumas Salvajes', 82, 'Buena combinación')
ON CONFLICT (id) DO NOTHING;

-- Insertar equipos para Liga Basketball Pro
INSERT INTO teams (id, championship_id, name, stamina, comments) VALUES
  ('bbbb1111-bbbb-1111-bbbb-111111111111', '22222222-2222-2222-2222-222222222222', 'Thunder Ballers', 88, 'Grandes jugadores de perímetro'),
  ('bbbb2222-bbbb-2222-bbbb-222222222222', '22222222-2222-2222-2222-222222222222', 'Storm Dunkers', 92, 'Dominan el rebote'),
  ('bbbb3333-bbbb-3333-bbbb-333333333333', '22222222-2222-2222-2222-222222222222', 'Lightning Shooters', 85, 'Especialistas en triples')
ON CONFLICT (id) DO NOTHING;

-- Insertar jugadores para Tigres FC
INSERT INTO players (team_id, name, number, position, is_active) VALUES
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Roberto Silva', 1, 'Portero', true),
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Diego Ramírez', 4, 'Defensa', true),
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Luis Hernández', 7, 'Mediocampista', true),
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Carlos Morales', 9, 'Delantero', true),
  ('aaaa1111-aaaa-1111-aaaa-111111111111', 'Fernando Ruiz', 10, 'Delantero', true);

-- Insertar jugadores para Leones United
INSERT INTO players (team_id, name, number, position, is_active) VALUES
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'Miguel Torres', 1, 'Portero', true),
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'José García', 5, 'Defensa', true),
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'Andrés Castro', 8, 'Mediocampista', true),
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'Pablo Sánchez', 11, 'Delantero', true),
  ('aaaa2222-aaaa-2222-aaaa-222222222222', 'Ricardo Vargas', 9, 'Delantero', true);

-- Insertar jugadores para Águilas Doradas
INSERT INTO players (team_id, name, number, position, is_active) VALUES
  ('aaaa3333-aaaa-3333-aaaa-333333333333', 'Javier Méndez', 1, 'Portero', true),
  ('aaaa3333-aaaa-3333-aaaa-333333333333', 'Manuel Ortiz', 3, 'Defensa', true),
  ('aaaa3333-aaaa-3333-aaaa-333333333333', 'Sebastián López', 6, 'Mediocampista', true),
  ('aaaa3333-aaaa-3333-aaaa-333333333333', 'Gabriel Díaz', 10, 'Delantero', true);

-- Insertar jugadores para Pumas Salvajes
INSERT INTO players (team_id, name, number, position, is_active) VALUES
  ('aaaa4444-aaaa-4444-aaaa-444444444444', 'Alejandro Rojas', 1, 'Portero', true),
  ('aaaa4444-aaaa-4444-aaaa-444444444444', 'Raúl Jiménez', 2, 'Defensa', true),
  ('aaaa4444-aaaa-4444-aaaa-444444444444', 'Daniel Cruz', 7, 'Mediocampista', true),
  ('aaaa4444-aaaa-4444-aaaa-444444444444', 'Tomás Reyes', 11, 'Delantero', true);

-- Insertar partidos para Copa Primavera 2024
INSERT INTO matches (championship_id, home_team_id, away_team_id, match_date, round, home_score, away_score, status, venue) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-aaaa-1111-aaaa-111111111111', 'aaaa2222-aaaa-2222-aaaa-222222222222', '2024-03-15 18:00:00', 1, 2, 3, 'finished', 'Estadio Municipal'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa3333-aaaa-3333-aaaa-333333333333', 'aaaa4444-aaaa-4444-aaaa-444444444444', '2024-03-15 20:00:00', 1, 1, 1, 'finished', 'Estadio Municipal'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-aaaa-1111-aaaa-111111111111', 'aaaa3333-aaaa-3333-aaaa-333333333333', '2024-03-22 18:00:00', 2, 3, 0, 'finished', 'Estadio Municipal'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa2222-aaaa-2222-aaaa-222222222222', 'aaaa4444-aaaa-4444-aaaa-444444444444', '2024-03-22 20:00:00', 2, 4, 1, 'finished', 'Estadio Municipal'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-aaaa-1111-aaaa-111111111111', 'aaaa4444-aaaa-4444-aaaa-444444444444', '2024-03-29 18:00:00', 3, 0, 0, 'scheduled', 'Estadio Municipal'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa2222-aaaa-2222-aaaa-222222222222', 'aaaa3333-aaaa-3333-aaaa-333333333333', '2024-03-29 20:00:00', 3, 0, 0, 'scheduled', 'Estadio Municipal');

-- Insertar partidos para Liga Basketball Pro
INSERT INTO matches (championship_id, home_team_id, away_team_id, match_date, round, home_score, away_score, status, venue) VALUES
  ('22222222-2222-2222-2222-222222222222', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'bbbb2222-bbbb-2222-bbbb-222222222222', '2024-02-20 19:00:00', 1, 85, 92, 'finished', 'Gimnasio Central'),
  ('22222222-2222-2222-2222-222222222222', 'bbbb2222-bbbb-2222-bbbb-222222222222', 'bbbb3333-bbbb-3333-bbbb-333333333333', '2024-02-27 19:00:00', 2, 88, 84, 'finished', 'Gimnasio Central'),
  ('22222222-2222-2222-2222-222222222222', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'bbbb3333-bbbb-3333-bbbb-333333333333', '2024-03-05 19:00:00', 3, 0, 0, 'scheduled', 'Gimnasio Central');

-- Insertar estadísticas para algunos partidos de fútbol
-- Partido 1: Tigres FC 2-3 Leones United
INSERT INTO match_stats (match_id, player_id, team_id, goals, yellow_cards, red_cards, assists) 
SELECT 
  m.id,
  p.id,
  p.team_id,
  CASE 
    WHEN p.name = 'Carlos Morales' THEN 1
    WHEN p.name = 'Fernando Ruiz' THEN 1
    WHEN p.name = 'Pablo Sánchez' THEN 2
    WHEN p.name = 'Ricardo Vargas' THEN 1
    ELSE 0
  END,
  CASE WHEN p.name = 'Diego Ramírez' THEN 1 ELSE 0 END,
  0,
  CASE 
    WHEN p.name = 'Luis Hernández' THEN 1
    WHEN p.name = 'Andrés Castro' THEN 1
    ELSE 0
  END
FROM matches m
CROSS JOIN players p
WHERE m.home_team_id = 'aaaa1111-aaaa-1111-aaaa-111111111111'
  AND m.away_team_id = 'aaaa2222-aaaa-2222-aaaa-222222222222'
  AND m.status = 'finished'
  AND m.round = 1
  AND (p.team_id = 'aaaa1111-aaaa-1111-aaaa-111111111111' OR p.team_id = 'aaaa2222-aaaa-2222-aaaa-222222222222')
  AND p.name IN ('Carlos Morales', 'Fernando Ruiz', 'Pablo Sánchez', 'Ricardo Vargas', 'Diego Ramírez', 'Luis Hernández', 'Andrés Castro');

-- Partido 2: Águilas Doradas 1-1 Pumas Salvajes
INSERT INTO match_stats (match_id, player_id, team_id, goals, yellow_cards, red_cards, assists)
SELECT 
  m.id,
  p.id,
  p.team_id,
  CASE 
    WHEN p.name = 'Gabriel Díaz' THEN 1
    WHEN p.name = 'Tomás Reyes' THEN 1
    ELSE 0
  END,
  0,
  0,
  0
FROM matches m
CROSS JOIN players p
WHERE m.home_team_id = 'aaaa3333-aaaa-3333-aaaa-333333333333'
  AND m.away_team_id = 'aaaa4444-aaaa-4444-aaaa-444444444444'
  AND m.status = 'finished'
  AND m.round = 1
  AND (p.team_id = 'aaaa3333-aaaa-3333-aaaa-333333333333' OR p.team_id = 'aaaa4444-aaaa-4444-aaaa-444444444444')
  AND p.name IN ('Gabriel Díaz', 'Tomás Reyes');

-- Partido 3: Tigres FC 3-0 Águilas Doradas
INSERT INTO match_stats (match_id, player_id, team_id, goals, yellow_cards, red_cards, assists)
SELECT 
  m.id,
  p.id,
  p.team_id,
  CASE 
    WHEN p.name = 'Carlos Morales' THEN 2
    WHEN p.name = 'Fernando Ruiz' THEN 1
    ELSE 0
  END,
  CASE WHEN p.name = 'Manuel Ortiz' THEN 1 ELSE 0 END,
  0,
  CASE WHEN p.name = 'Luis Hernández' THEN 2 ELSE 0 END
FROM matches m
CROSS JOIN players p
WHERE m.home_team_id = 'aaaa1111-aaaa-1111-aaaa-111111111111'
  AND m.away_team_id = 'aaaa3333-aaaa-3333-aaaa-333333333333'
  AND m.status = 'finished'
  AND m.round = 2
  AND (p.team_id = 'aaaa1111-aaaa-1111-aaaa-111111111111' OR p.team_id = 'aaaa3333-aaaa-3333-aaaa-333333333333')
  AND p.name IN ('Carlos Morales', 'Fernando Ruiz', 'Luis Hernández', 'Manuel Ortiz');

-- Partido 4: Leones United 4-1 Pumas Salvajes
INSERT INTO match_stats (match_id, player_id, team_id, goals, yellow_cards, red_cards, assists)
SELECT 
  m.id,
  p.id,
  p.team_id,
  CASE 
    WHEN p.name = 'Pablo Sánchez' THEN 2
    WHEN p.name = 'Ricardo Vargas' THEN 2
    WHEN p.name = 'Tomás Reyes' THEN 1
    ELSE 0
  END,
  0,
  0,
  CASE WHEN p.name = 'Andrés Castro' THEN 2 ELSE 0 END
FROM matches m
CROSS JOIN players p
WHERE m.home_team_id = 'aaaa2222-aaaa-2222-aaaa-222222222222'
  AND m.away_team_id = 'aaaa4444-aaaa-4444-aaaa-444444444444'
  AND m.status = 'finished'
  AND m.round = 2
  AND (p.team_id = 'aaaa2222-aaaa-2222-aaaa-222222222222' OR p.team_id = 'aaaa4444-aaaa-4444-aaaa-444444444444')
  AND p.name IN ('Pablo Sánchez', 'Ricardo Vargas', 'Tomás Reyes', 'Andrés Castro');

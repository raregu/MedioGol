-- Agregar columna phone a profiles para jugadores sin correo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

/*
  Asistente del administrador (Edge Function admin-assistant).

  assistant_usage: una fila por pregunta, para el límite diario por usuario y para mejorar la guía
  (se guarda la pregunta, no la respuesta). Solo la escribe la Edge Function (service role);
  solo el administrador del sistema puede leerla. Idempotente.
*/
CREATE TABLE IF NOT EXISTS public.assistant_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question text CHECK (question IS NULL OR char_length(question) <= 500),
  page text CHECK (page IS NULL OR char_length(page) <= 200),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_user ON public.assistant_usage (user_id, created_at DESC);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_usage FROM anon, authenticated;
GRANT SELECT ON public.assistant_usage TO authenticated;
DROP POLICY IF EXISTS "Solo admin del sistema ve uso del asistente" ON public.assistant_usage;
CREATE POLICY "Solo admin del sistema ve uso del asistente" ON public.assistant_usage
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'admin_sistema'));

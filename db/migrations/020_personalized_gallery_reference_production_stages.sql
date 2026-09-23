-- 020_personalized_gallery_reference_production_stages.sql
-- Galería administrable para personalizados, referencia visual del cliente
-- y seguimiento fino de producción.

CREATE TABLE IF NOT EXISTS custom_request_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  title varchar(100) NOT NULL,
  hint varchar(240) NOT NULL,
  request_type varchar(24) NOT NULL
    CHECK (request_type IN ('paper','3d','event','design','other')),
  art varchar(24) NOT NULL DEFAULT 'idea'
    CHECK (art IN ('sheet','party','card','stickers','box','poster','cube','idea')),
  image_url text,
  image_alt varchar(180),
  size_placeholder varchar(180) NOT NULL,
  theme_placeholder varchar(240) NOT NULL,
  description_placeholder varchar(360) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO custom_request_examples (
  slug,
  title,
  hint,
  request_type,
  art,
  size_placeholder,
  theme_placeholder,
  description_placeholder,
  sort_order
)
VALUES
  (
    'tattoo-paper',
    'Papel para tatuajes',
    'Hojas, diseños o referencias impresas parecidas a lo que viste.',
    'paper',
    'sheet',
    'Ej. chico, mediano o del tamaño de una hoja común',
    'Ej. líneas negras, flores, nombres, dibujos...',
    'Contanos qué querés que aparezca en la hoja y cómo te imaginás el resultado.',
    0
  ),
  (
    'birthday',
    'Cumpleaños y mesa dulce',
    'Cartelitos, toppers, etiquetas y detalles con una misma temática.',
    'event',
    'party',
    'Ej. para una mesa chica, mediana o grande',
    'Ej. dinosaurios, fútbol, princesas, tonos pastel...',
    'Contanos de quién es el cumple, la edad y qué cosas te gustaría tener.',
    1
  ),
  (
    'invitations',
    'Tarjetitas e invitaciones',
    'Para cumpleaños, bautismos, eventos o una ocasión especial.',
    'paper',
    'card',
    'Ej. como una tarjeta, postal o foto',
    'Ej. elegante, infantil, flores, colores claros...',
    'Decinos para qué evento es y qué texto o datos tendría que llevar.',
    2
  ),
  (
    'stickers',
    'Stickers y etiquetas',
    'Para emprendimientos, regalos, frascos, bolsas o recuerdos.',
    'paper',
    'stickers',
    'Ej. chiquitos para bolsitas o medianos para frascos',
    'Ej. logo, nombre, colores de tu marca...',
    'Contanos dónde los vas a usar y qué tendría que decir o mostrar cada sticker.',
    3
  ),
  (
    'boxes',
    'Cajitas y souvenirs',
    'Packaging, recuerdos y pequeños detalles armados para regalar.',
    'event',
    'box',
    'Ej. para golosinas, souvenir chico o regalo mediano',
    'Ej. nombre, personaje, colores del evento...',
    'Contanos qué querés guardar o entregar adentro y cómo te gustaría que se vea.',
    4
  ),
  (
    'signs',
    'Carteles y folletos',
    'Para promocionar, informar, decorar o mostrar algo importante.',
    'design',
    'poster',
    'Ej. para mano, mostrador, pared o vidriera',
    'Ej. llamativo, simple, elegante, con fotos...',
    'Contanos qué necesitás comunicar y qué información sí o sí tiene que aparecer.',
    5
  ),
  (
    '3d',
    'Figuras y piezas 3D',
    'Nombres, adornos, figuras, soportes o una pieza que imaginaste.',
    '3d',
    'cube',
    'Ej. cabe en la mano, 10 cm, tamaño adorno...',
    'Ej. rojo y negro, personaje, nombre, estilo simple...',
    'Contanos qué pieza querés, para qué la usarías y cómo debería verse.',
    6
  ),
  (
    'other',
    'Tengo otra idea',
    'Si no encaja en ninguna opción, contanos con tus palabras.',
    'other',
    'idea',
    'Si sabés el tamaño, contanos más o menos cuál',
    'Colores, estilo o referencias que te gusten',
    'Contanos la idea como se la contarías a alguien por WhatsApp. No hace falta usar palabras técnicas.',
    7
  )
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE custom_requests
  ADD COLUMN IF NOT EXISTS example_id uuid
    REFERENCES custom_request_examples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS example_title varchar(100),
  ADD COLUMN IF NOT EXISTS reference_image_url text;

CREATE INDEX IF NOT EXISTS custom_request_examples_active_sort_idx
  ON custom_request_examples (active, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS custom_requests_example_created_idx
  ON custom_requests (example_id, created_at DESC)
  WHERE example_id IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS production_stage varchar(24) NOT NULL DEFAULT 'not_started'
    CHECK (
      production_stage IN (
        'not_started',
        'design',
        'awaiting_approval',
        'materials',
        'production',
        'finishing',
        'ready_for_delivery'
      )
    ),
  ADD COLUMN IF NOT EXISTS production_stage_note varchar(500),
  ADD COLUMN IF NOT EXISTS production_stage_updated_at timestamptz;

UPDATE orders
SET
  production_stage = CASE
    WHEN status = 'ready' THEN 'ready_for_delivery'
    WHEN status = 'in_progress' THEN 'production'
    ELSE production_stage
  END,
  production_stage_updated_at = CASE
    WHEN status IN ('in_progress', 'ready') THEN COALESCE(production_stage_updated_at, updated_at, created_at)
    ELSE production_stage_updated_at
  END
WHERE status IN ('in_progress', 'ready');

CREATE INDEX IF NOT EXISTS orders_active_production_stage_idx
  ON orders (production_stage, promised_for ASC, production_priority, updated_at ASC)
  WHERE status IN ('confirmed', 'in_progress', 'ready');

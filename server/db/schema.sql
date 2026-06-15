CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: profilo utente esteso
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Feature: preferenze estetiche legate all'account (sync tra dispositivi)
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'sunset';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mode VARCHAR(10) DEFAULT 'light';

-- Sicurezza: versione del token per la revoca (incrementata al cambio password
-- → invalida tutti i JWT emessi in precedenza, anche se non ancora scaduti)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  destination VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cover_image VARCHAR(500),
  status VARCHAR(50) DEFAULT 'pianificazione',
  total_budget DECIMAL(10,2) DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_participants (
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer',
  invited_email VARCHAR(255),
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS trip_invitations (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'editor',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(trip_id, invited_email)
);

CREATE TABLE IF NOT EXISTS trip_days (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  city_area VARCHAR(255),
  notes TEXT,
  UNIQUE(trip_id, date)
);

CREATE TABLE IF NOT EXISTS day_activities (
  id SERIAL PRIMARY KEY,
  day_id INTEGER REFERENCES trip_days(id) ON DELETE CASCADE,
  slot VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  time TIME,
  duration INTEGER,
  category VARCHAR(50) DEFAULT 'altro',
  notes TEXT,
  wishlist_place_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_places (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255),
  category VARCHAR(50) DEFAULT 'altro',
  notes TEXT,
  maps_link VARCHAR(500),
  priority INTEGER DEFAULT 2,
  day_id INTEGER REFERENCES trip_days(id) ON DELETE SET NULL,
  slot VARCHAR(20),
  is_slotted BOOLEAN DEFAULT FALSE,
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS packing_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) DEFAULT 'altro',
  checked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_cities (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) DEFAULT '#c26b4a',
  sort_order INTEGER DEFAULT 0,
  lat DECIMAL(9,6),
  lon DECIMAL(9,6)
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_trip_cities_name ON trip_cities (trip_id, LOWER(name));

ALTER TABLE trip_days ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES trip_cities(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_wishlist_places_name ON wishlist_places (trip_id, LOWER(name));

ALTER TABLE wishlist_places ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE wishlist_places ADD COLUMN IF NOT EXISTS photos TEXT[];

ALTER TABLE trip_cities ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);

CREATE TABLE IF NOT EXISTS budget_entries (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'altro',
  description VARCHAR(255),
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_by_name VARCHAR(100),
  entry_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: invite link & public share
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) UNIQUE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;

-- Feature: file attachments
CREATE TABLE IF NOT EXISTS trip_attachments (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: packing per participant
ALTER TABLE packing_items ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(100);

-- Feature: trip notepad
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_notes TEXT;

-- Feature: activity completion
ALTER TABLE day_activities ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- Feature: wishlist voting
CREATE TABLE IF NOT EXISTS wishlist_votes (
  place_id INTEGER REFERENCES wishlist_places(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, user_id)
);

-- Feature: travel photos (attached to a day, optionally to an activity)
CREATE TABLE IF NOT EXISTS trip_photos (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  day_id INTEGER REFERENCES trip_days(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES day_activities(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  caption VARCHAR(255),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: bacheca note (generale / per città / per partecipante)
CREATE TABLE IF NOT EXISTS note_cards (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  title VARCHAR(255),
  body TEXT,
  scope VARCHAR(20) NOT NULL DEFAULT 'general',        -- 'general' | 'city' | 'participant'
  city_id INTEGER REFERENCES trip_cities(id) ON DELETE CASCADE,
  participant_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  color VARCHAR(7) DEFAULT '#f59e0b',
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Feature: immagini di pianificazione nella bacheca note (screenshot, ispirazioni…)
CREATE TABLE IF NOT EXISTS note_images (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: trasporti / spostamenti tra luoghi
CREATE TABLE IF NOT EXISTS transports (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL DEFAULT 'treno',           -- volo|treno|bus|auto|traghetto|metro|apiedi|altro
  from_place VARCHAR(255),
  to_place VARCHAR(255),
  from_city_id INTEGER REFERENCES trip_cities(id) ON DELETE SET NULL,
  to_city_id INTEGER REFERENCES trip_cities(id) ON DELETE SET NULL,
  depart_date DATE, depart_time TIME,
  arrive_date DATE, arrive_time TIME,
  cost DECIMAL(10,2),
  carrier VARCHAR(255),       -- compagnia / numero treno-volo
  booking_ref VARCHAR(255),   -- codice prenotazione
  seat VARCHAR(100),          -- posto
  link TEXT,                  -- link al biglietto
  notes TEXT,
  day_id INTEGER REFERENCES trip_days(id) ON DELETE SET NULL,  -- aggancio all'itinerario
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature: sincronizzazione costo trasporti ↔ budget
ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE;

-- Feature: spesa collegabile (opzionale) a una meta della wishlist
ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS place_id INTEGER REFERENCES wishlist_places(id) ON DELETE SET NULL;

-- Feature: biglietto allegato (PDF/immagine) per trasporto
ALTER TABLE transports ADD COLUMN IF NOT EXISTS ticket_path TEXT;
ALTER TABLE transports ADD COLUMN IF NOT EXISTS ticket_name VARCHAR(255);

-- Feature: to-do / checklist
-- 'kind' distingue le note normali (rich text) dalle liste di cose da fare.
ALTER TABLE note_cards ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'note';  -- 'note' | 'todo'

-- Feature: categoria tematica delle note (attrazioni, gite, negozi…), per filtrarle come le mete.
ALTER TABLE note_cards ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Voci di checklist. note_id NULL = board "To-do" del viaggio (un'unica lista condivisa);
-- note_id valorizzato = voci di una nota-lista (note_cards.kind='todo').
CREATE TABLE IF NOT EXISTS checklist_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  note_id INTEGER REFERENCES note_cards(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_trip ON checklist_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_note ON checklist_items(note_id);

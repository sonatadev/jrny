CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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

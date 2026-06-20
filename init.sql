CREATE TABLE IF NOT EXISTS weeks (
  id SERIAL PRIMARY KEY,
  week_number INT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  excel_data BYTEA,
  loaded_at TIMESTAMPTZ
);

INSERT INTO weeks (week_number, label, start_date, end_date) VALUES
  (1, 'Semana 1', '2026-06-01', '2026-06-07'),
  (2, 'Semana 2', '2026-06-08', '2026-06-14'),
  (3, 'Semana 3', '2026-06-15', '2026-06-21'),
  (4, 'Semana 4', '2026-06-22', '2026-06-30')
ON CONFLICT (week_number) DO NOTHING;

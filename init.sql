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
  (1, 'Semana 1', '2026-06-11', '2026-06-17'),
  (2, 'Semana 2', '2026-06-18', '2026-06-24'),
  (3, 'Semana 3', '2026-06-25', '2026-07-01'),
  (4, 'Semana 4', '2026-07-02', '2026-07-08')
ON CONFLICT (week_number) DO NOTHING;

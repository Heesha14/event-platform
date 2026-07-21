-- Program Service schema
-- Run against the shared "eventsdb" database on your Azure SQL Database
-- server (all three services share one database; table names don't collide)

IF OBJECT_ID('programs', 'U') IS NULL
BEGIN
    CREATE TABLE programs (
        program_id       INT IDENTITY(1,1) PRIMARY KEY,
        event_id          INTEGER NOT NULL,      -- references Event Service's event_id (no cross-DB FK)
        day               DATE NOT NULL,
        track             VARCHAR(150) NOT NULL, -- e.g. "Cloud Computing Track"
        session           VARCHAR(255) NOT NULL,
        speaker_name      VARCHAR(150) NOT NULL,
        start_time        TIME NOT NULL,
        end_time          TIME NOT NULL,
        created_at        DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at        DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT valid_time_range CHECK (end_time > start_time)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_programs_event_id' AND object_id = OBJECT_ID('programs'))
BEGIN
    CREATE INDEX idx_programs_event_id ON programs (event_id);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_programs_day' AND object_id = OBJECT_ID('programs'))
BEGIN
    CREATE INDEX idx_programs_day ON programs (day);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_programs_track' AND object_id = OBJECT_ID('programs'))
BEGIN
    CREATE INDEX idx_programs_track ON programs (track);
END;

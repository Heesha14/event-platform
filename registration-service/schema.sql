-- Registration Service schema
-- Run against the shared "eventsdb" database on your Azure SQL Database
-- server (all three services share one database; table names don't collide)

IF OBJECT_ID('registrations', 'U') IS NULL
BEGIN
    CREATE TABLE registrations (
        registration_id   INT IDENTITY(1,1) PRIMARY KEY,
        event_id           INTEGER NOT NULL,     -- references Event Service's event_id (no cross-DB FK)
        name               VARCHAR(150) NOT NULL,
        email              VARCHAR(255) NOT NULL,
        ticket_count       INTEGER NOT NULL CHECK (ticket_count > 0),
        registered_at      DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_registrations_event_id' AND object_id = OBJECT_ID('registrations'))
BEGIN
    CREATE INDEX idx_registrations_event_id ON registrations (event_id);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_registrations_email' AND object_id = OBJECT_ID('registrations'))
BEGIN
    CREATE INDEX idx_registrations_email ON registrations (email);
END;

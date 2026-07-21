-- Event Service schema
-- Run against the shared "eventsdb" database on your Azure SQL Database
-- server (all three services share one database; table names don't collide)

IF OBJECT_ID('events', 'U') IS NULL
BEGIN
    CREATE TABLE events (
        event_id         INT IDENTITY(1,1) PRIMARY KEY,
        title             VARCHAR(255) NOT NULL,
        venue             VARCHAR(255) NOT NULL,
        event_datetime    DATETIMEOFFSET NOT NULL,
        ticket_price      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
        capacity          INTEGER NOT NULL CHECK (capacity >= 0),
        seats_available   INTEGER NOT NULL CHECK (seats_available >= 0),
        created_at        DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at        DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT seats_not_over_capacity CHECK (seats_available <= capacity)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_events_datetime' AND object_id = OBJECT_ID('events'))
BEGIN
    CREATE INDEX idx_events_datetime ON events (event_datetime);
END;

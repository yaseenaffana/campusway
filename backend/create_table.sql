USE facultyschedule;
GO

SET NOCOUNT ON;
GO

/*
  Canonical bootstrap schema for the active backend in backend/server.js.
  This script is idempotent and preserves existing data where possible.
*/

IF OBJECT_ID('dbo.Buses', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Buses (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BusNo NVARCHAR(20) NOT NULL,
        BusName NVARCHAR(100) NOT NULL,
        Username NVARCHAR(50) NOT NULL,
        Password NVARCHAR(255) NULL,
        SecondPassword NVARCHAR(255) NULL,
        CurrentLat DECIMAL(10, 8) NULL,
        CurrentLng DECIMAL(11, 8) NULL,
        Speed DECIMAL(6, 2) NOT NULL CONSTRAINT DF_Buses_Speed DEFAULT 0,
        LastUpdated DATETIME NOT NULL CONSTRAINT DF_Buses_LastUpdated DEFAULT GETDATE(),
        DestinationName NVARCHAR(150) NULL,
        DestinationLat DECIMAL(10, 8) NULL,
        DestinationLng DECIMAL(11, 8) NULL,
        SchoolLat DECIMAL(10, 8) NULL CONSTRAINT DF_Buses_SchoolLat DEFAULT 10.1062,
        SchoolLng DECIMAL(11, 8) NULL CONSTRAINT DF_Buses_SchoolLng DEFAULT 78.6431,
        IsActive BIT NOT NULL CONSTRAINT DF_Buses_IsActive DEFAULT 1
    );
END;
GO

IF COL_LENGTH('dbo.Buses', 'BusNo') IS NULL
    ALTER TABLE dbo.Buses ADD BusNo NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'BusName') IS NULL
    ALTER TABLE dbo.Buses ADD BusName NVARCHAR(100) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'Username') IS NULL
    ALTER TABLE dbo.Buses ADD Username NVARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'Password') IS NULL
    ALTER TABLE dbo.Buses ADD Password NVARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'SecondPassword') IS NULL
    ALTER TABLE dbo.Buses ADD SecondPassword NVARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'CurrentLat') IS NULL
    ALTER TABLE dbo.Buses ADD CurrentLat DECIMAL(10, 8) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'CurrentLng') IS NULL
    ALTER TABLE dbo.Buses ADD CurrentLng DECIMAL(11, 8) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'Speed') IS NULL
    ALTER TABLE dbo.Buses ADD Speed DECIMAL(6, 2) NOT NULL CONSTRAINT DF_Buses_Speed_Late DEFAULT 0;
GO

IF COL_LENGTH('dbo.Buses', 'LastUpdated') IS NULL
    ALTER TABLE dbo.Buses ADD LastUpdated DATETIME NOT NULL CONSTRAINT DF_Buses_LastUpdated_Late DEFAULT GETDATE();
GO

IF COL_LENGTH('dbo.Buses', 'DestinationName') IS NULL
    ALTER TABLE dbo.Buses ADD DestinationName NVARCHAR(150) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'DestinationLat') IS NULL
    ALTER TABLE dbo.Buses ADD DestinationLat DECIMAL(10, 8) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'DestinationLng') IS NULL
    ALTER TABLE dbo.Buses ADD DestinationLng DECIMAL(11, 8) NULL;
GO

IF COL_LENGTH('dbo.Buses', 'SchoolLat') IS NULL
    ALTER TABLE dbo.Buses ADD SchoolLat DECIMAL(10, 8) NULL CONSTRAINT DF_Buses_SchoolLat_Late DEFAULT 10.1062;
GO

IF COL_LENGTH('dbo.Buses', 'SchoolLng') IS NULL
    ALTER TABLE dbo.Buses ADD SchoolLng DECIMAL(11, 8) NULL CONSTRAINT DF_Buses_SchoolLng_Late DEFAULT 78.6431;
GO

IF COL_LENGTH('dbo.Buses', 'IsActive') IS NULL
    ALTER TABLE dbo.Buses ADD IsActive BIT NOT NULL CONSTRAINT DF_Buses_IsActive_Late DEFAULT 1;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Buses_BusNo'
      AND object_id = OBJECT_ID('dbo.Buses')
)
    CREATE UNIQUE INDEX UX_Buses_BusNo ON dbo.Buses(BusNo);
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Buses_Username'
      AND object_id = OBJECT_ID('dbo.Buses')
)
    CREATE UNIQUE INDEX UX_Buses_Username ON dbo.Buses(Username);
GO

IF OBJECT_ID('dbo.LocationHistory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LocationHistory (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username NVARCHAR(50) NULL,
        BusNo NVARCHAR(20) NULL,
        Latitude DECIMAL(10, 8) NOT NULL,
        Longitude DECIMAL(11, 8) NOT NULL,
        Speed DECIMAL(6, 2) NULL CONSTRAINT DF_LocationHistory_Speed DEFAULT 0,
        RecordedAt DATETIME NOT NULL CONSTRAINT DF_LocationHistory_RecordedAt DEFAULT GETDATE()
    );
END;
GO

IF COL_LENGTH('dbo.LocationHistory', 'Username') IS NULL
    ALTER TABLE dbo.LocationHistory ADD Username NVARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.LocationHistory', 'BusNo') IS NULL
    ALTER TABLE dbo.LocationHistory ADD BusNo NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.LocationHistory', 'Latitude') IS NULL
    ALTER TABLE dbo.LocationHistory ADD Latitude DECIMAL(10, 8) NULL;
GO

IF COL_LENGTH('dbo.LocationHistory', 'Longitude') IS NULL
    ALTER TABLE dbo.LocationHistory ADD Longitude DECIMAL(11, 8) NULL;
GO

IF COL_LENGTH('dbo.LocationHistory', 'Speed') IS NULL
    ALTER TABLE dbo.LocationHistory ADD Speed DECIMAL(6, 2) NULL;
GO

IF COL_LENGTH('dbo.LocationHistory', 'RecordedAt') IS NULL
    ALTER TABLE dbo.LocationHistory ADD RecordedAt DATETIME NOT NULL CONSTRAINT DF_LocationHistory_RecordedAt_Late DEFAULT GETDATE();
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_LocationHistory_Username_RecordedAt'
      AND object_id = OBJECT_ID('dbo.LocationHistory')
)
    CREATE INDEX IX_LocationHistory_Username_RecordedAt
        ON dbo.LocationHistory(Username, RecordedAt DESC);
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_LocationHistory_BusNo_RecordedAt'
      AND object_id = OBJECT_ID('dbo.LocationHistory')
)
    CREATE INDEX IX_LocationHistory_BusNo_RecordedAt
        ON dbo.LocationHistory(BusNo, RecordedAt DESC);
GO

IF OBJECT_ID('dbo.DriverCheckins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DriverCheckins (
        Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        DriverName NVARCHAR(100) NOT NULL,
        BusNumber NVARCHAR(20) NOT NULL,
        Registration NVARCHAR(50) NULL,
        Latitude DECIMAL(9, 6) NULL,
        Longitude DECIMAL(9, 6) NULL,
        AccuracyMeters INT NULL,
        CheckinTime DATETIMEOFFSET NULL,
        CreatedAt DATETIMEOFFSET NOT NULL CONSTRAINT DF_DriverCheckins_CreatedAt DEFAULT SYSDATETIMEOFFSET()
    );
END;
GO

MERGE dbo.Buses AS target
USING (
    VALUES
        ('TN63AJ8602', 'TN63AJ8602 - Neivasal', 'bus2', 'password123', '234567', 'Neivasal', 10.1540, 78.6765, 10.1062, 78.6431, 1),
        ('TN63AK1260', 'TN63AK1260 - SS.Kottai', 'bus3', 'password123', '234567', 'SS.Kottai', 10.1245, 78.6882, 10.1062, 78.6431, 1),
        ('TN63AK1264', 'TN63AK1264 - Illupakudi', 'bus4', 'password123', '234567', 'Illupakudi', 10.0732, 78.7891, 10.1062, 78.6431, 1),
        ('TN63AJ8845', 'TN63AJ8845 - Senjai', 'bus6', 'password123', '234567', 'Senjai', 10.1158, 78.6543, 10.1062, 78.6431, 1),
        ('TN63AL8220', 'TN63AL8220 - Thirupathur Pudhu Theru', 'bus7', 'password123', '234567', 'Thirupathur Pudhu Theru', 10.1110, 78.6135, 10.1062, 78.6431, 1),
        ('TN63AJ8903', 'TN63AJ8903 - Singampunari', 'bus8', 'password123', '234567', 'Singampunari', 10.2023, 78.4327, 10.1062, 78.6431, 1),
        ('TN63AL8156', 'TN63AL8156 - Spare', 'bus9', 'password123', '234567', 'Spare', NULL, NULL, 10.1062, 78.6431, 0),
        ('TN63AL9236', 'TN63AL9236 - Spare', 'bus11', 'password123', '234567', 'Spare', NULL, NULL, 10.1062, 78.6431, 0),
        ('TN63AJ8611', 'TN63AJ8611 - Spare', 'bus12', 'password123', '234567', 'Spare', NULL, NULL, 10.1062, 78.6431, 0),
        ('TN63AJ8570', 'TN63AJ8570 - Spare', 'bus13', 'password123', '234567', 'Spare', NULL, NULL, 10.1062, 78.6431, 0),
        ('TN63BA0058', 'TN63BA0058 - Velangudi', 'bus14', 'password123', '234567', 'Velangudi', 10.0668, 78.7562, 10.1062, 78.6431, 1),
        ('TN63BA0204', 'TN63BA0204 - Karaikudi', 'bus15', 'password123', '234567', 'Karaikudi', 10.0735, 78.7732, 10.1062, 78.6431, 1),
        ('TN63BA3179', 'TN63BA3179 - Eriyur', 'bus16', 'password123', '234567', 'Eriyur', 10.0612, 78.6321, 10.1062, 78.6431, 1),
        ('TN63BC3589', 'TN63BC3589 - Akilmanai, Thirupathur', 'bus17', 'password123', '234567', 'Akilmanai, Thirupathur', 10.1089, 78.6112, 10.1062, 78.6431, 1),
        ('TN63BC3805', 'TN63BC3805 - Sembanur', 'bus18', 'password123', '234567', 'Sembanur', 10.0824, 78.7645, 10.1062, 78.6431, 1),
        ('TN63BD8042', 'TN63BD8042 - Kottaiyur', 'bus19', 'password123', '234567', 'Kottaiyur', 10.1082, 78.7898, 10.1062, 78.6431, 1),
        ('TN63BE0936', 'TN63BE0936 - Keelasevalpatti', 'bus20', 'password123', '234567', 'Keelasevalpatti', 10.1346, 78.7063, 10.1062, 78.6431, 1),
        ('TN55AC5864', 'TN55AC5864 - Kallutimedu', 'bus34', 'password123', '234567', 'Kallutimedu', 10.2475, 78.5126, 10.1062, 78.6431, 1),
        ('TN55BC5526', 'TN55BC5526 - Elanthaimangalam', 'bus50', 'password123', '234567', 'Elanthaimangalam', 10.2214, 78.5489, 10.1062, 78.6431, 1)
) AS source (BusNo, BusName, Username, PasswordValue, SecondPassword, DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng, IsActive)
ON target.Username = source.Username OR target.BusNo = source.BusNo
WHEN MATCHED THEN
    UPDATE SET
        target.BusName = source.BusName,
        target.Username = source.Username,
        target.DestinationName = source.DestinationName,
        target.DestinationLat = source.DestinationLat,
        target.DestinationLng = source.DestinationLng,
        target.SchoolLat = source.SchoolLat,
        target.SchoolLng = source.SchoolLng,
        target.IsActive = source.IsActive,
        target.SecondPassword = source.SecondPassword,
        target.Password = COALESCE(NULLIF(target.Password, ''), source.PasswordValue)
WHEN NOT MATCHED THEN
    INSERT (BusNo, BusName, Username, Password, SecondPassword, DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng, IsActive)
    VALUES (source.BusNo, source.BusName, source.Username, source.PasswordValue, source.SecondPassword, source.DestinationName, source.DestinationLat, source.DestinationLng, source.SchoolLat, source.SchoolLng, source.IsActive);
GO

PRINT 'MZSJS BUZZ schema is ready for backend/server.js.';
GO

-- ============================================
-- Batch Update Bus Data with New Routes
-- ============================================
USE facultyschedule;
GO

SET NOCOUNT ON;
GO

-- Update or Insert Bus Data
MERGE INTO dbo.Buses AS target
USING (
  VALUES 
    (2, 'TN63AJ8602', 'bus2', 'Neivasal', 10.1540, 78.6765),
    (3, 'TN63AK1260', 'bus3', 'SS.Kottai', 11.63303309, 78.48770141),
    (4, 'TN63AK1264', 'bus4', 'Illupakudi', 9.90126111, 78.36428291),
    (6, 'TN63AJ8845', 'bus6', 'Senjai', 10.07705908, 78.76701684),
    (7, 'TN63AL8220', 'bus7', 'Thirupathur Pudhu Theru', 10.12064391, 78.59731240),
    (8, 'TN63AJ8903', 'bus8', 'Singampunari', 10.20107422, 78.42708648),
    (9, 'TN63AL8156', 'bus9', 'Spare', NULL, NULL),
    (11, 'TN63AL9236', 'bus11', 'Spare', NULL, NULL),
    (12, 'TN63AJ8611', 'bus12', 'Spare', NULL, NULL),
    (13, 'TN63AJ8570', 'bus13', 'Spare', NULL, NULL),
    (14, 'TN63BA0058', 'bus14', 'Velangudi', 10.11996897, 78.79444181),
    (15, 'TN63BA0204', 'bus15', 'Karaikudi', 10.08498068, 78.77523421),
    (16, 'TN63BA3179', 'bus16', 'Eriyur', 10.04993905, 78.52289199),
    (17, 'TN63BC3589', 'bus17', 'Akilmanai, Thirupathur', 10.12097759, 78.62039565),
    (18, 'TN63BC3805', 'bus18', 'Sembanur', 10.00198657, 78.63790511),
    (19, 'TN63BD8042', 'bus19', 'Kottaiyur', 10.12066046, 78.79339249),
    (20, 'TN63BE0936', 'bus20', 'Keelasevalpatti', 10.18681814, 78.66337910),
    (34, 'TN55AC5864', 'bus34', 'Kallutimedu', 10.2475, 78.5126),
    (50, 'TN55BC5526', 'bus50', 'Elanthaimangalam', 10.2214, 78.5489)
) AS source (BusNo, Registration, Username, DestinationName, DestinationLat, DestinationLng)
ON target.BusNo = CAST(source.BusNo AS NVARCHAR(20))
WHEN MATCHED THEN
  UPDATE SET
    Registration = source.Registration,
    BusName = source.DestinationName,
    Username = source.Username,
    DestinationName = source.DestinationName,
    DestinationLat = source.DestinationLat,
    DestinationLng = source.DestinationLng,
    LastUpdated = GETDATE()
WHEN NOT MATCHED THEN
  INSERT (BusNo, Registration, BusName, Username, DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng, IsActive)
  VALUES (
    CAST(source.BusNo AS NVARCHAR(20)),
    source.Registration,
    source.DestinationName,
    source.Username,
    source.DestinationName,
    source.DestinationLat,
    source.DestinationLng,
    10.1062,  -- Default School Latitude
    78.6431,  -- Default School Longitude
    1
  );

PRINT '✓ Bus data updated successfully!';

-- Verify the updates
SELECT 
  BusNo,
  BusName,
  DestinationName,
  DestinationLat,
  DestinationLng,
  LastUpdated
FROM dbo.Buses
WHERE BusNo IN ('2', '3', '4', '6', '7', '8', '9', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '34', '50')
ORDER BY TRY_CAST(BusNo AS INT), BusNo;
GO

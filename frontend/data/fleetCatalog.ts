export interface FleetCatalogItem {
  busNo: string;
  registration: string;
  route: string;
  isSpare: boolean;
}

export const FLEET_CATALOG: FleetCatalogItem[] = [
  { busNo: '2', registration: 'TN63AJ8602', route: 'Neivasal', isSpare: false },
  { busNo: '3', registration: 'TN63AK1260', route: 'SS.Kottai', isSpare: false },
  { busNo: '4', registration: 'TN63AK1264', route: 'Illupakudi', isSpare: false },
  { busNo: '6', registration: 'TN63AJ8845', route: 'Senjai', isSpare: false },
  { busNo: '7', registration: 'TN63AL8220', route: 'Thirupathur Pudhu Theru', isSpare: false },
  { busNo: '8', registration: 'TN63AJ8903', route: 'Singampunari', isSpare: false },
  { busNo: '9', registration: 'TN63AL8156', route: 'Spare', isSpare: true },
  { busNo: '11', registration: 'TN63AL9236', route: 'Spare', isSpare: true },
  { busNo: '12', registration: 'TN63AJ8611', route: 'Spare', isSpare: true },
  { busNo: '13', registration: 'TN63AJ8570', route: 'Spare', isSpare: true },
  { busNo: '14', registration: 'TN63BA0058', route: 'Velangudi', isSpare: false },
  { busNo: '15', registration: 'TN63BA0204', route: 'Karaikudi', isSpare: false },
  { busNo: '16', registration: 'TN63BA3179', route: 'Eriyur', isSpare: false },
  { busNo: '17', registration: 'TN63BC3589', route: 'Akilmanai, Thirupathur', isSpare: false },
  { busNo: '18', registration: 'TN63BC3805', route: 'Sembanur', isSpare: false },
  { busNo: '19', registration: 'TN63BD8042', route: 'Kottaiyur', isSpare: false },
  { busNo: '20', registration: 'TN63BE0936', route: 'Keelasevalpatti', isSpare: false },
  { busNo: '34', registration: 'TN55AC5864', route: 'Kallutimedu', isSpare: false },
  { busNo: '50', registration: 'TN55BC5526', route: 'Elanthaimangalam', isSpare: false },
];

const byRegistration = new Map(FLEET_CATALOG.map((item) => [item.registration.toUpperCase(), item]));
const byBusNo = new Map(FLEET_CATALOG.map((item) => [item.busNo, item]));

export const normalizeBusNo = (value: unknown): string => {
  const text = String(value ?? '').trim();
  const digits = text.match(/\d+/g);
  return digits ? digits.join('') : text;
};

export const findFleetCatalogItem = (value: {
  busNo?: unknown;
  registration?: unknown;
  route?: unknown;
}) => {
  const registration = String(value.registration ?? '').trim().toUpperCase();
  const busNo = normalizeBusNo(value.busNo);

  return byRegistration.get(registration) || byBusNo.get(busNo) || null;
};

export interface FleetCatalogItem {
  busNo: string;
  registration: string;
  route: string;
  isSpare: boolean;
  destinationLat?: number | null;
  destinationLng?: number | null;
}

export const FLEET_CATALOG: FleetCatalogItem[] = [
  { busNo: '2', registration: 'TN63AJ8602', route: 'Neivasal', isSpare: false, destinationLat: 10.1540, destinationLng: 78.6765 },
  { busNo: '3', registration: 'TN63AK1260', route: 'SS.Kottai', isSpare: false, destinationLat: 11.6330330904997, destinationLng: 78.48770141038065 },
  { busNo: '4', registration: 'TN63AK1264', route: 'Illupakudi', isSpare: false, destinationLat: 9.901261110548136, destinationLng: 78.36428290514549 },
  { busNo: '6', registration: 'TN63AJ8845', route: 'Senjai', isSpare: false, destinationLat: 10.077059084157747, destinationLng: 78.7670168394995 },
  { busNo: '7', registration: 'TN63AL8220', route: 'Thirupathur Pudhu Theru', isSpare: false, destinationLat: 10.120643907067713, destinationLng: 78.59731240116623 },
  { busNo: '8', registration: 'TN63AJ8903', route: 'Singampunari', isSpare: false, destinationLat: 10.201074215868076, destinationLng: 78.42708647638042 },
  { busNo: '9', registration: 'TN63AL8156', route: 'Spare', isSpare: true, destinationLat: null, destinationLng: null },
  { busNo: '11', registration: 'TN63AL9236', route: 'Spare', isSpare: true, destinationLat: null, destinationLng: null },
  { busNo: '12', registration: 'TN63AJ8611', route: 'Spare', isSpare: true, destinationLat: null, destinationLng: null },
  { busNo: '13', registration: 'TN63AJ8570', route: 'Spare', isSpare: true, destinationLat: null, destinationLng: null },
  { busNo: '14', registration: 'TN63BA0058', route: 'Velangudi', isSpare: false, destinationLat: 10.119968970900416, destinationLng: 78.79444180919943 },
  { busNo: '15', registration: 'TN63BA0204', route: 'Karaikudi', isSpare: false, destinationLat: 10.084980677767863, destinationLng: 78.77523421083131 },
  { busNo: '16', registration: 'TN63BA3179', route: 'Eriyur', isSpare: false, destinationLat: 10.04993905280257, destinationLng: 78.52289198691743 },
  { busNo: '17', registration: 'TN63BC3589', route: 'Akilmanai, Thirupathur', isSpare: false, destinationLat: 10.120977591704518, destinationLng: 78.6203956453479 },
  { busNo: '18', registration: 'TN63BC3805', route: 'Sembanur', isSpare: false, destinationLat: 10.001986571604215, destinationLng: 78.63790510513645 },
  { busNo: '19', registration: 'TN63BD8042', route: 'Kottaiyur', isSpare: false, destinationLat: 10.120660461933504, destinationLng: 78.79339249403861 },
  { busNo: '20', registration: 'TN63BE0936', route: 'Keelasevalpatti', isSpare: false, destinationLat: 10.18681814454676, destinationLng: 78.6633790969952 },
  { busNo: '34', registration: 'TN55AC5864', route: 'Kallutimedu', isSpare: false, destinationLat: 10.2475, destinationLng: 78.5126 },
  { busNo: '50', registration: 'TN55BC5526', route: 'Elanthaimangalam', isSpare: false, destinationLat: 10.2214, destinationLng: 78.5489 },
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

import Dexie, { type Table } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';

// URL database Dexie Cloud:
// 1) env PUBLIC_DEXIE_CLOUD_URL (isi "local" untuk memaksa mode lokal), atau
// 2) dexie-cloud.json di root proyek (dibuat oleh `npx dexie-cloud create`, ikut di-commit — bukan rahasia).
const cfgFiles = import.meta.glob('../../dexie-cloud.json', { eager: true, import: 'default' }) as Record<string, { dbUrl?: string }>;
const fileUrl = Object.values(cfgFiles)[0]?.dbUrl || '';
const envUrl = String(import.meta.env.PUBLIC_DEXIE_CLOUD_URL || '').trim();
export const CLOUD_URL: string = envUrl === 'local' ? '' : (envUrl || fileUrl).trim();
export const isCloud = /^https:\/\//.test(CLOUD_URL);

/* ================= MODEL DATA We POS ================= */
export interface Row { id: string; realmId: string; owner?: string }

export interface Settings extends Row {
  name: string; tagline: string; address: string; phone: string; logo: string; color: string;
  footer: string; prefix: string;
  taxPct: number; servicePct: number; // persen, dihitung dari subtotal setelah diskon
  kds: boolean;                       // pakai layar dapur? (false → pesanan langsung dianggap siap)
  paper: '58' | '80';                 // lebar kertas struk
  selfOrder?: boolean;                // pesan mandiri lewat QR meja aktif?
  selfKey?: string;                   // kunci di QR (buat ulang → QR lama tidak berlaku)
  selfAuto?: boolean;                 // pesanan QR langsung ke dapur (false → konfirmasi kasir dulu)
  publicUrl?: string;                 // alamat web publik untuk QR (mis. https://we-pos.vercel.app)
  qris?: string;                      // gambar QRIS statis (data URL)
  qrisPayload?: string;               // isi teks QRIS statis (hasil baca gambar) → dibuat dinamis saat bayar
  qrisDynamic?: boolean;              // tampilkan QRIS dinamis (nominal otomatis) di kasir
}
export interface Category extends Row { name: string; icon: string; sort: number }
export interface MenuItem extends Row {
  name: string; categoryId: string; price: number; icon: string; photo: string;
  station: 'dapur' | 'bar'; available: boolean; sort: number;
}
export interface DiningTable extends Row { name: string; area: string; seats: number; sort: number }

/** Status item: new (belum dikirim) → cook (dimasak) → ready (siap diantar) → served (sudah diantar) | void */
export type ItemStatus = 'new' | 'cook' | 'ready' | 'served' | 'void';
export interface OrderLine {
  key: string; itemId: string; name: string; price: number; qty: number; note: string;
  station: string; status: ItemStatus; round: number; sentAt?: string; readyAt?: string; voidBy?: string;
}
export interface Payment { date: string; amount: number; method: string; received?: number; change?: number; by?: string }
export interface Order extends Row {
  code: string; no: number; type: 'dine' | 'take'; tableId: string; guest: string; pax: number;
  lines: OrderLine[]; round: number;
  subtotal: number; discount: number; service: number; tax: number; total: number;
  status: 'open' | 'paid' | 'void'; payments: Payment[]; note: string;
  day?: string; source?: 'qr'; qrPending?: boolean; qrAt?: string;
  createdAt: string; closedAt?: string; createdBy?: string; voidReason?: string; reservationId?: string;
}
export interface Reservation extends Row {
  name: string; phone: string; date: string; time: string; pax: number; tableId: string; note: string;
  status: 'booked' | 'seated' | 'cancel' | 'noshow'; createdAt: string; orderId?: string;
}
export interface Expense extends Row { date: string; category: string; note: string; amount: number; cash: boolean; by?: string }
export interface Closing extends Row {
  date: string; from: string; to: string; opening: number; cashSales: number; cashExpense: number;
  expected: number; counted: number; diff: number; sales: number; byMethod: Record<string, number>;
  orders: number; note: string; by: string; createdAt: string;
}
/** Akun staf: masuk dengan memilih nama + PIN. */
export interface Staff {
  id: string; realmId: string; name: string; role: 'owner' | 'admin' | 'kasir' | 'pelayan' | 'dapur';
  algo: string; salt: string; hash: string; active: boolean; color: string; email?: string;
  createdAt: string; lastLogin?: string;
}
/** Mode lokal: daftar restoran di perangkat ini (+ kode pemulihan PIN pemilik). */
export interface Restaurant { id: string; name: string; createdAt: string; recovery?: { algo: string; salt: string; hash: string } }

export class WePosDB extends Dexie {
  settings!: Table<Settings, string>;
  categories!: Table<Category, string>;
  items!: Table<MenuItem, string>;
  dtables!: Table<DiningTable, string>;
  orders!: Table<Order, string>;
  reservations!: Table<Reservation, string>;
  expenses!: Table<Expense, string>;
  closings!: Table<Closing, string>;
  staff!: Table<Staff, string>;
  restaurants!: Table<Restaurant, string>;

  constructor() {
    // Mode cloud: id dibuat otomatis oleh Dexie Cloud ("@id"). Mode lokal: id dibuat oleh aplikasi.
    super(isCloud ? 'wepos' : 'wepos-local', isCloud ? { addons: [dexieCloud] } : {});
    const pk = isCloud ? '@id' : 'id';
    this.version(1).stores({
      settings: `${pk}, realmId`,
      categories: `${pk}, realmId`,
      items: `${pk}, realmId, categoryId`,
      dtables: `${pk}, realmId`,
      orders: `${pk}, realmId, status, createdAt`,
      reservations: `${pk}, realmId, date`,
      expenses: `${pk}, realmId, date`,
      closings: `${pk}, realmId, date`,
      staff: `${pk}, realmId`,
      ...(isCloud ? {} : { restaurants: 'id' }),
    });
    if (isCloud) {
      (this as any).cloud.configure({
        databaseUrl: CLOUD_URL,
        requireAuth: false, // layar masuk dibuat sendiri
        customLoginGui: true,
        socialAuth: false,
      });
    }
  }
}

export const db = new WePosDB();
// Tabel bawaan Dexie Cloud (realms, members, roles) + API cloud
export const cdb: any = db;

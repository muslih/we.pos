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

export interface Row { id: string; realmId: string; owner?: string }
export interface Settings extends Row {
  name: string; tagline: string; address: string; phone: string; logo: string; color: string;
  footer: string; prefix: string; expressPct: number;
}
export interface Service extends Row { name: string; unit: string; price: number; days: number }
export interface Customer extends Row { name: string; phone: string; address: string; createdAt: string }
export interface Payment { date: string; amount: number; method: string; by?: string }
export interface OrderItem { name: string; unit: string; price: number; qty: number }
export interface Order extends Row {
  code: string; customerId: string; items: OrderItem[]; subtotal: number; expressFee: number; express: boolean;
  discount: number; total: number; note: string; payments: Payment[]; status: string;
  history: { status: string; date: string; by?: string }[]; createdAt: string; dueAt: string; createdBy?: string;
}
export interface Expense extends Row { date: string; category: string; note: string; amount: number }
/** Akun pengguna (login nama laundry + username + password).
 *  Mode lokal: tabel `accounts` (+ `laundries`). Mode cloud: tabel `staff` (tersinkron, per realm). */
export interface Laundry { id: string; slug: string; name: string; createdAt: string; recovery?: { algo: string; salt: string; hash: string } }
export interface Account {
  id: string; realmId: string; username: string; name: string; role: 'owner' | 'admin' | 'kasir';
  algo: string; salt: string; hash: string; active: boolean; createdAt: string; lastLogin?: string;
}

export class FaraWashDB extends Dexie {
  settings!: Table<Settings, string>;
  services!: Table<Service, string>;
  customers!: Table<Customer, string>;
  orders!: Table<Order, string>;
  expenses!: Table<Expense, string>;
  laundries!: Table<Laundry, string>;
  accounts!: Table<Account, string>;
  staff!: Table<Account, string>;

  constructor() {
    // Mode cloud: id dibuat otomatis oleh Dexie Cloud ("@id").
    // Mode lokal: id dibuat oleh aplikasi.
    super(isCloud ? 'farawash' : 'farawash-local', isCloud ? { addons: [dexieCloud] } : {});
    const pk = isCloud ? '@id' : 'id';
    this.version(1).stores({
      settings: `${pk}, realmId`,
      services: `${pk}, realmId`,
      customers: `${pk}, realmId, name, phone`,
      orders: `${pk}, realmId, code, customerId, status, createdAt`,
      expenses: `${pk}, realmId, date`,
    });
    if (isCloud) {
      // v2: akun staf (username + password) tersinkron di realm laundry
      this.version(2).stores({ staff: '@id, realmId, [realmId+username]' });
    } else {
      // v2: akun & laundry lokal (login nama laundry + username + password)
      this.version(2).stores({
        laundries: 'id, &slug',
        accounts: 'id, realmId, &[realmId+username]',
      });
    }
    if (isCloud) {
      (this as any).cloud.configure({
        databaseUrl: CLOUD_URL,
        requireAuth: false, // layar Masuk / Daftar Laundry dibuat sendiri
        customLoginGui: true,
        socialAuth: false,
      });
    }
  }
}

export const db = new FaraWashDB();
// Tabel bawaan Dexie Cloud (realms, members, roles) + API cloud
export const cdb: any = db;

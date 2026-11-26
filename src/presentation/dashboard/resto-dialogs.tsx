"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import { today, type BusinessState, type OperatingExpense, type Product, type Receipt, type Restaurant, type Supplier } from "@/src/domain/business-state";
import { receiptOutstanding } from "@/src/domain/business-integrity";
import { recentSuggestions } from "@/src/domain/suggestions";
import { CUSTOM_PRODUCT_OPTION, PRODUCT_CATEGORIES, PRODUCT_UNITS, productDisplayName, receiptSubtotal } from "@/src/domain/inventory";
import { Combobox, FormField, Modal, ModalActions, MoneyInput, money, parseMoney, parseNumber, qty, report, type Notify } from "@/src/presentation/dashboard/resto-ui";

type DialogProps = { commands: BusinessCommands; onNotify: Notify; onClose: () => void };

const optionOf = (value: string, list: readonly string[]) => (list.includes(value) ? value : value ? CUSTOM_PRODUCT_OPTION : list[0]);

export function ProductDialog({ commands, onNotify, onClose, product }: DialogProps & { product?: Product }) {
  const [name, setName] = useState(product?.name ?? "");
  const [categoryChoice, setCategoryChoice] = useState(product ? optionOf(product.category, PRODUCT_CATEGORIES) : PRODUCT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState(product && !PRODUCT_CATEGORIES.includes(product.category as never) ? product.category : "");
  const [size, setSize] = useState(product?.size ?? "");
  const [unitChoice, setUnitChoice] = useState(product ? optionOf(product.unit, PRODUCT_UNITS) : PRODUCT_UNITS[0]);
  const [customUnit, setCustomUnit] = useState(product && !PRODUCT_UNITS.includes(product.unit as never) ? product.unit : "");
  const [price, setPrice] = useState(product ? String(product.defaultSellingPrice) : "");
  const [trackStock, setTrackStock] = useState(product?.trackStock !== false);
  const [manualCost, setManualCost] = useState(product ? String(product.manualCost ?? 0) : "");
  const [initialCost, setInitialCost] = useState("");
  const [minimum, setMinimum] = useState(product ? String(product.minimumStock) : "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const category = categoryChoice === CUSTOM_PRODUCT_OPTION ? customCategory : categoryChoice;
    const unit = unitChoice === CUSTOM_PRODUCT_OPTION ? customUnit : unitChoice;
    if (product && trackStock !== (product.trackStock !== false) && !window.confirm("Produk ini memiliki histori stok. Jika pengelolaan stok dimatikan, invoice baru tidak lagi mengurangi stok dan akan menggunakan HPP manual. Lanjutkan?")) return;
    const base = { name, category, size, unit, sellingPrice: parseMoney(price), trackStock, manualCost: parseMoney(manualCost), minimumStock: parseNumber(minimum) };
    const result = product ? commands.updateProduct(product.id, base) : commands.addProduct({ ...base, initialCost: parseMoney(initialCost) });
    if (report(onNotify, result)) onClose();
  };

  return (
    <Modal
      title={product ? "Edit produk" : "Tambah produk"}
      eyebrow="Stok & Produk"
      description={product ? "Perbarui data produk. Stok dan HPP berubah lewat penerimaan atau penyesuaian." : "Daftarkan produk baru lebih dulu, lalu terima stok dari supplier."}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Nama produk *" span>
            <input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Udang Vaname" />
          </FormField>
          <FormField label="Kategori *">
            <select value={categoryChoice} onChange={(event) => setCategoryChoice(event.target.value)}>
              {PRODUCT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              <option value={CUSTOM_PRODUCT_OPTION}>Kategori lain…</option>
            </select>
          </FormField>
          {categoryChoice === CUSTOM_PRODUCT_OPTION ? (
            <FormField label="Nama kategori *">
              <input required value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Contoh: Bandeng" />
            </FormField>
          ) : (
            <FormField label="Ukuran">
              <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="Contoh: 31/40, Jumbo" />
            </FormField>
          )}
          {categoryChoice === CUSTOM_PRODUCT_OPTION && (
            <FormField label="Ukuran">
              <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="Contoh: 31/40, Jumbo" />
            </FormField>
          )}
          <FormField label="Satuan *">
            <select value={unitChoice} onChange={(event) => setUnitChoice(event.target.value)}>
              {PRODUCT_UNITS.map((item) => <option key={item}>{item}</option>)}
              <option value={CUSTOM_PRODUCT_OPTION}>Satuan lain…</option>
            </select>
          </FormField>
          {unitChoice === CUSTOM_PRODUCT_OPTION && (
            <FormField label="Nama satuan *">
              <input required value={customUnit} onChange={(event) => setCustomUnit(event.target.value)} placeholder="Contoh: ikat" />
            </FormField>
          )}
          <FormField label="Harga jual standar (Rp)">
            <MoneyInput value={price} onChange={setPrice} placeholder="0" />
          </FormField>
          <FormField label="Kelola stok produk ini" hint={trackStock ? "ON · Produk berstok" : "OFF · Produk non-stok"}>
            <label className="stock-toggle">
              <input type="checkbox" checked={trackStock} onChange={(event) => setTrackStock(event.target.checked)} />
              <span>{trackStock ? "Produk berstok" : "Produk non-stok"}</span>
            </label>
          </FormField>
          {!trackStock && (
            <FormField label="HPP manual (Rp) *" hint="Dipakai untuk menghitung HPP dan profit invoice baru.">
              <MoneyInput required value={manualCost} onChange={setManualCost} placeholder="0" />
            </FormField>
          )}
          {!product && trackStock && (
            <FormField label="HPP awal (Rp)" hint="Opsional. Diperbarui otomatis saat stok diterima.">
              <MoneyInput value={initialCost} onChange={setInitialCost} placeholder="0" />
            </FormField>
          )}
          {trackStock && (
            <FormField label="Stok minimum" hint="Peringatan stok menipis muncul di bawah angka ini.">
              <input type="number" min="0" step="any" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder="0" />
            </FormField>
          )}
        </div>
        <ModalActions onCancel={onClose} submitLabel={product ? "Simpan perubahan" : "Simpan produk"} />
      </form>
    </Modal>
  );
}

type DraftItem = { key: number; productId: string; manual: string; digital: string; cost: string };
let draftKey = 0;
const blankItem = (): DraftItem => ({ key: ++draftKey, productId: "", manual: "", digital: "", cost: "" });

export function ReceiveStockDialog({ commands, onNotify, onClose, state }: DialogProps & { state: BusinessState }) {
  const suppliers = state.suppliers.filter((item) => item.status === "ACTIVE");
  const products = state.products.filter((item) => item.status === "ACTIVE" && item.trackStock !== false);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [paid, setPaid] = useState("0");

  const parsed = items.map((item) => ({ productId: item.productId, manualQuantity: parseNumber(item.manual), digitalQuantity: parseNumber(item.digital || item.manual), unitCost: parseMoney(item.cost) }));
  const subtotal = receiptSubtotal(parsed.filter((item) => item.productId));
  const paidAmount = parseMoney(paid);
  const setItem = (key: number, patch: Partial<DraftItem>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const pickProduct = (key: number, productId: string) => {
    const product = state.products.find((item) => item.id === productId);
    setItem(key, { productId, cost: product && product.latestPurchaseCost > 0 && !items.find((item) => item.key === key)?.cost ? String(Math.round(product.latestPurchaseCost)) : items.find((item) => item.key === key)?.cost ?? "" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = commands.receiveStock({ supplierId, date, dueDate, supplierReference: reference, notes, items: parsed, paidAmount });
    if (report(onNotify, result)) onClose();
  };

  return (
    <Modal
      title="Terima stok"
      eyebrow="Stok & Produk"
      description="Catat barang masuk dari supplier. Pembayaran dihitung dari berat manual, stok bertambah sesuai berat digital."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Supplier *">
            <select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Pilih supplier</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </FormField>
          <FormField label="Tanggal terima *">
            <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormField>
          <FormField label="No. referensi supplier">
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Nomor surat jalan / nota" />
          </FormField>
          <FormField label="Jatuh tempo">
            <input type="date" min={date} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>
        </div>
        <div className="multi-item-list receipt-items">
          {items.map((item, index) => {
            const product = state.products.find((entry) => entry.id === item.productId);
            const unit = product?.unit ?? "";
            const diff = parseNumber(item.digital || item.manual) - parseNumber(item.manual);
            return (
              <div className="form-item-card" key={item.key}>
                <div className="form-item-heading">
                  <strong>Produk {index + 1}</strong>
                  {items.length > 1 && (
                    <button className="icon-button danger-button" type="button" aria-label={`Hapus produk ${index + 1}`} onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <FormField label="Produk *" span>
                    <Combobox required ariaLabel={`Produk ${index + 1}`} placeholder="Cari produk" value={item.productId} onChange={(value) => pickProduct(item.key, value)} options={products.map((entry) => ({ value: entry.id, label: productDisplayName(entry), detail: `stok ${qty(entry.stockBalance)} ${entry.unit}`, search: `${entry.sku} ${entry.category}` }))} />
                  </FormField>
                  <FormField label={`Berat manual ${unit ? `(${unit})` : ""} *`} hint="Dasar pembayaran ke supplier">
                    <input required type="number" min="0" step="any" value={item.manual} onChange={(event) => setItem(item.key, { manual: event.target.value })} />
                  </FormField>
                  <FormField label={`Berat digital ${unit ? `(${unit})` : ""}`} hint={diff > 0 ? `Selisih +${qty(diff)} ${unit} masuk sebagai stok` : "Kosongkan jika sama dengan berat manual"}>
                    <input type="number" min="0" step="any" value={item.digital} onChange={(event) => setItem(item.key, { digital: event.target.value })} />
                  </FormField>
                  <FormField label={`Harga beli per ${unit || "satuan"} (Rp) *`} span>
                    <MoneyInput required value={item.cost} onChange={(value) => setItem(item.key, { cost: value })} />
                  </FormField>
                </div>
              </div>
            );
          })}
          <button className="secondary-outline-button add-item-button" type="button" onClick={() => setItems((current) => [...current, blankItem()])}>
            <Plus size={16} /> Tambah produk
          </button>
        </div>
        <div className="form-grid receipt-foot">
          <FormField label="Sudah dibayar (Rp)" hint={`Total tagihan ${money(subtotal)} · sisa ${money(Math.max(0, subtotal - paidAmount))} menjadi utang supplier`}>
            <MoneyInput value={paid} onChange={setPaid} />
          </FormField>
          <FormField label="Catatan">
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opsional" />
          </FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Simpan penerimaan" />
      </form>
    </Modal>
  );
}

export function AdjustStockDialog({ commands, onNotify, onClose, product }: DialogProps & { product: Product }) {
  const [quantity, setQuantity] = useState(String(product.stockBalance));
  const [minimum, setMinimum] = useState(String(product.minimumStock));
  const [notes, setNotes] = useState("");
  const changed = parseNumber(quantity) !== product.stockBalance;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (report(onNotify, commands.adjustStock(product.id, { actualQuantity: parseNumber(quantity), minimumStock: parseNumber(minimum), notes }))) onClose();
  };
  return (
    <Modal title="Sesuaikan stok" eyebrow={productDisplayName(product)} description={`Stok tercatat ${qty(product.stockBalance)} ${product.unit}. Isi jumlah fisik yang benar; selisihnya dicatat otomatis di Mutasi Stok.`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label={`Stok aktual (${product.unit}) *`} hint={`Saldo setelah disimpan persis ${quantity || "0"} ${product.unit}`}>
            <input required autoFocus type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </FormField>
          <FormField label="Batas minimum stok">
            <input required type="number" min="0" step="any" value={minimum} onChange={(event) => setMinimum(event.target.value)} />
          </FormField>
          {changed && (
            <FormField label="Alasan perubahan *" span>
              <input required value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: hasil stok opname fisik" />
            </FormField>
          )}
        </div>
        <ModalActions onCancel={onClose} submitLabel="Simpan penyesuaian" />
      </form>
    </Modal>
  );
}

export function AdjustCostDialog({ commands, onNotify, onClose, product }: DialogProps & { product: Product }) {
  const [cost, setCost] = useState(String(Math.round(product.averageHpp)));
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (report(onNotify, commands.adjustProductCost(product.id, { newCost: parseMoney(cost), reason }))) onClose();
  };
  return (
    <Modal title="Sesuaikan HPP" eyebrow={productDisplayName(product)} description={`HPP rata-rata saat ini ${money(product.averageHpp)} per ${product.unit}. Invoice lama tidak berubah.`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label={`HPP baru per ${product.unit} (Rp) *`}>
            <MoneyInput required value={cost} onChange={setCost} />
          </FormField>
          <FormField label="Alasan penyesuaian *">
            <input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: koreksi HPP pembukaan" />
          </FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Simpan HPP" />
      </form>
    </Modal>
  );
}

export function CustomerPriceDialog({ commands, onNotify, onClose, state, initial }: DialogProps & { state: BusinessState; initial?: { restaurantId: string; productId: string; price: number } }) {
  const [restaurantId, setRestaurantId] = useState(initial?.restaurantId ?? "");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const product = state.products.find((item) => item.id === productId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (report(onNotify, commands.setCustomerPrice({ restaurantId, productId, sellingPrice: parseMoney(price) }))) onClose();
  };
  return (
    <Modal title={initial ? "Ubah harga khusus" : "Harga khusus restoran"} eyebrow="Harga Jual" description="Harga ini dipakai otomatis saat invoice dibuat untuk restoran tersebut." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Restoran *">
            <select required disabled={!!initial} value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
              <option value="">Pilih restoran</option>
              {state.restaurants.filter((item) => item.status === "ACTIVE" || item.id === initial?.restaurantId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </FormField>
          <FormField label="Produk *">
            <Combobox required disabled={!!initial} ariaLabel="Produk" placeholder="Cari produk" value={productId} onChange={setProductId} options={state.products.filter((item) => item.status === "ACTIVE" || item.id === initial?.productId).map((item) => ({ value: item.id, label: productDisplayName(item), search: `${item.sku} ${item.category}` }))} />
          </FormField>
          <FormField label="Harga khusus (Rp) *" hint={product ? `Harga standar ${money(product.defaultSellingPrice)} · HPP ${money(product.averageHpp)}` : undefined} span>
            <MoneyInput required value={price} onChange={setPrice} />
          </FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Simpan harga" />
      </form>
    </Modal>
  );
}

export function SupplierDialog({ commands, onNotify, onClose, supplier }: DialogProps & { supplier?: Supplier }) {
  const [form, setForm] = useState({ name: supplier?.name ?? "", contactName: supplier?.contactName ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", address: supplier?.address ?? "" });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = supplier ? commands.updateSupplier(supplier.id, form) : commands.addSupplier(form);
    if (report(onNotify, result)) onClose();
  };
  return (
    <Modal title={supplier ? "Edit supplier" : "Tambah supplier"} eyebrow="Supplier" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Nama supplier *" span><input required autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} /></FormField>
          <FormField label="Nama kontak"><input value={form.contactName} onChange={(event) => set("contactName", event.target.value)} /></FormField>
          <FormField label="Telepon"><input inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></FormField>
          <FormField label="Email" span><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></FormField>
          <FormField label="Alamat" span><input value={form.address} onChange={(event) => set("address", event.target.value)} /></FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel={supplier ? "Simpan perubahan" : "Simpan supplier"} />
      </form>
    </Modal>
  );
}

export function RestaurantDialog({ commands, onNotify, onClose, restaurant }: DialogProps & { restaurant?: Restaurant }) {
  const [form, setForm] = useState({ name: restaurant?.name ?? "", contactName: restaurant?.contactName ?? "", phone: restaurant?.phone ?? "", email: restaurant?.email ?? "", address: restaurant?.address ?? "", notes: restaurant?.notes ?? "", term: String(restaurant?.paymentTermDays ?? 7) });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { name: form.name, contactName: form.contactName, phone: form.phone, email: form.email, address: form.address, notes: form.notes, paymentTermDays: Number(form.term) };
    const result = restaurant ? commands.updateRestaurant(restaurant.id, input) : commands.addRestaurant(input);
    if (report(onNotify, result)) onClose();
  };
  return (
    <Modal title={restaurant ? "Edit restoran" : "Tambah restoran"} eyebrow="Restoran" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Nama restoran *" span><input required autoFocus value={form.name} onChange={(event) => set("name", event.target.value)} /></FormField>
          <FormField label="Nama kontak"><input value={form.contactName} onChange={(event) => set("contactName", event.target.value)} /></FormField>
          <FormField label="Telepon"><input inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></FormField>
          <FormField label="Email"><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></FormField>
          <FormField label="Termin pembayaran (hari) *" hint="Dipakai untuk jatuh tempo invoice otomatis"><input required type="number" min="0" max="3650" step="1" value={form.term} onChange={(event) => set("term", event.target.value)} /></FormField>
          <FormField label="Alamat" span><input value={form.address} onChange={(event) => set("address", event.target.value)} /></FormField>
          <FormField label="Catatan" span><input value={form.notes} onChange={(event) => set("notes", event.target.value)} /></FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel={restaurant ? "Simpan perubahan" : "Simpan restoran"} />
      </form>
    </Modal>
  );
}

export const EXPENSE_CATEGORIES = ["Logistik", "Operasional", "Gaji", "Sewa", "Listrik & Air", "Kemasan", "Es & Pendingin", "Lainnya"];

export function ExpenseDialog({ commands, onNotify, onClose, expense, expenses }: DialogProps & { expense?: OperatingExpense; expenses: OperatingExpense[] }) {
  const categoryListId = useId();
  const descriptionListId = useId();
  const [date, setDate] = useState(expense?.date ?? today());
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { date, category, description, amount: parseMoney(amount) };
    const result = expense ? commands.updateOperatingExpense(expense.id, input) : commands.addOperatingExpense(input);
    if (report(onNotify, result)) onClose();
  };
  return (
    <Modal title={expense ? "Edit pengeluaran" : "Catat pengeluaran"} eyebrow="Pengeluaran Resto & Online" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Tanggal *"><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></FormField>
          <FormField label="Kategori *">
            <input required list={categoryListId} value={category} onChange={(event) => setCategory(event.target.value)} />
            <datalist id={categoryListId}>{recentSuggestions([...EXPENSE_CATEGORIES, ...expenses.map((item) => item.category)]).map((item) => <option key={item} value={item} />)}</datalist>
          </FormField>
          <FormField label="Deskripsi *" span><input required list={descriptionListId} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contoh: bensin kendaraan operasional" /><datalist id={descriptionListId}>{recentSuggestions(expenses.map((item) => item.description)).map((item) => <option key={item} value={item} />)}</datalist></FormField>
          <FormField label="Jumlah (Rp) *" span><MoneyInput required value={amount} onChange={setAmount} /></FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel={expense ? "Simpan perubahan" : "Simpan pengeluaran"} />
      </form>
    </Modal>
  );
}

export function SupplierPaymentDialog({ commands, onNotify, onClose, receipt, supplierName }: DialogProps & { receipt: Receipt; supplierName: string }) {
  const outstanding = receiptOutstanding(receipt);
  const unknown = outstanding === null;
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(unknown ? "" : String(outstanding));
  const [method, setMethod] = useState("Transfer");
  const [reference, setReference] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = unknown ? commands.verifyReceiptPayment(receipt.id, parseMoney(amount)) : commands.paySupplierReceipt({ receiptId: receipt.id, date, amount: parseMoney(amount), method, reference });
    if (report(onNotify, result)) onClose();
  };
  return (
    <Modal
      title={unknown ? "Verifikasi pembayaran" : "Bayar utang supplier"}
      eyebrow={`${supplierName} · ${receipt.receiptNumber}`}
      description={unknown ? `Data lama belum mencatat pembayaran. Isi jumlah yang sudah dibayar dari total ${money(receipt.subtotal)}.` : `Total ${money(receipt.subtotal)} · sisa utang ${money(outstanding)}.`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {!unknown && <FormField label="Tanggal bayar *"><input required type="date" min={receipt.date} value={date} onChange={(event) => setDate(event.target.value)} /></FormField>}
          <FormField label={unknown ? "Sudah dibayar (Rp) *" : "Jumlah bayar (Rp) *"} span={unknown}><MoneyInput required value={amount} onChange={setAmount} /></FormField>
          {!unknown && (
            <>
              <FormField label="Metode *">
                <select value={method} onChange={(event) => setMethod(event.target.value)}><option>Transfer</option><option>Tunai</option></select>
              </FormField>
              <FormField label="Referensi"><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Nomor transfer / catatan" /></FormField>
            </>
          )}
        </div>
        <ModalActions onCancel={onClose} submitLabel={unknown ? "Simpan verifikasi" : "Catat pembayaran"} />
      </form>
    </Modal>
  );
}

export function CancelReceiptDialog({ commands, onNotify, onClose, receipt }: DialogProps & { receipt: Receipt }) {
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (report(onNotify, commands.cancelStockReceipt(receipt.id, reason))) onClose();
  };
  return (
    <Modal title="Batalkan penerimaan" eyebrow={receipt.receiptNumber} description="Stok produk dikurangi kembali dan tagihan supplier dihapus dari utang. Tidak bisa jika stok sudah terpakai." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Alasan pembatalan *" span><input required autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: salah input jumlah" /></FormField>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Batalkan penerimaan" />
      </form>
    </Modal>
  );
}

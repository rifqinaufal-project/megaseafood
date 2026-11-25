"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, Download, History, Pencil, Plus, Power, SlidersHorizontal, Trash2, Wallet, XCircle } from "lucide-react";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import { today, type BusinessState, type OperatingExpense, type Product, type Receipt, type Restaurant, type Supplier } from "@/src/domain/business-state";
import { receiptOutstanding } from "@/src/domain/business-integrity";
import { calculateMargin, getStockStatus, productDisplayName, stockMovementLabel, weightDifferenceRows } from "@/src/domain/inventory";
import {
  AdjustCostDialog,
  AdjustStockDialog,
  CancelReceiptDialog,
  CustomerPriceDialog,
  ExpenseDialog,
  EXPENSE_CATEGORIES,
  ProductDialog,
  ReceiveStockDialog,
  RestaurantDialog,
  SupplierDialog,
  SupplierPaymentDialog,
} from "@/src/presentation/dashboard/resto-dialogs";
import {
  IconAction,
  PageHead,
  Pager,
  SearchBox,
  SelectFilter,
  Stats,
  StatusChip,
  Table,
  Cell,
  Tabs,
  downloadCsv,
  matches,
  money,
  paginate,
  qty,
  report,
  type Notify,
} from "@/src/presentation/dashboard/resto-ui";

type PageProps = {
  state: BusinessState;
  commands: BusinessCommands;
  onNotify: Notify;
  initialFormOpen?: boolean;
};

const confirmDelete = (label: string) => window.confirm(`Hapus ${label}? Tindakan ini tidak bisa dibatalkan.`);

const productName = (state: BusinessState, id: string) => {
  const product = state.products.find((item) => item.id === id);
  return product ? productDisplayName(product) : "Produk dihapus";
};

// ───────────────────────── Stok ─────────────────────────

type StockTab = "products" | "movements" | "differences" | "prices";
type StockDialogState =
  | { kind: "product"; product?: Product }
  | { kind: "receive" }
  | { kind: "stock"; product: Product }
  | { kind: "cost"; product: Product }
  | { kind: "price"; initial?: { restaurantId: string; productId: string; price: number } };

export function StockPage({ state, commands, onNotify, initialFormOpen = false }: PageProps) {
  const [tab, setTab] = useState<StockTab>("products");
  const [dialog, setDialog] = useState<StockDialogState | null>(initialFormOpen ? { kind: "receive" } : null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [sort, setSort] = useState("name");
  const [movementType, setMovementType] = useState("ALL");
  const [movementProduct, setMovementProduct] = useState("");
  const [pageNumber, setPageNumber] = useState(1);

  const active = state.products.filter((item) => item.status === "ACTIVE");
  const tracked = active.filter((item) => item.trackStock !== false);
  const lowStock = tracked.filter((item) => getStockStatus(item.stockBalance, item.minimumStock) === "Menipis");
  const outOfStock = tracked.filter((item) => getStockStatus(item.stockBalance, item.minimumStock) === "Habis");
  const inventoryValue = tracked.reduce((sum, item) => sum + item.stockBalance * item.averageHpp, 0);
  const totalUnits = tracked.reduce((sum, item) => sum + item.stockBalance, 0);

  const products = useMemo(() => {
    const filtered = state.products.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
       if (stockFilter !== "ALL" && (item.trackStock === false || getStockStatus(item.stockBalance, item.minimumStock).toLowerCase() !== stockFilter)) return false;
      return matches(search, item.name, item.sku, item.category, item.size);
    });
    const sorters: Record<string, (a: Product, b: Product) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      stock: (a, b) => a.stockBalance - b.stockBalance,
      value: (a, b) => b.stockBalance * b.averageHpp - a.stockBalance * a.averageHpp,
       margin: (a, b) => calculateMargin(b.defaultSellingPrice, b.trackStock === false ? (b.manualCost ?? 0) : b.averageHpp).percentage - calculateMargin(a.defaultSellingPrice, a.trackStock === false ? (a.manualCost ?? 0) : a.averageHpp).percentage,
    };
    return [...filtered].sort(sorters[sort] ?? sorters.name);
  }, [state.products, search, status, stockFilter, sort]);

  const movements = useMemo(
    () =>
       [...state.stockMovements]
         .reverse()
        .filter((item) => state.products.find((product) => product.id === item.productId)?.trackStock !== false)
         .filter((item) => (movementType === "ALL" || item.type === movementType) && (!movementProduct || item.productId === movementProduct) && matches(search, productName(state, item.productId), item.reference, item.notes)),
    [state, search, movementType, movementProduct],
  );
  const differences = useMemo(() => weightDifferenceRows(state.receipts).filter((row) => state.products.find((product) => product.id === row.productId)?.trackStock !== false).filter((row) => matches(search, row.receiptNumber, productName(state, row.productId), state.suppliers.find((item) => item.id === row.supplierId)?.name)), [state, search]);
  const prices = useMemo(
    () => state.customerPrices.filter((item) => matches(search, state.restaurants.find((entry) => entry.id === item.restaurantId)?.name, productName(state, item.productId))),
    [state, search],
  );

  const changeTab = (next: StockTab) => {
    setTab(next);
    setSearch("");
    setPageNumber(1);
  };
  const close = () => setDialog(null);
  const base = { commands, onNotify, onClose: close };

  const exportProducts = () => {
    downloadCsv("stok-produk", ["SKU", "Produk", "Kategori", "Mode", "Stok", "Satuan", "Minimum", "HPP", "Harga jual", "Status"], products.map((item) => [item.sku, productDisplayName(item), item.category, item.trackStock === false ? "Non-stok" : "Stok", item.trackStock === false ? "—" : item.stockBalance, item.unit, item.trackStock === false ? "—" : item.minimumStock, Math.round(item.trackStock === false ? (item.manualCost ?? 0) : item.averageHpp), item.defaultSellingPrice, item.status]));
    onNotify(`${products.length} produk berhasil diexport`);
  };

  const rowsFor = <T,>(items: T[]) => paginate(items, pageNumber);
  const productPage = rowsFor(products);
  const movementPage = rowsFor(movements);
  const differencePage = rowsFor(differences);
  const pricePage = rowsFor(prices);

  const showHistory = (product: Product) => {
    setTab("movements");
    setMovementProduct(product.id);
    setSearch("");
    setPageNumber(1);
  };

  return (
    <div className="workspace-page" data-page-key="Stock, Price & Cost">
      <PageHead eyebrow="Resto & Online / Stok" title="Stok & produk" description="Kelola produk, penerimaan stok, HPP rata-rata, dan harga jual.">
        <button className="secondary-outline-button" type="button" onClick={() => setDialog({ kind: "product" })}>
          <Plus size={16} /> Tambah produk
        </button>
        <button className="primary-button" type="button" onClick={() => setDialog({ kind: "receive" })}>
          <Download size={16} /> Terima stok
        </button>
      </PageHead>

      <Stats
        items={[
           { label: "SKU berstok", value: tracked.length.toString(), detail: `${active.length - tracked.length} non-stok · ${state.products.length - active.length} nonaktif` },
          { label: "Total unit", value: qty(totalUnits), detail: "gabungan semua satuan" },
          { label: "Nilai persediaan", value: money(inventoryValue), detail: "stok × HPP rata-rata" },
          { label: "Stok menipis", value: lowStock.length.toString(), detail: "di bawah batas minimum", tone: lowStock.length ? "warn" : undefined },
          { label: "Stok habis", value: outOfStock.length.toString(), detail: "perlu diisi ulang", tone: outOfStock.length ? "danger" : undefined },
        ]}
      />

      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="stock-alert" role="status">
          <AlertTriangle size={18} />
          <p>
            <strong>{lowStock.length + outOfStock.length} produk perlu perhatian.</strong>{" "}
            {[...outOfStock, ...lowStock].slice(0, 3).map((item) => productDisplayName(item)).join(", ")}
            {lowStock.length + outOfStock.length > 3 ? ", dan lainnya" : ""}.
          </p>
          <button className="text-link" type="button" onClick={() => { changeTab("products"); setStockFilter(outOfStock.length ? "habis" : "menipis"); }}>
            Lihat produk
          </button>
        </div>
      )}

      <section className="panel resource-panel">
        <Tabs
          value={tab}
          onChange={changeTab}
          items={[
            { value: "products", label: "Produk & Stok" },
            { value: "movements", label: "Mutasi Stok" },
            { value: "differences", label: "Selisih Timbangan" },
            { value: "prices", label: "Harga Jual" },
          ]}
        />
        <div className="resource-toolbar resto-toolbar">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} placeholder="Cari…" />
          <div className="toolbar-filters">
            {tab === "products" && (
              <>
                <SelectFilter label="Status produk" value={status} onChange={(value) => { setStatus(value); setPageNumber(1); }} options={[{ value: "ACTIVE", label: "Produk aktif" }, { value: "INACTIVE", label: "Nonaktif" }, { value: "ALL", label: "Semua produk" }]} />
                <SelectFilter label="Status stok" value={stockFilter} onChange={(value) => { setStockFilter(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua stok" }, { value: "aman", label: "Aman" }, { value: "menipis", label: "Menipis" }, { value: "habis", label: "Habis" }]} />
                <SelectFilter label="Urutkan" value={sort} onChange={setSort} options={[{ value: "name", label: "Nama A–Z" }, { value: "stock", label: "Stok terendah" }, { value: "value", label: "Nilai tertinggi" }, { value: "margin", label: "Margin tertinggi" }]} />
                <button className="secondary-outline-button compact" type="button" onClick={exportProducts}><Download size={14} /> Export</button>
              </>
            )}
            {tab === "movements" && (
              <>
                <SelectFilter label="Jenis mutasi" value={movementType} onChange={(value) => { setMovementType(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua jenis" }, ...(["PURCHASE_IN", "SALE_OUT", "INVOICE_VOID_RETURN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RECEIPT_CANCEL_OUT", "COST_ADJUSTMENT"] as const).map((value) => ({ value, label: stockMovementLabel(value) }))]} />
                {movementProduct && (
                  <button className="filter-chip" type="button" onClick={() => setMovementProduct("")}>
                    {productName(state, movementProduct)} <XCircle size={14} />
                  </button>
                )}
              </>
            )}
            {tab === "prices" && (
              <button className="primary-button compact" type="button" onClick={() => setDialog({ kind: "price" })}>
                <Plus size={14} /> Harga khusus
              </button>
            )}
          </div>
        </div>

        {tab === "products" && (
          <>
             <Table columns={["Produk", "Stok", "Minimum", "HPP", "Harga jual", "Margin", "Status", ""]} count={products.length} empty={state.products.length ? "Tidak ada produk yang cocok dengan filter." : "Belum ada produk. Klik Tambah produk untuk memulai."}>
               {productPage.rows.map((item) => {
                 const stock = item.trackStock === false ? null : getStockStatus(item.stockBalance, item.minimumStock);
                 const effectiveHpp = item.trackStock === false ? (item.manualCost ?? 0) : item.averageHpp;
                 const margin = calculateMargin(item.defaultSellingPrice, effectiveHpp);
                return (
                  <tr key={item.id}>
                    <Cell label="Produk" className="resource-primary-cell">
                      <strong>{productDisplayName(item)}</strong>
                       <small className="cell-sub">{item.sku} · {item.category} · {item.trackStock === false ? "Non-stok" : "Stok"}</small>
                    </Cell>
                    <Cell label="Stok">{item.trackStock === false ? "—" : `${qty(item.stockBalance)} ${item.unit}`}</Cell>
                    <Cell label="Minimum">{item.trackStock === false ? "—" : `${qty(item.minimumStock)} ${item.unit}`}</Cell>
                    <Cell label="HPP">{money(effectiveHpp)} <small className="cell-sub">{item.trackStock === false ? "manual" : "rata-rata stok"}</small></Cell>
                    <Cell label="Harga jual">{money(item.defaultSellingPrice)}</Cell>
                    <Cell label="Margin">
                      <span className={margin.nominal < 0 ? "stat-danger" : undefined}>{margin.percentage.toFixed(1)}%</span>
                    </Cell>
                    <Cell label="Status">
                       {item.status === "INACTIVE" ? <StatusChip tone="nonaktif">Nonaktif</StatusChip> : item.trackStock === false ? <StatusChip tone="tercatat">Non-stok</StatusChip> : <StatusChip tone={stock === "Aman" ? "lunas" : stock === "Menipis" ? "tercatat" : "danger"}>{stock}</StatusChip>}
                    </Cell>
                    <Cell label="Aksi" className="row-actions">
                       {item.trackStock !== false && <IconAction label="Riwayat mutasi" onClick={() => showHistory(item)}><History size={15} /></IconAction>}
                       {item.trackStock !== false && <IconAction label="Sesuaikan stok" onClick={() => setDialog({ kind: "stock", product: item })}><SlidersHorizontal size={15} /></IconAction>}
                      <IconAction label="Sesuaikan HPP" onClick={() => setDialog({ kind: "cost", product: item })}><BadgeDollarSign size={15} /></IconAction>
                      <IconAction label="Edit produk" onClick={() => setDialog({ kind: "product", product: item })}><Pencil size={15} /></IconAction>
                      <IconAction label={item.status === "ACTIVE" ? "Nonaktifkan produk" : "Aktifkan produk"} onClick={() => report(onNotify, commands.toggleProductStatus(item.id))}><Power size={15} /></IconAction>
                      <IconAction label="Hapus produk" danger onClick={() => confirmDelete(`produk ${item.name}`) && report(onNotify, commands.deleteProduct(item.id))}><Trash2 size={15} /></IconAction>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={productPage.current} total={products.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}

        {tab === "movements" && (
          <>
            <Table columns={["Tanggal", "Produk", "Jenis", "Jumlah", "Saldo akhir", "HPP/unit", "Referensi", "Catatan"]} count={movements.length} empty="Belum ada mutasi stok. Mutasi tercatat otomatis saat stok diterima, dijual, atau disesuaikan.">
              {movementPage.rows.map((item) => {
                const product = state.products.find((entry) => entry.id === item.productId);
                return (
                  <tr key={item.id}>
                    <Cell label="Tanggal">{item.date}</Cell>
                    <Cell label="Produk" className="resource-primary-cell"><strong>{productName(state, item.productId)}</strong></Cell>
                    <Cell label="Jenis">{stockMovementLabel(item.type)}</Cell>
                    <Cell label="Jumlah">
                      <span className={item.quantity < 0 ? "stat-danger" : item.quantity > 0 ? "stat-ok" : undefined}>
                        {item.quantity > 0 ? "+" : ""}{qty(item.quantity)} {product?.unit}
                      </span>
                    </Cell>
                    <Cell label="Saldo akhir">{qty(item.balanceAfter)} {product?.unit}</Cell>
                    <Cell label="HPP/unit">{money(item.unitCost)}</Cell>
                    <Cell label="Referensi">{item.reference || "—"}</Cell>
                    <Cell label="Catatan">{item.notes || "—"}</Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={movementPage.current} total={movements.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}

        {tab === "differences" && (
          <>
            <p className="tab-note">
              Selisih terjadi saat berat digital lebih besar dari berat manual. Supplier dibayar sesuai berat manual, jadi selisih menurunkan HPP efektif dan menambah nilai stok.
            </p>
            <Table columns={["Penerimaan", "Produk", "Manual", "Digital", "Selisih", "Harga beli", "HPP efektif", "Nilai tambahan"]} count={differences.length} empty="Belum ada selisih timbangan. Selisih muncul bila berat digital melebihi berat manual.">
              {differencePage.rows.map((row) => {
                const unit = state.products.find((item) => item.id === row.productId)?.unit;
                return (
                  <tr key={row.id}>
                    <Cell label="Penerimaan" className="resource-primary-cell">
                      <strong>{row.receiptNumber}</strong>
                      <small className="cell-sub">{row.date} · {state.suppliers.find((item) => item.id === row.supplierId)?.name ?? "Supplier dihapus"}</small>
                    </Cell>
                    <Cell label="Produk">{productName(state, row.productId)}</Cell>
                    <Cell label="Manual">{qty(row.manualQuantity)} {unit}</Cell>
                    <Cell label="Digital">{qty(row.digitalQuantity)} {unit}</Cell>
                    <Cell label="Selisih"><span className="stat-ok">+{qty(row.difference)} {unit}</span></Cell>
                    <Cell label="Harga beli">{money(row.unitCost)}</Cell>
                    <Cell label="HPP efektif">{money(row.effectiveUnitCost)} <small className="cell-sub">turun {money(row.hppReduction)}</small></Cell>
                    <Cell label="Nilai tambahan">{money(row.estimatedStockValue)}</Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={differencePage.current} total={differences.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}

        {tab === "prices" && (
          <>
            <p className="tab-note">Harga khusus dipakai otomatis saat membuat invoice untuk restoran tersebut. Produk tanpa harga khusus memakai harga standar.</p>
            <Table columns={["Restoran", "Produk", "Harga standar", "Harga khusus", "Margin", "Diubah", ""]} count={prices.length} empty="Belum ada harga khusus restoran.">
              {pricePage.rows.map((item) => {
                const product = state.products.find((entry) => entry.id === item.productId);
                const margin = calculateMargin(item.sellingPrice, product?.averageHpp ?? 0);
                return (
                  <tr key={item.id}>
                    <Cell label="Restoran" className="resource-primary-cell"><strong>{state.restaurants.find((entry) => entry.id === item.restaurantId)?.name ?? "Restoran dihapus"}</strong></Cell>
                    <Cell label="Produk">{productName(state, item.productId)}</Cell>
                    <Cell label="Harga standar">{money(product?.defaultSellingPrice ?? 0)}</Cell>
                    <Cell label="Harga khusus"><strong>{money(item.sellingPrice)}</strong></Cell>
                    <Cell label="Margin"><span className={margin.nominal < 0 ? "stat-danger" : undefined}>{margin.percentage.toFixed(1)}%</span></Cell>
                    <Cell label="Diubah">{item.date}</Cell>
                    <Cell label="Aksi" className="row-actions">
                      <IconAction label="Ubah harga khusus" onClick={() => setDialog({ kind: "price", initial: { restaurantId: item.restaurantId, productId: item.productId, price: item.sellingPrice } })}><Pencil size={15} /></IconAction>
                      <IconAction label="Hapus harga khusus" danger onClick={() => confirmDelete("harga khusus ini") && report(onNotify, commands.deleteCustomerPrice(item.id))}><Trash2 size={15} /></IconAction>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={pricePage.current} total={prices.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}
      </section>

      {dialog?.kind === "product" && <ProductDialog {...base} product={dialog.product} />}
      {dialog?.kind === "receive" && <ReceiveStockDialog {...base} state={state} />}
      {dialog?.kind === "stock" && <AdjustStockDialog {...base} product={dialog.product} />}
      {dialog?.kind === "cost" && <AdjustCostDialog {...base} product={dialog.product} />}
      {dialog?.kind === "price" && <CustomerPriceDialog {...base} state={state} initial={dialog.initial} />}
    </div>
  );
}

// ───────────────────────── Supplier ─────────────────────────

export function SuppliersPage({ state, commands, onNotify, initialFormOpen = false }: PageProps) {
  const [dialog, setDialog] = useState<{ supplier?: Supplier } | null>(initialFormOpen ? {} : null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pageNumber, setPageNumber] = useState(1);

  const summary = (supplier: Supplier) => {
    const receipts = state.receipts.filter((item) => item.supplierId === supplier.id && item.status === "POSTED");
    return {
      count: receipts.length,
      total: receipts.reduce((sum, item) => sum + item.subtotal, 0),
      debt: receipts.reduce((sum, item) => sum + (receiptOutstanding(item) ?? 0), 0),
    };
  };
  const suppliers = state.suppliers.filter((item) => (status === "ALL" || item.status === status) && matches(search, item.name, item.contactName, item.phone, item.email, item.address));
  const page = paginate(suppliers, pageNumber);
  const posted = state.receipts.filter((item) => item.status === "POSTED");

  return (
    <div className="workspace-page" data-page-key="Suppliers">
      <PageHead eyebrow="Resto & Online / Supplier" title="Supplier" description="Kelola supplier dan histori penerimaan stok.">
        <button className="primary-button" type="button" onClick={() => setDialog({})}><Plus size={16} /> Tambah supplier</button>
      </PageHead>
      <Stats
        items={[
          { label: "Supplier aktif", value: state.suppliers.filter((item) => item.status === "ACTIVE").length.toString(), detail: `${state.suppliers.length} total supplier` },
          { label: "Total pembelian", value: money(posted.reduce((sum, item) => sum + item.subtotal, 0)), detail: `${posted.length} penerimaan stok` },
          { label: "Utang berjalan", value: money(posted.reduce((sum, item) => sum + (receiptOutstanding(item) ?? 0), 0)), detail: "tagihan supplier belum lunas" },
        ]}
      />
      <section className="panel resource-panel">
        <div className="resource-toolbar resto-toolbar">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} placeholder="Cari supplier…" />
          <div className="toolbar-filters">
            <SelectFilter label="Status supplier" value={status} onChange={(value) => { setStatus(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua status" }, { value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Nonaktif" }]} />
          </div>
        </div>
        <Table columns={["Supplier", "Kontak", "Alamat", "Penerimaan", "Total pembelian", "Sisa utang", "Status", ""]} count={suppliers.length} empty={state.suppliers.length ? "Tidak ada supplier yang cocok." : "Belum ada supplier. Klik Tambah supplier untuk memulai."}>
          {page.rows.map((item) => {
            const data = summary(item);
            return (
              <tr key={item.id}>
                <Cell label="Supplier" className="resource-primary-cell"><strong>{item.name}</strong></Cell>
                <Cell label="Kontak">
                  {item.contactName || "—"}
                  <small className="cell-sub">{[item.phone, item.email].filter(Boolean).join(" · ") || "Belum ada kontak"}</small>
                </Cell>
                <Cell label="Alamat" className="cell-wrap">{item.address || "—"}</Cell>
                <Cell label="Penerimaan">{data.count}</Cell>
                <Cell label="Total pembelian">{money(data.total)}</Cell>
                <Cell label="Sisa utang"><span className={data.debt > 0 ? "stat-warn" : undefined}>{money(data.debt)}</span></Cell>
                <Cell label="Status"><StatusChip tone={item.status === "ACTIVE" ? "lunas" : "nonaktif"}>{item.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</StatusChip></Cell>
                <Cell label="Aksi" className="row-actions">
                  <IconAction label="Edit supplier" onClick={() => setDialog({ supplier: item })}><Pencil size={15} /></IconAction>
                  <IconAction label={item.status === "ACTIVE" ? "Nonaktifkan supplier" : "Aktifkan supplier"} onClick={() => report(onNotify, commands.toggleSupplierStatus(item.id))}><Power size={15} /></IconAction>
                  <IconAction label="Hapus supplier" danger onClick={() => confirmDelete(`supplier ${item.name}`) && report(onNotify, commands.deleteSupplier(item.id))}><Trash2 size={15} /></IconAction>
                </Cell>
              </tr>
            );
          })}
        </Table>
        <Pager page={page.current} total={suppliers.length} pageSize={25} onPage={setPageNumber} />
      </section>
      {dialog && <SupplierDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} supplier={dialog.supplier} />}
    </div>
  );
}

// ───────────────────────── Restoran ─────────────────────────

export function RestaurantsPage({ state, commands, onNotify, initialFormOpen = false }: PageProps) {
  const [dialog, setDialog] = useState<{ restaurant?: Restaurant } | null>(initialFormOpen ? {} : null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pageNumber, setPageNumber] = useState(1);

  const receivable = (restaurant: Restaurant) => state.invoices.filter((item) => item.restaurantId === restaurant.id).reduce((sum, item) => sum + item.outstandingAmount, 0);
  const restaurants = state.restaurants.filter((item) => (status === "ALL" || item.status === status) && matches(search, item.name, item.contactName, item.phone, item.email, item.address));
  const page = paginate(restaurants, pageNumber);

  return (
    <div className="workspace-page" data-page-key="Restaurants">
      <PageHead eyebrow="Resto & Online / Restoran" title="Restoran" description="Kelola customer restoran, termin pembayaran, dan piutang.">
        <button className="primary-button" type="button" onClick={() => setDialog({})}><Plus size={16} /> Tambah restoran</button>
      </PageHead>
      <Stats
        items={[
          { label: "Restoran aktif", value: state.restaurants.filter((item) => item.status === "ACTIVE").length.toString(), detail: `${state.restaurants.length} total restoran` },
          { label: "Piutang berjalan", value: money(state.invoices.filter((item) => item.restaurantId).reduce((sum, item) => sum + item.outstandingAmount, 0)), detail: "invoice restoran belum lunas" },
          { label: "Harga khusus", value: state.customerPrices.length.toString(), detail: "harga per restoran & produk" },
        ]}
      />
      <section className="panel resource-panel">
        <div className="resource-toolbar resto-toolbar">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} placeholder="Cari restoran…" />
          <div className="toolbar-filters">
            <SelectFilter label="Status restoran" value={status} onChange={(value) => { setStatus(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua status" }, { value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Nonaktif" }]} />
          </div>
        </div>
        <Table columns={["Restoran", "Kontak", "Termin", "Invoice", "Piutang", "Harga khusus", "Status", ""]} count={restaurants.length} empty={state.restaurants.length ? "Tidak ada restoran yang cocok." : "Belum ada restoran. Klik Tambah restoran untuk memulai."}>
          {page.rows.map((item) => {
            const debt = receivable(item);
            return (
              <tr key={item.id}>
                <Cell label="Restoran" className="resource-primary-cell">
                  <strong>{item.name}</strong>
                  {item.address && <small className="cell-sub">{item.address}</small>}
                </Cell>
                <Cell label="Kontak">
                  {item.contactName || "—"}
                  <small className="cell-sub">{[item.phone, item.email].filter(Boolean).join(" · ") || "Belum ada kontak"}</small>
                </Cell>
                <Cell label="Termin">{item.paymentTermDays} hari</Cell>
                <Cell label="Invoice">{state.invoices.filter((entry) => entry.restaurantId === item.id).length}</Cell>
                <Cell label="Piutang"><span className={debt > 0 ? "stat-warn" : undefined}>{money(debt)}</span></Cell>
                <Cell label="Harga khusus">{state.customerPrices.filter((entry) => entry.restaurantId === item.id).length}</Cell>
                <Cell label="Status"><StatusChip tone={item.status === "ACTIVE" ? "lunas" : "nonaktif"}>{item.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</StatusChip></Cell>
                <Cell label="Aksi" className="row-actions">
                  <IconAction label="Edit restoran" onClick={() => setDialog({ restaurant: item })}><Pencil size={15} /></IconAction>
                  <IconAction label={item.status === "ACTIVE" ? "Nonaktifkan restoran" : "Aktifkan restoran"} onClick={() => report(onNotify, commands.toggleRestaurantStatus(item.id))}><Power size={15} /></IconAction>
                  <IconAction label="Hapus restoran" danger onClick={() => confirmDelete(`restoran ${item.name}`) && report(onNotify, commands.deleteRestaurant(item.id))}><Trash2 size={15} /></IconAction>
                </Cell>
              </tr>
            );
          })}
        </Table>
        <Pager page={page.current} total={restaurants.length} pageSize={25} onPage={setPageNumber} />
      </section>
      {dialog && <RestaurantDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} restaurant={dialog.restaurant} />}
    </div>
  );
}

// ───────────────────────── Utang supplier ─────────────────────────

type PayableStatus = "cancelled" | "verify" | "paid" | "overdue" | "open";

function payableStatus(receipt: Receipt): PayableStatus {
  if (receipt.status === "CANCELLED") return "cancelled";
  const outstanding = receiptOutstanding(receipt);
  if (outstanding === null) return "verify";
  if (outstanding <= 0) return "paid";
  return receipt.dueDate && receipt.dueDate < today() ? "overdue" : "open";
}

const payableLabels: Record<PayableStatus, { label: string; tone: string }> = {
  cancelled: { label: "Dibatalkan", tone: "nonaktif" },
  verify: { label: "Perlu verifikasi", tone: "tercatat" },
  paid: { label: "Lunas", tone: "lunas" },
  overdue: { label: "Jatuh tempo", tone: "danger" },
  open: { label: "Belum lunas", tone: "diproses" },
};

export function PayablesPage({ state, commands, onNotify, initialFormOpen = false }: PageProps) {
  const [tab, setTab] = useState<"bills" | "payments">("bills");
  const [dialog, setDialog] = useState<{ kind: "receive" } | { kind: "pay"; receipt: Receipt } | { kind: "cancel"; receipt: Receipt } | null>(initialFormOpen ? { kind: "receive" } : null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [pageNumber, setPageNumber] = useState(1);

  const supplierName = (id: string) => state.suppliers.find((item) => item.id === id)?.name ?? "Supplier dihapus";
  const open = state.receipts.filter((item) => item.status === "POSTED");
  const verifiedDebt = open.reduce((sum, item) => sum + (receiptOutstanding(item) ?? 0), 0);

  const receipts = useMemo(
    () =>
      [...state.receipts]
        .reverse()
        .filter((item) => (filter === "ALL" || payableStatus(item) === filter) && matches(search, item.receiptNumber, supplierName(item.supplierId), item.supplierReference, item.items.map((line) => productName(state, line.productId)).join(" "))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, search, filter],
  );
  const payments = useMemo(() => [...state.supplierPayments].reverse().filter((item) => matches(search, state.receipts.find((receipt) => receipt.id === item.receiptId)?.receiptNumber, item.reference, item.method)), [state, search]);
  const billPage = paginate(receipts, pageNumber);
  const paymentPage = paginate(payments, pageNumber);

  return (
    <div className="workspace-page" data-page-key="Payables">
      <PageHead eyebrow="Resto & Online / Utang" title="Utang supplier" description="Pantau tagihan dari penerimaan stok Resto & Online.">
        <button className="primary-button" type="button" onClick={() => setDialog({ kind: "receive" })}><Plus size={16} /> Catat penerimaan stok</button>
      </PageHead>
      <Stats
        items={[
          { label: "Utang terverifikasi", value: money(verifiedDebt), detail: "hanya penerimaan dengan data pembayaran" },
          { label: "Belum lunas", value: open.filter((item) => (receiptOutstanding(item) ?? 0) > 0).length.toString(), detail: "penerimaan stok Resto" },
          { label: "Jatuh tempo", value: open.filter((item) => payableStatus(item) === "overdue").length.toString(), detail: "lewat tanggal jatuh tempo", tone: open.some((item) => payableStatus(item) === "overdue") ? "danger" : undefined },
          { label: "Perlu verifikasi", value: open.filter((item) => receiptOutstanding(item) === null).length.toString(), detail: "pembayaran data lama belum diketahui", tone: open.some((item) => receiptOutstanding(item) === null) ? "warn" : undefined },
        ]}
      />
      <section className="panel resource-panel">
        <Tabs value={tab} onChange={(value) => { setTab(value); setSearch(""); setPageNumber(1); }} items={[{ value: "bills", label: "Tagihan supplier" }, { value: "payments", label: "Riwayat pembayaran" }]} />
        <div className="resource-toolbar resto-toolbar">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} placeholder="Cari penerimaan atau supplier…" />
          {tab === "bills" && (
            <div className="toolbar-filters">
              <SelectFilter label="Status tagihan" value={filter} onChange={(value) => { setFilter(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua status" }, ...(Object.keys(payableLabels) as PayableStatus[]).map((value) => ({ value, label: payableLabels[value].label }))]} />
            </div>
          )}
        </div>

        {tab === "bills" ? (
          <>
            <Table columns={["Penerimaan", "Supplier", "Produk", "Total", "Dibayar", "Sisa", "Jatuh tempo", "Status", ""]} count={receipts.length} empty={state.receipts.length ? "Tidak ada tagihan yang cocok." : "Belum ada penerimaan stok. Klik Catat penerimaan stok untuk memulai."}>
              {billPage.rows.map((item) => {
                const outstanding = receiptOutstanding(item);
                const current = payableStatus(item);
                const names = item.items.map((line) => productName(state, line.productId));
                return (
                  <tr key={item.id}>
                    <Cell label="Penerimaan" className="resource-primary-cell">
                      <strong>{item.receiptNumber}</strong>
                      <small className="cell-sub">{item.date}{item.supplierReference ? ` · ${item.supplierReference}` : ""}</small>
                    </Cell>
                    <Cell label="Supplier">{supplierName(item.supplierId)}</Cell>
                    <Cell label="Produk" className="cell-wrap">{names.slice(0, 2).join(", ")}{names.length > 2 ? ` +${names.length - 2}` : ""}</Cell>
                    <Cell label="Total">{money(item.subtotal)}</Cell>
                    <Cell label="Dibayar">{item.paidAmount === undefined ? "Belum diketahui" : money(item.paidAmount)}</Cell>
                    <Cell label="Sisa">{outstanding === null ? "Belum diketahui" : <span className={outstanding > 0 ? "stat-warn" : undefined}>{money(outstanding)}</span>}</Cell>
                    <Cell label="Jatuh tempo">{item.dueDate || "—"}</Cell>
                    <Cell label="Status"><StatusChip tone={payableLabels[current].tone}>{payableLabels[current].label}</StatusChip></Cell>
                    <Cell label="Aksi" className="row-actions">
                      {item.status === "POSTED" && (current === "verify" || current === "open" || current === "overdue") && (
                        <IconAction label={current === "verify" ? "Verifikasi pembayaran" : "Bayar supplier"} onClick={() => setDialog({ kind: "pay", receipt: item })}><Wallet size={15} /></IconAction>
                      )}
                      {item.status === "POSTED" && <IconAction label="Batalkan penerimaan" danger onClick={() => setDialog({ kind: "cancel", receipt: item })}><XCircle size={15} /></IconAction>}
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={billPage.current} total={receipts.length} pageSize={25} onPage={setPageNumber} />
          </>
        ) : (
          <>
            <Table columns={["Tanggal", "Penerimaan", "Supplier", "Metode", "Jumlah", "Referensi"]} count={payments.length} empty="Belum ada pembayaran supplier yang dicatat.">
              {paymentPage.rows.map((item) => {
                const receipt = state.receipts.find((entry) => entry.id === item.receiptId);
                return (
                  <tr key={item.id}>
                    <Cell label="Tanggal">{item.date}</Cell>
                    <Cell label="Penerimaan" className="resource-primary-cell"><strong>{receipt?.receiptNumber ?? "—"}</strong></Cell>
                    <Cell label="Supplier">{receipt ? supplierName(receipt.supplierId) : "—"}</Cell>
                    <Cell label="Metode">{item.method}</Cell>
                    <Cell label="Jumlah"><strong>{money(item.amount)}</strong></Cell>
                    <Cell label="Referensi">{item.reference || "—"}</Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={paymentPage.current} total={payments.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}
      </section>
      {dialog?.kind === "receive" && <ReceiveStockDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} state={state} />}
      {dialog?.kind === "pay" && <SupplierPaymentDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} receipt={dialog.receipt} supplierName={supplierName(dialog.receipt.supplierId)} />}
      {dialog?.kind === "cancel" && <CancelReceiptDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} receipt={dialog.receipt} />}
    </div>
  );
}

// ───────────────────────── Pengeluaran Resto ─────────────────────────

export function ExpensesPage({ state, commands, onNotify, initialFormOpen = false }: PageProps) {
  const [dialog, setDialog] = useState<{ expense?: OperatingExpense } | null>(initialFormOpen ? {} : null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [pageNumber, setPageNumber] = useState(1);

  const month = today().slice(0, 7);
  const categories = Array.from(new Set([...EXPENSE_CATEGORIES, ...state.operatingExpenses.map((item) => item.category)]));
  const expenses = [...state.operatingExpenses].sort((a, b) => b.date.localeCompare(a.date)).filter((item) => (category === "ALL" || item.category === category) && matches(search, item.category, item.description));
  const page = paginate(expenses, pageNumber);
  const total = state.operatingExpenses.reduce((sum, item) => sum + item.amount, 0);
  const byCategory = new Map<string, number>();
  for (const item of state.operatingExpenses) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount);
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="workspace-page" data-page-key="Operating Expenses">
      <PageHead eyebrow="Resto & Online / Pengeluaran" title="Pengeluaran Resto & Online" description="Catat biaya operasional Resto & Online tanpa mencampur data Lapak.">
        <button className="primary-button" type="button" onClick={() => setDialog({})}><Plus size={16} /> Tambah pengeluaran</button>
      </PageHead>
      <Stats
        items={[
          { label: "Bulan ini", value: money(state.operatingExpenses.filter((item) => item.date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0)), detail: "pengeluaran bulan berjalan" },
          { label: "Total pengeluaran", value: money(total), detail: `${state.operatingExpenses.length} catatan` },
          { label: "Kategori terbesar", value: top ? top[0] : "—", detail: top ? money(top[1]) : "belum ada data" },
        ]}
      />
      <section className="panel resource-panel">
        <div className="resource-toolbar resto-toolbar">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} placeholder="Cari pengeluaran…" />
          <div className="toolbar-filters">
            <SelectFilter label="Kategori" value={category} onChange={(value) => { setCategory(value); setPageNumber(1); }} options={[{ value: "ALL", label: "Semua kategori" }, ...categories.map((value) => ({ value, label: value }))]} />
            <button className="secondary-outline-button compact" type="button" onClick={() => { downloadCsv("pengeluaran-resto", ["Tanggal", "Kategori", "Deskripsi", "Jumlah"], expenses.map((item) => [item.date, item.category, item.description, item.amount])); onNotify(`${expenses.length} data berhasil diexport`); }}>
              <Download size={14} /> Export
            </button>
          </div>
        </div>
        <Table columns={["Tanggal", "Kategori", "Deskripsi", "Jumlah", ""]} count={expenses.length} empty={state.operatingExpenses.length ? "Tidak ada pengeluaran yang cocok." : "Belum ada pengeluaran. Klik Tambah pengeluaran untuk mencatat."}>
          {page.rows.map((item) => (
            <tr key={item.id}>
              <Cell label="Tanggal">{item.date}</Cell>
              <Cell label="Kategori" className="resource-primary-cell"><strong>{item.category}</strong></Cell>
              <Cell label="Deskripsi" className="cell-wrap">{item.description}</Cell>
              <Cell label="Jumlah"><strong>{money(item.amount)}</strong></Cell>
              <Cell label="Aksi" className="row-actions">
                <IconAction label="Edit pengeluaran" onClick={() => setDialog({ expense: item })}><Pencil size={15} /></IconAction>
                <IconAction label="Hapus pengeluaran" danger onClick={() => confirmDelete("pengeluaran ini") && report(onNotify, commands.deleteOperatingExpense(item.id))}><Trash2 size={15} /></IconAction>
              </Cell>
            </tr>
          ))}
        </Table>
        <Pager page={page.current} total={expenses.length} pageSize={25} onPage={setPageNumber} />
      </section>
      {dialog && <ExpenseDialog commands={commands} onNotify={onNotify} onClose={() => setDialog(null)} expense={dialog.expense} expenses={state.operatingExpenses} />}
    </div>
  );
}

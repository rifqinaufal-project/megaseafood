"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  Edit2,
  Lock,
  Pencil,
  Plus,
  PackageOpen,
  MessageCircle,
  ReceiptText,
  Save,
  Scale,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import { DIRECT_COST_CATEGORIES, directCostLabel } from "@/src/domain/settings";
import { downloadInvoicePdf } from "@/src/presentation/dashboard/invoice-pdf";
import { invoiceWhatsappLink } from "@/src/presentation/dashboard/invoice-share";
import {
  formatRupiah,
  today,
  type BusinessState,
  type DirectCostCategory,
  type Invoice,
  type Payment,
  type SalesChannel,
} from "@/src/domain/business-state";
import {
  calculateInvoice,
  defaultDueDate,
  effectiveInvoiceStatus,
  invoiceCostTotal,
  invoiceDirectCostTotal,
  invoiceScaleMargin,
  invoiceStatusLabel,
  sumStockQuantities,
  type EffectiveInvoiceStatus,
  type InvoiceInput,
} from "@/src/domain/invoice";
import { productDisplayName } from "@/src/domain/inventory";
import {
  Cell,
  IconAction,
  Pager,
  SearchBox,
  Stats,
  Table,
  Tabs,
  downloadCsv,
  paginate,
  Combobox,
} from "@/src/presentation/dashboard/resto-ui";
import { confirmDiscardChanges } from "@/src/presentation/dashboard/unsaved-changes";

type Notify = (message: string, tone?: "success" | "error" | "info") => void;
type Props = {
  business: BusinessState;
  commands: BusinessCommands;
  onNotify: Notify;
  page: "Invoices" | "Payments";
  initialFormOpen?: boolean;
  initialInvoiceId?: string;
};
const money = (value: number) => `Rp ${formatRupiah(value)}`;
const quantity = (value: number) =>
  value.toLocaleString("id-ID", { maximumFractionDigits: 6 });
const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
function sendInvoiceWhatsapp(
  invoice: Invoice,
  business: BusinessState,
  onNotify: Props["onNotify"],
) {
  const link = invoiceWhatsappLink(invoice, business);
  if (!link.ok) return onNotify(link.message, "error");
  window.open(link.url, "_blank", "noopener,noreferrer");
}
async function saveInvoicePdf(
  invoice: Invoice,
  business: BusinessState,
  onNotify: Props["onNotify"],
) {
  try {
    await downloadInvoicePdf(invoice, business);
    onNotify(`Invoice ${invoice.invoiceNumber} berhasil diunduh`, "success");
  } catch {
    onNotify("Gagal membuat PDF invoice", "error");
  }
}
const safeMoney = (value: number) =>
  Number.isFinite(value) ? money(value) : "—";

function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  children,
  error,
  hint,
  required = false,
  disabled = false,
  currency = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  children?: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  currency?: boolean;
}) {
  const id = useId();
  const shared = {
    id,
    value: currency ? formatRupiah(value) : value,
    disabled,
    required,
    "aria-invalid": !!error,
    "aria-describedby": error || hint ? `${id}-help` : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) =>
      onChange(
        currency ? event.target.value.replace(/\D/g, "") : event.target.value,
      ),
  };
  return (
    <div className="form-field invoice-field">
      <label htmlFor={id}>
        {label}
        {currency ? " (Rp)" : ""}
        {required ? " *" : ""}
      </label>
      {children ? (
        <select {...shared}>{children}</select>
      ) : (
        <input
          {...shared}
          type={currency ? "text" : type}
          inputMode={
            currency ? "numeric" : type === "number" ? "decimal" : undefined
          }
          step={type === "number" ? "any" : undefined}
          min={type === "number" ? "0" : undefined}
        />
      )}
      {(error || hint) && (
        <small
          id={`${id}-help`}
          className={error ? "invoice-field-error" : "invoice-hint"}
        >
          {error || hint}
        </small>
      )}
    </div>
  );
}

type EffectiveStatus = EffectiveInvoiceStatus;
const effectiveStatus = (invoice: Invoice): EffectiveStatus =>
  effectiveInvoiceStatus(invoice, today());
const statusTone: Record<EffectiveStatus, string> = {
  PAID: "lunas",
  ISSUED: "berjalan",
  PARTIALLY_PAID: "tercatat",
  OVERDUE: "danger",
};
const statusText = (status: EffectiveStatus) =>
  status === "OVERDUE" ? "Jatuh tempo" : invoiceStatusLabel(status);
const marginValue = invoiceScaleMargin;

function Status({ invoice }: { invoice: Invoice }) {
  const status = effectiveStatus(invoice);
  return (
    <span className={`status status-${statusTone[status]}`}>
      {statusText(status)}
    </span>
  );
}

function SectionHead({
  icon,
  title,
  description,
  badge,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ie-section-head">
      <i className="side-icon">{icon}</i>
      <div>
        <h2>
          {title}
          {badge && <span className="ie-badge">{badge}</span>}
        </h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
  marginQuantity: string;
  sellingPrice: string;
};
type DraftCost = {
  key: string;
  category: DirectCostCategory;
  name: string;
  amount: string;
};
const blankCost = (key: string): DraftCost => ({
  key,
  category: "PACKAGING",
  name: "",
  amount: "",
});
const blankLine = (key: string): DraftLine => ({
  key,
  productId: "",
  quantity: "1",
  marginQuantity: "0",
  sellingPrice: "",
});

export function InvoiceEditor({
  business,
  commands,
  onNotify,
  initialInvoice,
  onCancel,
  onSaved,
}: Omit<Props, "page"> & {
  initialInvoice?: Invoice;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const [original] = useState(initialInvoice);
  const [draft, setDraft] = useState(() => ({
    channel: original?.salesChannel ?? ("RESTAURANT" as SalesChannel),
    restaurantId: original?.restaurantId ?? "",
    customerName: original?.customerName ?? "",
    date: original?.date ?? today(),
    dueDate: original?.dueDate ?? today(),
    discount: String(original?.discount ?? 0),
    lines: original
      ? original.items.map((line, index) => ({
          key: `existing-${index}`,
          productId: line.productId,
          quantity: String(line.stockQuantity),
          marginQuantity: String(line.marginQuantity),
          sellingPrice: String(line.sellingPrice),
        }))
      : [blankLine("first")],
    costs: (original?.directCosts ?? []).map((cost, index) => ({
      key: `cost-${index}`,
      category: cost.category,
      name: cost.name,
      amount: String(cost.amount),
    })),
  }));
  const [initialDraft] = useState(() => JSON.stringify(draft));
  const [nextKey, setNextKey] = useState(0);
  const [scaleOpen, setScaleOpen] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const dirty = JSON.stringify(draft) !== initialDraft;
  useUnsavedChanges(dirty);
  const legacy = !!original && original.items.length === 0;
  const current =
    original && business.invoices.find((invoice) => invoice.id === original.id);
  const stale =
    !!original &&
    (!current || (current.revision ?? 0) !== (original.revision ?? 0));
  const input: InvoiceInput = {
    channel: draft.channel,
    restaurantId: draft.restaurantId,
    customerName: draft.customerName,
    date: draft.date,
    dueDate: draft.dueDate,
    discount: number(draft.discount),
    expectedRevision: original?.revision ?? 0,
    items: draft.lines.map((line) => ({
      productId: line.productId,
      quantity: number(line.quantity),
      marginQuantity: number(line.marginQuantity),
      sellingPrice: number(line.sellingPrice),
    })),
    directCosts: draft.costs.map((cost) => ({
      id: cost.key,
      category: cost.category,
      name: cost.name,
      amount: number(cost.amount),
    })),
  };
  const calculated = calculateInvoice(business, input, original);
  const oldQuantities = sumStockQuantities(original?.items ?? []);
  const error = (key: string) =>
    submitted ? calculated.errors[key] : undefined;
  const cancel = () => {
    if (
      !dirty ||
      window.confirm("Perubahan invoice belum disimpan. Tinggalkan form?")
    )
      onCancel();
  };
  const set = (key: "customerName" | "dueDate" | "discount", value: string) => {
    setSaveError("");
    setDraft((previous) => ({ ...previous, [key]: value }));
  };
  // A restaurant-specific price wins over the product's standard price.
  const priceFor = (restaurantId: string, productId: string) =>
    business.customerPrices.find(
      (item) => item.restaurantId === restaurantId && item.productId === productId,
    )?.sellingPrice ??
    business.products.find((product) => product.id === productId)
      ?.defaultSellingPrice;
  const setLine = (index: number, key: keyof DraftLine, value: string) => {
    setSaveError("");
    setDraft((previous) => ({
      ...previous,
      lines: previous.lines.map((line, row) =>
        row !== index
          ? line
          : {
              ...line,
              [key]: value,
              ...(key === "productId"
                ? {
                    sellingPrice: String(
                      priceFor(previous.restaurantId, value) ?? "",
                    ),
                  }
                : {}),
            },
      ),
    }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!calculated.ok || stale) return;
    const result = original
      ? commands.updateInvoice(original.id, input)
      : commands.createInvoice(input);
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok && result.id) onSaved(result.id);
    else setSaveError(result.message);
  };
  const selectedRestaurant = business.restaurants.find(
    (item) => item.id === draft.restaurantId,
  );
  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  const hppTotal = calculated.items.reduce(
    (sum, item) => sum + finite(item.hppTotal),
    0,
  );
  const marginQty = calculated.items.reduce(
    (sum, item) => sum + Math.max(finite(item.marginQuantity), 0),
    0,
  );
  const marginRevenue = calculated.items.reduce(
    (sum, item) =>
      sum +
      Math.max(finite(item.marginQuantity), 0) * finite(item.sellingPrice),
    0,
  );
  const directTotal = calculated.directCosts.reduce(
    (sum, cost) => sum + finite(cost.amount),
    0,
  );
  const revenue = finite(calculated.total);
  const profit = revenue - hppTotal - directTotal;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
  const productProfit = revenue - hppTotal;
  const discountValue = finite(number(draft.discount));
  const marginUnits = Array.from(
    new Set(
      draft.lines
        .filter((line) => number(line.marginQuantity) > 0)
        .map(
          (line) =>
            business.products.find((item) => item.id === line.productId)?.unit,
        )
        .filter(Boolean),
    ),
  );
  const unitLabel = marginUnits.length === 1 ? marginUnits[0] : "";
  const setCost = (index: number, key: keyof DraftCost, value: string) => {
    setSaveError("");
    setDraft((previous) => ({
      ...previous,
      costs: previous.costs.map((cost, row) =>
        row === index
          ? {
              ...cost,
              [key]: key === "amount" ? value.replace(/\D/g, "") : value,
            }
          : cost,
      ),
    }));
  };
  const addCost = () => {
    setSaveError("");
    setDraft((previous) => ({
      ...previous,
      costs: [...previous.costs, blankCost(`cost-new-${nextKey}`)],
    }));
    setNextKey((key) => key + 1);
  };
  const removeCost = (index: number) =>
    setDraft((previous) => ({
      ...previous,
      costs: previous.costs.filter((_, row) => row !== index),
    }));
  const removeLine = (index: number) =>
    setDraft((previous) => ({
      ...previous,
      lines: previous.lines.filter((_, row) => row !== index),
    }));
  const addLine = () => {
    setDraft((previous) => ({
      ...previous,
      lines: [...previous.lines, blankLine(`new-${nextKey}`)],
    }));
    setNextKey((key) => key + 1);
  };
  const errorMessages = Array.from(new Set(Object.values(calculated.errors)));
  return (
    <div className="workspace-page invoice-workspace">
      <button className="back-link" type="button" onClick={cancel}>
        <ArrowLeft size={15} />{" "}
        {original ? "Kembali ke detail invoice" : "Semua invoice"}
      </button>
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Resto &amp; Online / Invoice</p>
          <h1>{original ? "Edit invoice" : "Invoice baru"}</h1>
          <p>
            {original?.invoiceNumber ??
              "Pilih restoran, tambahkan item produk, lalu periksa ringkasan internal sebelum menyimpan."}
          </p>
        </div>
      </div>
      <form
        noValidate
        onSubmit={submit}
        data-unsaved={dirty ? "true" : "false"}
        className="invoice-editor-layout"
      >
        <div className="invoice-editor-main">
          {(saveError || stale || (submitted && !calculated.ok)) && (
            <div className="invoice-errors ie-alert" role="alert">
              <AlertCircle size={16} />
              <div>
                {saveError ||
                  (stale ? (
                    "Invoice berubah sejak form dibuka. Batal lalu buka ulang untuk memakai data terbaru."
                  ) : (
                    <>
                      <strong>Periksa kembali input:</strong>
                      <ul>
                        {errorMessages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </>
                  ))}
              </div>
            </div>
          )}
          <section className="panel invoice-section">
            <SectionHead
              icon={<UserRound size={16} />}
              title="Informasi Pelanggan"
              description="Tentukan restoran dan periode pembayaran invoice."
            />
            <div className="form-grid">
              <Field
                label="Channel penjualan"
                value={draft.channel}
                required
                onChange={(value) =>
                  setDraft((previous) => ({
                    ...previous,
                    channel: value as SalesChannel,
                    restaurantId: "",
                    customerName: "",
                    dueDate: previous.date,
                  }))
                }
              >
                <option value="RESTAURANT">Restoran</option>
                <option value="ONLINE">Online</option>
              </Field>
              {draft.channel === "RESTAURANT" && (
                <Field
                  label="Restoran"
                  value={draft.restaurantId}
                  required
                  error={error("restaurantId")}
                  onChange={(value) => {
                    const restaurant = business.restaurants.find(
                      (item) => item.id === value,
                    );
                    setDraft((previous) => ({
                      ...previous,
                      restaurantId: value,
                      lines: previous.lines.map((line) => {
                        if (!line.productId) return line;
                        const before = priceFor(previous.restaurantId, line.productId);
                        // Only re-price lines still on the automatic price; keep manual edits.
                        return String(before ?? "") === line.sellingPrice
                          ? { ...line, sellingPrice: String(priceFor(value, line.productId) ?? "") }
                          : line;
                      }),
                      customerName: restaurant?.name ?? "",
                      dueDate: defaultDueDate(
                        previous.date,
                        restaurant?.paymentTermDays ?? 0,
                      ),
                    }));
                  }}
                >
                  <option value="">Pilih restoran</option>
                  {business.restaurants
                    .filter(
                      (item) =>
                        item.status === "ACTIVE" ||
                        item.id === original?.restaurantId,
                    )
                    .map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name} · {restaurant.paymentTermDays} hari
                      </option>
                    ))}
                </Field>
              )}
              {selectedRestaurant && (
                <div className="ie-customer-card">
                  <div>
                    <span>Kontak</span>
                    <b>{selectedRestaurant.contactName || "—"}</b>
                  </div>
                  <div>
                    <span>Alamat Tagihan</span>
                    <p>{selectedRestaurant.address || "—"}</p>
                  </div>
                  <div>
                    <span>Termin</span>
                    <b>{selectedRestaurant.paymentTermDays} hari</b>
                  </div>
                </div>
              )}
              <Field
                label="Nama pelanggan"
                value={draft.customerName}
                required
                onChange={(value) => set("customerName", value)}
                error={error("customerName")}
              />
              <Field
                label="Tanggal invoice"
                type="date"
                value={draft.date}
                required
                error={error("date")}
                onChange={(value) =>
                  setDraft((previous) => ({
                    ...previous,
                    date: value,
                    dueDate: defaultDueDate(
                      value,
                      previous.channel === "RESTAURANT"
                        ? (business.restaurants.find(
                            (item) => item.id === previous.restaurantId,
                          )?.paymentTermDays ?? 0)
                        : 0,
                    ),
                  }))
                }
              />
              <Field
                label="Jatuh tempo"
                type="date"
                value={draft.dueDate}
                required
                error={error("dueDate")}
                onChange={(value) => set("dueDate", value)}
                hint="Mengikuti termin restoran; boleh dikoreksi."
              />
            </div>
          </section>

          <section className="panel invoice-section ie-items">
            <SectionHead
              icon={<PackageOpen size={16} />}
              title="Item Produk"
              badge={draft.lines.length ? `${draft.lines.length} item` : undefined}
              description="HPP otomatis memakai rata-rata harga stok. Harga jual dapat disesuaikan khusus untuk invoice ini."
              action={
                !legacy && (
                  <button
                    type="button"
                    className="secondary-outline-button add-item-button"
                    onClick={addLine}
                  >
                    <Plus size={15} /> Tambah Item
                  </button>
                )
              }
            />
            {legacy ? (
              <p className="invoice-notice">
                Invoice lama ini belum memiliki rincian produk. Total dan stok
                tidak diubah saat mengedit informasi pelanggan atau tanggal.
              </p>
            ) : draft.lines.length === 0 ? (
              <div className="ie-empty">
                <i>
                  <PackageOpen size={20} />
                </i>
                <strong>Belum ada produk</strong>
                <p>
                  Tambahkan produk yang dipesan restoran untuk mulai menghitung
                  invoice.
                </p>
                <button
                  type="button"
                  className="secondary-outline-button"
                  onClick={addLine}
                >
                  <Plus size={15} /> Tambah produk pertama
                </button>
              </div>
            ) : (
              <div className="table-wrap ie-table-wrap">
                <table className="ie-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Size</th>
                      <th className="num">Qty Stok</th>
                      <th>Satuan</th>
                      <th className="num ie-hpp-head">HPP Rata-rata Stok</th>
                      <th className="num">Harga Jual</th>
                      <th className="num">Subtotal</th>
                      <th className="center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, index) => {
                      const product = business.products.find(
                        (item) => item.id === line.productId,
                      );
                      const item = calculated.items[index];
                      const productError = error(`items.${index}.productId`);
                      const quantityError =
                        submitted || !!line.productId
                          ? calculated.errors[`items.${index}.quantity`]
                          : undefined;
                      const marginError = error(`items.${index}.marginQuantity`);
                      const priceError = error(`items.${index}.sellingPrice`);
                      const marginAmount = Math.max(
                        number(line.marginQuantity) || 0,
                        0,
                      );
                      const open = !!scaleOpen[line.key] || marginAmount > 0;
                      return (
                        <Fragment key={line.key}>
                        <tr>
                          <td data-label="Produk">
                            <Combobox
                              ariaLabel={`Produk ${index + 1}`}
                              placeholder="Cari produk"
                              invalid={!!productError}
                              value={line.productId}
                              onChange={(value) => setLine(index, "productId", value)}
                              options={business.products
                                .filter(
                                  (entry) =>
                                    entry.status === "ACTIVE" ||
                                    oldQuantities[entry.id],
                                )
                                .map((entry) => ({
                                  value: entry.id,
                                  label: productDisplayName(entry),
                                  detail: `${quantity(entry.stockBalance)} ${entry.unit}`,
                                  search: `${entry.sku} ${entry.category}`,
                                }))}
                            />
                            {productError && (
                              <small className="invoice-field-error">
                                {productError}
                              </small>
                            )}
                            {product && (
                              <small className="invoice-hint">
                                Tersedia untuk invoice ini:{" "}
                                {quantity(
                                  product.stockBalance +
                                    (oldQuantities[product.id] ?? 0),
                                )}{" "}
                                {product.unit}
                              </small>
                            )}
                          </td>
                          <td data-label="Size">
                            {product?.size ? (
                              <span className="size-chip">{product.size}</span>
                            ) : (
                              <span className="ie-dash">—</span>
                            )}
                          </td>
                          <td data-label="Qty Stok" className="num">
                            <input
                              className="ie-qty"
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              aria-label={`Qty stok ${index + 1}`}
                              aria-invalid={!!quantityError}
                              value={line.quantity}
                              onChange={(event) =>
                                setLine(index, "quantity", event.target.value)
                              }
                            />
                            {quantityError && (
                              <small className="invoice-field-error">
                                {quantityError}
                              </small>
                            )}
                          </td>
                          <td data-label="Satuan">
                            <span className="ie-unit">{product?.unit ?? "—"}</span>
                          </td>
                          <td data-label="HPP Rata-rata Stok" className="num ie-hpp-cell">
                            <b>
                              {product && item
                                ? safeMoney(item.hpp)
                                : "—"}
                            </b>
                            <small>
                              {product && product.averageHpp > 0
                                ? `Rata-rata stok: ${money(product.averageHpp)}`
                                : "Belum ada harga stok"}
                            </small>
                          </td>
                          <td data-label="Harga Jual" className="num">
                            <input
                              className="ie-price"
                              type="text"
                              inputMode="numeric"
                              aria-label={`Harga jual invoice ${index + 1}`}
                              aria-invalid={!!priceError}
                              value={formatRupiah(line.sellingPrice)}
                              onChange={(event) =>
                                setLine(
                                  index,
                                  "sellingPrice",
                                  event.target.value.replace(/\D/g, ""),
                                )
                              }
                            />
                            {priceError && (
                              <small className="invoice-field-error">
                                {priceError}
                              </small>
                            )}
                          </td>
                          <td data-label="Subtotal" className="num ie-subtotal">
                            <b>{safeMoney(item?.subtotal ?? NaN)}</b>
                            {marginAmount > 0 && (
                              <small>
                                Tagih{" "}
                                {Number.isFinite(item?.billingQuantity)
                                  ? quantity(item.billingQuantity)
                                  : "—"}{" "}
                                {product?.unit}
                              </small>
                            )}
                          </td>
                          <td data-label="Aksi" className="center">
                            <div className="ie-row-actions">
                              <button
                                type="button"
                                className={
                                  marginAmount > 0
                                    ? "icon-button ie-scale is-active"
                                    : "icon-button ie-scale"
                                }
                                aria-label={`Atur timbangan margin item ${index + 1}`}
                                aria-expanded={open}
                                onClick={() =>
                                  setScaleOpen((previous) => ({
                                    ...previous,
                                    [line.key]: !previous[line.key],
                                  }))
                                }
                              >
                                <Scale size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-button danger-button"
                                aria-label={`Hapus item ${index + 1}`}
                                onClick={() => removeLine(index)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="ie-scale-row">
                            <td colSpan={8}>
                              <div className="ie-scale-editor">
                                <label>
                                  <span>Margin timbangan ({product?.unit ?? "qty"})</span>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    inputMode="decimal"
                                    placeholder="0"
                                    aria-label={`Margin timbangan item ${index + 1}`}
                                    aria-invalid={!!marginError}
                                    value={line.marginQuantity}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onChange={(event) =>
                                      setLine(index, "marginQuantity", event.target.value)
                                    }
                                  />
                                </label>
                                <p>
                                  Qty tagihan:{" "}
                                  {Number.isFinite(item?.billingQuantity)
                                    ? quantity(item.billingQuantity)
                                    : "—"}{" "}
                                  {product?.unit}
                                </p>
                                {marginError && (
                                  <small className="invoice-field-error">
                                    {marginError}
                                  </small>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {submitted && calculated.errors.items && (
              <p className="invoice-field-error">{calculated.errors.items}</p>
            )}
            {!legacy && draft.lines.length > 0 && (
              <div className="ie-discount">
                <div className="ie-discount-field">
                  <Field
                    label="Diskon"
                    currency
                    value={draft.discount}
                    error={error("discount")}
                    onChange={(value) => set("discount", value)}
                  />
                </div>
                <div className="ie-total">
                  <span>Total setelah diskon</span>
                  <strong>{safeMoney(calculated.total)}</strong>
                </div>
              </div>
            )}
            {legacy && (
              <div className="ie-discount">
                <div className="ie-total">
                  <span>Total tagihan</span>
                  <strong>{safeMoney(calculated.total)}</strong>
                </div>
              </div>
            )}
          </section>

          <section className="panel invoice-section ie-costs">
            <SectionHead
              icon={<WalletCards size={16} />}
              title="Biaya Internal"
              description="Tidak tampil pada invoice pelanggan."
              badge="Privat"
              action={
                <button
                  type="button"
                  className="secondary-outline-button add-item-button"
                  onClick={addCost}
                >
                  <Plus size={14} /> Tambah Biaya
                </button>
              }
            />
            {draft.costs.length === 0 ? (
              <p className="ie-costs-empty">
                Belum ada biaya tambahan. Catat packaging, es, pengiriman, atau
                biaya transaksi lain bila ada.
              </p>
            ) : (
              <div className="ie-cost-list">
                {draft.costs.map((cost, index) => (
                  <div className="ie-cost-item" key={cost.key}>
                    <label>
                      <span>Kategori</span>
                      <select
                        aria-label={`Kategori biaya ${index + 1}`}
                        value={cost.category}
                        onChange={(event) =>
                          setCost(index, "category", event.target.value)
                        }
                      >
                        {DIRECT_COST_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {directCostLabel(category)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Keterangan</span>
                      <input
                        aria-label={`Keterangan biaya ${index + 1}`}
                        aria-invalid={!!error(`directCosts.${index}.name`)}
                        placeholder="Contoh: Box styrofoam"
                        value={cost.name}
                        onChange={(event) =>
                          setCost(index, "name", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Nominal (Rp)</span>
                      <input
                        inputMode="numeric"
                        aria-label={`Nominal biaya ${index + 1}`}
                        aria-invalid={!!error(`directCosts.${index}.amount`)}
                        placeholder="0"
                        value={formatRupiah(cost.amount)}
                        onChange={(event) =>
                          setCost(index, "amount", event.target.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button danger-button"
                      aria-label={`Hapus biaya ${index + 1}`}
                      onClick={() => removeCost(index)}
                    >
                      <Trash2 size={15} />
                    </button>
                    {(error(`directCosts.${index}.name`) ||
                      error(`directCosts.${index}.amount`)) && (
                      <small className="invoice-field-error">
                        {error(`directCosts.${index}.name`) ??
                          error(`directCosts.${index}.amount`)}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="invoice-form-actions ie-actions">
            <button
              className="secondary-outline-button"
              type="button"
              onClick={cancel}
            >
              Batal
            </button>
            <button className="primary-button" type="submit" disabled={stale}>
              <Save size={15} />{" "}
              {original ? "Simpan perubahan" : "Simpan invoice"}
            </button>
          </div>
        </div>

        <aside className="ie-aside">
          <section className="panel invoice-summary">
            <div className="side-heading">
              <i className="side-icon">
                <ReceiptText size={16} />
              </i>
              <div>
                <h2>Ringkasan Internal</h2>
                <small>Analisis transaksi</small>
              </div>
              <em className="internal-tag">Privat</em>
            </div>
            <div className="side-rows side-card">
              <div>
                <span>Subtotal Produk</span>
                <b>{safeMoney(calculated.subtotal)}</b>
              </div>
              {discountValue > 0 && (
                <div>
                  <span>Diskon</span>
                  <b className="text-danger">-{money(discountValue)}</b>
                </div>
              )}
              <div className="ie-revenue">
                <span>Pendapatan</span>
                <b>{safeMoney(calculated.total)}</b>
              </div>
            </div>
            <div className="side-margin ie-margin">
              <div>
                <span>
                  <Scale size={13} /> Margin timbangan
                </span>
                <b>
                  +{quantity(marginQty)} {unitLabel}
                </b>
              </div>
              <div>
                <span>Tambahan nilai tagihan</span>
                <b>{money(marginRevenue)}</b>
              </div>
            </div>
            <div className="side-rows ie-cost-row">
              <div className="muted-row">
                <span>HPP Produk</span>
                <b>{money(hppTotal)}</b>
              </div>
              <div className="muted-row">
                <span>Biaya Internal</span>
                <b>{money(directTotal)}</b>
              </div>
            </div>
            <div className="side-profit">
              <div>
                <span>Laba Transaksi</span>
                <b>{money(profit)}</b>
              </div>
              <div>
                <span>Margin</span>
                <strong>{marginPercent.toFixed(1).replace(".", ",")}%</strong>
              </div>
              <div className="side-progress-track">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(0, marginPercent))}%`,
                  }}
                />
              </div>
              <div className="ie-profit-foot">
                <span>Laba produk</span>
                <b>{money(productProfit)}</b>
              </div>
            </div>
          </section>

          <section className="panel invoice-summary ie-billing">
            <h2>Tagihan</h2>
            <dl>
              <div className="invoice-grand-total">
                <dt>Total tagihan</dt>
                <dd>{safeMoney(calculated.total)}</dd>
              </div>
              {original && (
                <div>
                  <dt>Sudah dibayar</dt>
                  <dd>{money(original.paidAmount)}</dd>
                </div>
              )}
              <div>
                <dt>Sisa tagihan</dt>
                <dd>{safeMoney(calculated.outstandingAmount)}</dd>
              </div>
              <div>
                <dt>Jatuh tempo</dt>
                <dd>{draft.dueDate || "—"}</dd>
              </div>
            </dl>
            <p className="invoice-hint">
              {original
                ? "Simpan hanya menyesuaikan selisih stok. Pembayaran yang sudah masuk tetap dipertahankan."
                : "Stok baru berkurang setelah invoice berhasil disimpan. Pembayaran dicatat dari halaman detail."}
            </p>
            {!legacy && (
              <div className="invoice-stock-preview">
                <strong>Dampak stok</strong>
                {Array.from(
                  new Set([
                    ...Object.keys(oldQuantities),
                    ...draft.lines.map((line) => line.productId),
                  ]),
                )
                  .filter(Boolean)
                  .map((id) => {
                    const product = business.products.find(
                      (item) => item.id === id,
                    );
                    const next = calculated.products.find(
                      (item) => item.id === id,
                    );
                    return (
                      product && (
                        <p key={id}>
                          {product.name}
                          <span>
                            {quantity(product.stockBalance)} →{" "}
                            {next && Number.isFinite(next.stockBalance)
                              ? quantity(next.stockBalance)
                              : "—"}{" "}
                            {product.unit}
                          </span>
                        </p>
                      )
                    );
                  })}
              </div>
            )}
          </section>
        </aside>
      </form>
    </div>
  );
}

function PaymentForm({
  business,
  commands,
  onNotify,
  invoiceId,
  payment,
  onCancel,
  onSaved,
}: Pick<Props, "business" | "commands" | "onNotify"> & {
  invoiceId?: string;
  payment?: Payment;
  onCancel: () => void;
  onSaved: (invoiceId: string) => void;
}) {
  const [original] = useState(payment);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const [form, setForm] = useState(() => ({
    invoiceId: original?.invoiceId ?? invoiceId ?? "",
    date: original?.date ?? today(),
    amount: original ? String(original.amount) : "",
    method: original?.method ?? "Transfer",
    reference: original?.reference ?? "",
  }));
  const [initial] = useState(() => JSON.stringify(form));
  const [error, setError] = useState("");
  const dirty = initial !== JSON.stringify(form);
  useUnsavedChanges(dirty);
  const invoice = business.invoices.find((item) => item.id === form.invoiceId);
  const available = (invoice?.outstandingAmount ?? 0) + (original?.amount ?? 0);
  const cancel = () => {
    if (
      !dirty ||
      window.confirm("Input pembayaran belum disimpan. Tinggalkan form?")
    )
      onCancel();
  };
  const set = (key: keyof typeof form, value: string) => {
    setError("");
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      ...form,
      amount: number(form.amount),
      expectedRevision: original?.revision ?? 0,
    };
    const result = original
      ? commands.updatePayment(original.id, input)
      : commands.addPayment(input);
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok) onSaved(form.invoiceId);
    else setError(result.message);
  };
  return (
    <section className="panel invoice-section invoice-payment-form">
      <h2 ref={headingRef} tabIndex={-1}>
        {original ? "Edit pembayaran" : "Catat pembayaran"}
      </h2>
      <p className="invoice-hint">
        {invoice
          ? `${invoice.invoiceNumber} · ${invoice.customerName} · maksimum ${money(available)}`
          : "Pilih invoice yang akan dibayar."}
      </p>
      <form
        noValidate
        onSubmit={submit}
        data-unsaved={dirty ? "true" : "false"}
      >
        <div className="form-grid">
          {!invoiceId && !original && (
            <Field
              label="Invoice"
              value={form.invoiceId}
              required
              onChange={(value) => set("invoiceId", value)}
            >
              <option value="">Pilih invoice</option>
              {business.invoices
                .filter((item) => item.outstandingAmount > 0)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.invoiceNumber} · {item.customerName} ·{" "}
                    {money(item.outstandingAmount)}
                  </option>
                ))}
            </Field>
          )}
          <Field
            label="Tanggal pembayaran"
            type="date"
            value={form.date}
            required
            onChange={(value) => set("date", value)}
          />
          <Field
            label="Jumlah pembayaran"
            currency
            value={form.amount}
            required
            onChange={(value) => set("amount", value)}
            hint={invoice ? `Maksimum ${money(available)}` : undefined}
          />
          <Field
            label="Metode pembayaran"
            value={form.method}
            required
            onChange={(value) => set("method", value)}
          >
            <option value="Transfer">Transfer</option>
            <option value="Tunai">Tunai</option>
          </Field>
          <Field
            label="Referensi / catatan"
            value={form.reference}
            onChange={(value) => set("reference", value)}
          />
        </div>
        {error && (
          <p className="invoice-errors" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-outline-button"
            onClick={cancel}
          >
            Batal
          </button>
          <button className="primary-button" type="submit">
            Simpan pembayaran
          </button>
        </div>
      </form>
    </section>
  );
}

function DeleteInvoice({
  invoice,
  business,
  commands,
  onNotify,
  onCancel,
  onDeleted,
}: Pick<Props, "business" | "commands" | "onNotify"> & {
  invoice: Invoice;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [revision] = useState(invoice.revision ?? 0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const [paymentsApproved, setPaymentsApproved] = useState(false);
  const [legacyApproved, setLegacyApproved] = useState(false);
  const [error, setError] = useState("");
  const payments = business.payments.filter(
    (payment) => payment.invoiceId === invoice.id,
  );
  const hasPayments = invoice.paidAmount > 0 || payments.length > 0;
  const remove = () => {
    const result = commands.deleteInvoice(invoice.id, {
      expectedRevision: revision,
      deletePayments: paymentsApproved,
      acknowledgeMissingItems: legacyApproved,
    });
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok) onDeleted();
    else setError(result.message);
  };
  return (
    <section
      className="panel invoice-delete-panel"
      aria-labelledby="delete-invoice-title"
    >
      <h2 ref={headingRef} tabIndex={-1} id="delete-invoice-title">
        Hapus {invoice.invoiceNumber}?
      </h2>
      <p>
        Invoice senilai {money(invoice.total)} dan piutang{" "}
        {money(invoice.outstandingAmount)} akan dihapus permanen. Tindakan ini
        bukan pengembalian dana ke pelanggan.
      </p>
      {invoice.items.length > 0 && (
        <ul>
          {Object.entries(sumStockQuantities(invoice.items)).map(
            ([id, qty]) => (
              <li key={id}>
                Kembalikan {quantity(qty)}{" "}
                {business.products.find((item) => item.id === id)?.unit}{" "}
                {invoice.items.find((item) => item.productId === id)
                  ?.productName ??
                  business.products.find((item) => item.id === id)?.name}{" "}
                ke stok.
              </li>
            ),
          )}
        </ul>
      )}
      {hasPayments && (
        <label className="invoice-checkbox">
          <input
            type="checkbox"
            checked={paymentsApproved}
            onChange={(event) => setPaymentsApproved(event.target.checked)}
          />
          <span>
            Saya menyetujui penghapusan {payments.length} catatan pembayaran
            terkait dan saldo pembayaran {money(invoice.paidAmount)}.
          </span>
        </label>
      )}
      {!invoice.items.length && (
        <label className="invoice-checkbox">
          <input
            type="checkbox"
            checked={legacyApproved}
            onChange={(event) => setLegacyApproved(event.target.checked)}
          />
          <span>
            Rincian produk invoice lama tidak tersedia. Saya memahami stok tidak
            dapat dikembalikan otomatis dan perlu diperiksa secara terpisah.
          </span>
        </label>
      )}
      {error && (
        <p className="invoice-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-outline-button"
          onClick={onCancel}
        >
          Batal
        </button>
        <button
          type="button"
          className="secondary-outline-button invoice-destructive"
          disabled={
            (hasPayments && !paymentsApproved) ||
            (!invoice.items.length && !legacyApproved)
          }
          onClick={remove}
        >
          Hapus permanen
        </button>
      </div>
    </section>
  );
}

export function InvoiceDetail({
  invoice,
  business,
  onNotify,
  onEdit,
  onBack,
  onPayment,
  onDelete,
  onEditPayment,
  onDeletePayment,
}: {
  invoice: Invoice;
  business: BusinessState;
  onNotify: Props["onNotify"];
  onEdit: () => void;
  onBack: () => void;
  onPayment: () => void;
  onDelete: () => void;
  onEditPayment: (payment: Payment) => void;
  onDeletePayment: (payment: Payment) => void;
}) {
  const payments = business.payments
    .filter((payment) => payment.invoiceId === invoice.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const openingPaid =
    invoice.paidAmount -
    payments.reduce((sum, payment) => sum + payment.amount, 0);
  const scaleMargin = invoiceScaleMargin(invoice);
  const costTotal = invoiceCostTotal(invoice);
  const directTotal = invoiceDirectCostTotal(invoice);
  const profit = invoice.total - costTotal - directTotal;
  const margin = invoice.total > 0 ? (profit / invoice.total) * 100 : 0;
  const paidShare =
    invoice.total > 0
      ? Math.min(100, Math.max(0, (invoice.paidAmount / invoice.total) * 100))
      : 0;
  const isPaid = invoice.outstandingAmount <= 0 && invoice.total > 0;
  const overdue = effectiveInvoiceStatus(invoice, today()) === "OVERDUE";
  return (
    <>
      <div className="invoice-screen-only">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={15} /> Kembali ke daftar
        </button>
        <div className="workspace-page-head">
          <div>
            <p className="eyebrow">Resto &amp; Online / Detail invoice</p>
            <h1 className="invoice-detail-title">
              {invoice.invoiceNumber}
              <Status invoice={invoice} />
            </h1>
            <p>
              {invoice.customerName} · {invoice.date}
            </p>
          </div>
          <div className="workspace-actions invoice-detail-actions">
            <button
              className="secondary-outline-button"
              type="button"
              onClick={() => saveInvoicePdf(invoice, business, onNotify)}
            >
              <Download size={15} /> Unduh PDF
            </button>
            <button
              className="secondary-outline-button invoice-whatsapp"
              type="button"
              onClick={() => sendInvoiceWhatsapp(invoice, business, onNotify)}
            >
              <MessageCircle size={15} /> Kirim WhatsApp
            </button>
            <button
              className="secondary-outline-button"
              type="button"
              onClick={onEdit}
            >
              <Edit2 size={15} /> Edit
            </button>
            <button
              className="secondary-outline-button invoice-destructive"
              type="button"
              onClick={onDelete}
            >
              <Trash2 size={15} /> Hapus
            </button>
            {invoice.outstandingAmount > 0 && (
              <button
                className="primary-button"
                type="button"
                onClick={onPayment}
              >
                <Plus size={15} /> Catat pembayaran
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="invoice-detail-grid">
      <div className="invoice-detail-main">
      <section className="panel invoice-print-sheet">
        <div className="invoice-document-head">
          <div>
            <strong className="invoice-brand">megaseafood</strong>
            <p>
              Invoice penjualan ·{" "}
              {invoice.salesChannel === "RESTAURANT" ? "Restoran" : "Online"}
            </p>
          </div>
          <div>
            <h2>{invoice.invoiceNumber}</h2>
            <Status invoice={invoice} />
          </div>
        </div>
        <div className="invoice-document-meta">
          <div>
            <span>Ditagihkan kepada</span>
            <strong>{invoice.customerName}</strong>
          </div>
          <div>
            <span>Tanggal invoice</span>
            <strong>{invoice.date}</strong>
          </div>
          <div>
            <span>Jatuh tempo</span>
            <strong className={overdue ? "text-danger" : undefined}>
              {invoice.dueDate}
            </strong>
          </div>
        </div>
        {invoice.items.length ? (
          <div className="table-wrap">
            <table className="invoice-detail-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Ukuran</th>
                  <th className="num">Qty Stok</th>
                  <th className="num">Margin</th>
                  <th>Satuan</th>
                  <th className="num">Harga Jual</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((line, index) => {
                  const product = business.products.find(
                    (item) => item.id === line.productId,
                  );
                  const unit = line.unit ?? product?.unit ?? "";
                  const fullName =
                    line.productName ?? product?.name ?? "Produk tidak ditemukan";
                  const size = product?.size.trim() ?? "";
                  const name =
                    size && fullName.endsWith(size)
                      ? fullName.slice(0, -size.length).trim()
                      : fullName;
                  return (
                    <tr key={`${line.productId}-${index}`}>
                      <td>
                        <strong>{name}</strong>
                      </td>
                      <td>
                        {size ? <span className="size-chip">{size}</span> : "—"}
                      </td>
                      <td className="num">{quantity(line.stockQuantity)}</td>
                      <td className="num">
                        {line.marginQuantity > 0 ? (
                          <span className="margin-cell">
                            <b>+{quantity(line.marginQuantity)}</b>
                            <small>
                              {money(line.marginQuantity * line.sellingPrice)}
                            </small>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{unit}</td>
                      <td className="num">{money(line.sellingPrice)}</td>
                      <td className="num amount-cell">{money(line.subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="invoice-notice">
            Rincian produk belum tersedia pada invoice lama ini. Nilai tagihan
            tetap mengikuti data yang tersimpan.
          </p>
        )}
        <dl className="invoice-document-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(invoice.subtotal)}</dd>
          </div>
          <div>
            <dt>Diskon</dt>
            <dd className={invoice.discount > 0 ? "text-danger" : undefined}>
              {invoice.discount > 0 ? "-" : ""}
              {money(invoice.discount)}
            </dd>
          </div>
          {scaleMargin > 0 && (
            <div className="invoice-scale-margin">
              <dt>Total tonjolan bobot</dt>
              <dd>{money(scaleMargin)}</dd>
            </div>
          )}
          <div className="invoice-grand-total">
            <dt>Total tagihan</dt>
            <dd>{money(invoice.total)}</dd>
          </div>
          <div>
            <dt>Sudah dibayar</dt>
            <dd>{money(invoice.paidAmount)}</dd>
          </div>
          <div>
            <dt>Sisa tagihan</dt>
            <dd>{money(invoice.outstandingAmount)}</dd>
          </div>
        </dl>
      </section>
      <section className="panel invoice-section invoice-screen-only">
        <h2>Riwayat pembayaran</h2>
        {openingPaid > 0 && (
          <p className="invoice-notice">
            Saldo pembayaran lama {money(openingPaid)} belum memiliki rincian
            transaksi. Saldo ini tetap dipertahankan saat pembayaran lain
            dikoreksi.
          </p>
        )}
        {payments.length ? (
          <div className="batch-item-list">
            {payments.map((payment) => (
              <div className="batch-item" key={payment.id}>
                <div>
                  <strong>
                    {money(payment.amount)} · {payment.method}
                  </strong>
                  <small>
                    {payment.date} · {payment.reference || "Tanpa referensi"}
                  </small>
                </div>
                <div className="item-actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Edit pembayaran ${payment.date}`}
                    onClick={() => onEditPayment(payment)}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    className="icon-button danger-button"
                    type="button"
                    aria-label={`Hapus pembayaran ${payment.date}`}
                    onClick={() => onDeletePayment(payment)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="invoice-hint">
            Belum ada rincian pembayaran yang dicatat.
          </p>
        )}
      </section>
      </div>
      <aside className="invoice-detail-side invoice-screen-only">
        <section className="panel">
          <div className="side-heading">
            <i className={isPaid ? "side-icon is-paid" : "side-icon"}>
              {isPaid ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
            </i>
            <div>
              <h2>Status Pembayaran</h2>
              <small>
                {isPaid ? "Invoice telah lunas." : "Pantau progres pembayaran."}
              </small>
            </div>
          </div>
          <div className="side-rows">
            <div>
              <span>Total tagihan</span>
              <b>{money(invoice.total)}</b>
            </div>
            <div>
              <span>Sudah dibayar</span>
              <b className="text-success">{money(invoice.paidAmount)}</b>
            </div>
          </div>
          <div className={isPaid ? "side-balance is-paid" : "side-balance"}>
            <div>
              <span>Sisa tagihan</span>
              <strong className={overdue ? "text-danger" : undefined}>
                {invoice.outstandingAmount > 0
                  ? money(invoice.outstandingAmount)
                  : "Lunas"}
              </strong>
            </div>
            {invoice.total > 0 && (
              <div className="side-progress">
                <div>
                  <span>Progres pembayaran</span>
                  <span>{Math.round(paidShare)}%</span>
                </div>
                <div
                  className="side-progress-track"
                  role="progressbar"
                  aria-label="Progres pembayaran"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(paidShare)}
                >
                  <i style={{ width: `${paidShare}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="side-heading">
            <i className="side-icon">
              <Lock size={15} />
            </i>
            <div>
              <h2>Ringkasan Internal</h2>
              <small>Analisis transaksi</small>
            </div>
            <em className="internal-tag">Privat</em>
          </div>
          <div className="side-rows side-card">
            <div>
              <span>Pendapatan</span>
              <b>{money(invoice.total)}</b>
            </div>
            <div className="muted-row">
              <span>HPP Produk</span>
              <b>{money(costTotal)}</b>
            </div>
            {(invoice.directCosts ?? []).map((cost) => (
              <div className="muted-row" key={cost.id}>
                <span>
                  {directCostLabel(cost.category)} · {cost.name}
                </span>
                <b>{money(cost.amount)}</b>
              </div>
            ))}
          </div>
          {scaleMargin > 0 && (
            <div className="side-margin">
              <span>Margin Tagihan</span>
              <b>{money(scaleMargin)}</b>
            </div>
          )}
          <div className="side-profit">
            <div>
              <span>Laba Transaksi</span>
              <b>{money(profit)}</b>
            </div>
            <div>
              <span>Margin</span>
              <strong>{margin.toFixed(1).replace(".", ",")}%</strong>
            </div>
            <div className="side-progress-track">
              <i style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} />
            </div>
          </div>
        </section>
      </aside>
      </div>
    </>
  );
}

export default function InvoiceWorkspace({
  business,
  commands,
  onNotify,
  page,
  initialFormOpen = false,
  initialInvoiceId,
}: Props) {
  const [view, setView] = useState<"list" | "create" | "detail" | "edit">(
    initialInvoiceId
      ? "detail"
      : initialFormOpen && page === "Invoices"
        ? "create"
        : "list",
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialInvoiceId,
  );
  const [paymentForm, setPaymentForm] = useState<{
    invoiceId?: string;
    payment?: Payment;
    key: number;
  } | null>(initialFormOpen && page === "Payments" ? { key: 0 } : null);
  const paymentKey = useRef(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pageNumber, setPageNumber] = useState(1);
  const invoice = business.invoices.find((item) => item.id === selectedId);
  const showInvoice = (id: string) => {
    setSelectedId(id);
    setView("detail");
    setPaymentForm(null);
    setDeleteOpen(false);
  };
  const navigate = (action: () => void) => {
    if (confirmDiscardChanges()) action();
  };
  const openInvoice = (id: string) => navigate(() => showInvoice(id));
  const requestPayment = (form: { invoiceId?: string; payment?: Payment }) =>
    navigate(() => {
      setDeleteOpen(false);
      setPaymentForm({ ...form, key: ++paymentKey.current });
    });
  const removePayment = (payment: Payment) => {
    if (!confirmDiscardChanges()) return;
    if (
      !window.confirm(
        `Hapus pembayaran ${money(payment.amount)} tanggal ${payment.date}? Sisa piutang invoice akan bertambah. Tindakan ini tidak memindahkan uang atau memproses refund.`,
      )
    )
      return;
    const result = commands.deletePayment(payment.id, payment.revision ?? 0);
    onNotify(result.message, result.ok ? "success" : "error");
    if (result.ok) setPaymentForm(null);
  };
  if (view === "create" || (view === "edit" && invoice))
    return (
      <InvoiceEditor
        key={view === "edit" ? invoice!.id : "new"}
        business={business}
        commands={commands}
        onNotify={onNotify}
        initialInvoice={view === "edit" ? invoice : undefined}
        onCancel={() => setView(view === "edit" ? "detail" : "list")}
        onSaved={showInvoice}
      />
    );
  if (view === "detail" || view === "edit")
    return (
      <div className="workspace-page invoice-workspace">
        {invoice ? (
          <>
            <InvoiceDetail
              invoice={invoice}
              business={business}
              onNotify={onNotify}
              onEdit={() =>
                navigate(() => {
                  setPaymentForm(null);
                  setDeleteOpen(false);
                  setView("edit");
                })
              }
              onBack={() =>
                navigate(() => {
                  setPaymentForm(null);
                  setDeleteOpen(false);
                  setView("list");
                })
              }
              onPayment={() => requestPayment({ invoiceId: invoice.id })}
              onDelete={() =>
                navigate(() => {
                  setPaymentForm(null);
                  setDeleteOpen(true);
                })
              }
              onEditPayment={(payment) => requestPayment({ payment })}
              onDeletePayment={removePayment}
            />
            {paymentForm && (
              <PaymentForm
                {...{ business, commands, onNotify }}
                {...paymentForm}
                key={paymentForm.key}
                onCancel={() => setPaymentForm(null)}
                onSaved={() => setPaymentForm(null)}
              />
            )}
            {deleteOpen && (
              <DeleteInvoice
                {...{ invoice, business, commands, onNotify }}
                onCancel={() => setDeleteOpen(false)}
                onDeleted={() => {
                  setView("list");
                  setDeleteOpen(false);
                }}
              />
            )}
          </>
        ) : (
          <section className="panel">
            <p>Invoice tidak ditemukan atau sudah dihapus.</p>
            <button
              className="secondary-outline-button"
              type="button"
              onClick={() => setView("list")}
            >
              Kembali ke daftar
            </button>
          </section>
        )}
      </div>
    );
  const query = search.trim().toLowerCase();
  const allInvoices = business.invoices;
  const counts = {
    ALL: allInvoices.length,
    ISSUED: 0,
    PARTIALLY_PAID: 0,
    PAID: 0,
    OVERDUE: 0,
  };
  const amounts = { PAID: 0, OPEN: 0, OVERDUE: 0 };
  for (const item of allInvoices) {
    const current = effectiveStatus(item);
    counts[current] += 1;
    if (current === "PAID") amounts.PAID += item.total;
    else if (current === "OVERDUE") amounts.OVERDUE += item.outstandingAmount;
    else amounts.OPEN += item.outstandingAmount;
  }
  const openCount = counts.ISSUED + counts.PARTIALLY_PAID;
  const totalAmount = allInvoices.reduce((sum, item) => sum + item.total, 0);
  const share = (count: number) =>
    counts.ALL > 0 ? `${(count / counts.ALL) * 100}%` : "0%";
  const invoices = [...allInvoices]
    .filter(
      (item) =>
        `${item.invoiceNumber} ${item.customerName}`
          .toLowerCase()
          .includes(query) &&
        (status === "ALL" || effectiveStatus(item) === status),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const payments = [...business.payments]
    .filter((item) => {
      const invoice = business.invoices.find(
        (invoice) => invoice.id === item.invoiceId,
      );
      return `${invoice?.invoiceNumber} ${invoice?.customerName} ${item.reference} ${item.date} ${item.method}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const unpaid = allInvoices.filter((item) => item.outstandingAmount > 0);
  const receivable = unpaid.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const received = business.payments.reduce((sum, item) => sum + item.amount, 0);
  const invoicePage = paginate(invoices, pageNumber);
  const paymentPage = paginate(payments, pageNumber);
  const tabLabel = (label: string, count?: number) =>
    count === undefined ? label : `${label} ${count}`;
  const goInvoice = (id: string, next: "detail" | "edit" | "delete") =>
    navigate(() => {
      setSelectedId(id);
      setPaymentForm(null);
      setDeleteOpen(next === "delete");
      setView(next === "edit" ? "edit" : "detail");
    });
  const exportInvoices = () => {
    downloadCsv(
      "invoice-resto",
      ["Nomor", "Restoran", "Tanggal", "Jatuh tempo", "Total", "Margin", "Dibayar", "Sisa", "Status"],
      invoices.map((item) => [
        item.invoiceNumber,
        item.customerName,
        item.date,
        item.dueDate,
        item.total,
        marginValue(item),
        item.paidAmount,
        item.outstandingAmount,
        statusText(effectiveStatus(item)),
      ]),
    );
    onNotify(`${invoices.length} invoice berhasil diexport`);
  };
  const isInvoices = page === "Invoices";
  return (
    <div className="workspace-page invoice-workspace">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">Resto &amp; Online</p>
          <h1>{isInvoices ? "Invoice" : "Pembayaran"}</h1>
          <p>
            {isInvoices
              ? "Kelola invoice dan pembayaran restoran"
              : "Riwayat pembayaran invoice"}
          </p>
        </div>
        {isInvoices && (
          <div className="workspace-actions">
            <button
              className="secondary-outline-button"
              type="button"
              onClick={exportInvoices}
            >
              <Download size={15} /> Export
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate(() => setView("create"))}
            >
              <Plus size={16} />
              Buat Invoice
            </button>
          </div>
        )}
      </div>
      {isInvoices ? (
        <section className="panel invoice-overview" aria-label="Ringkasan invoice">
          <div className="invoice-overview-top">
            <div>
              <span>Total tagihan aktif</span>
              <strong>{money(totalAmount)}</strong>
            </div>
            <div className="invoice-overview-count">
              <ReceiptText size={18} />
              <div>
                <strong>{counts.ALL}</strong>
                <small>Invoice</small>
              </div>
            </div>
          </div>
          <div
            className="invoice-overview-bar"
            role="progressbar"
            aria-label="Progres pembayaran invoice"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(counts.ALL ? (counts.PAID / counts.ALL) * 100 : 0)}
          >
            <i className="bar-paid" style={{ width: share(counts.PAID) }} />
            <i className="bar-open" style={{ width: share(openCount) }} />
            <i className="bar-overdue" style={{ width: share(counts.OVERDUE) }} />
          </div>
          <div className="invoice-overview-stats">
            <div>
              <div><i className="dot-paid" /><span>Lunas</span></div>
              <small>{counts.PAID} invoice</small>
              <strong>{money(amounts.PAID)}</strong>
            </div>
            <div>
              <div><i className="dot-open" /><span>Belum Lunas</span></div>
              <small>{openCount} invoice</small>
              <strong>{money(amounts.OPEN)}</strong>
            </div>
            <div className={counts.OVERDUE > 0 ? "is-overdue" : "is-empty"}>
              <div><i className="dot-overdue" /><span>Jatuh Tempo</span></div>
              <small>{counts.OVERDUE} invoice</small>
              <strong>{counts.OVERDUE > 0 ? money(amounts.OVERDUE) : "—"}</strong>
            </div>
          </div>
        </section>
      ) : (
        <Stats
          items={[
            {
              label: "Total Piutang",
              value: money(receivable),
              detail: `${unpaid.length} invoice belum lunas`,
              tone: receivable > 0 ? "warn" : undefined,
            },
            {
              label: "Pembayaran Masuk",
              value: money(received),
              detail: `${business.payments.length} pembayaran tercatat`,
            },
            {
              label: "Invoice Overdue",
              value: String(counts.OVERDUE),
              detail: counts.OVERDUE > 0 ? "perlu ditagih" : "tidak ada yang lewat tempo",
              tone: counts.OVERDUE > 0 ? "danger" : undefined,
            },
          ]}
        />
      )}
      {paymentForm && (
        <PaymentForm
          {...{ business, commands, onNotify }}
          {...paymentForm}
          key={paymentForm.key}
          onCancel={() => setPaymentForm(null)}
          onSaved={showInvoice}
        />
      )}
      <section className="panel">
        {isInvoices ? (
          <>
            <div className="resto-toolbar resource-toolbar">
              <SearchBox
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPageNumber(1);
                }}
                placeholder="Cari nomor invoice atau restoran..."
              />
            </div>
            <Tabs
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPageNumber(1);
              }}
              items={[
                { value: "ALL", label: "Semua" },
                { value: "ISSUED", label: tabLabel("Belum Dibayar", counts.ISSUED) },
                { value: "PARTIALLY_PAID", label: tabLabel("Dibayar Sebagian", counts.PARTIALLY_PAID) },
                { value: "PAID", label: tabLabel("Lunas", counts.PAID) },
                { value: "OVERDUE", label: tabLabel("Jatuh Tempo", counts.OVERDUE) },
              ]}
            />
            <Table
              columns={["Nomor Invoice", "Restoran", "Tanggal", "Jatuh Tempo", "Total", "Margin", "Dibayar", "Sisa", "Status", "Aksi"]}
              count={invoices.length}
              className="invoice-table"
              empty={
                query || status !== "ALL"
                  ? "Tidak ada invoice yang cocok. Coba ubah filter atau kata kunci pencarian."
                  : "Belum ada invoice. Gunakan Buat Invoice untuk mulai."
              }
            >
              {invoicePage.rows.map((invoice) => {
                const current = effectiveStatus(invoice);
                const margin = marginValue(invoice);
                return (
                  <tr
                    key={invoice.id}
                    className="row-clickable"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest(".row-actions")) return;
                      openInvoice(invoice.id);
                    }}
                  >
                    <Cell label="Nomor Invoice" className="resource-primary-cell">
                      <button className="text-link" type="button">
                        {invoice.invoiceNumber}
                      </button>
                    </Cell>
                    <Cell label="Restoran" className="cell-wrap">
                      <strong>{invoice.customerName}</strong>
                      <small className="cell-sub">
                        {invoice.salesChannel === "RESTAURANT" ? "Restoran" : "Online"}
                      </small>
                    </Cell>
                    <Cell label="Tanggal" className="nowrap">{invoice.date}</Cell>
                    <Cell label="Jatuh Tempo" className="nowrap">
                      <span className={current === "OVERDUE" ? "text-danger" : undefined}>
                        {invoice.dueDate || "—"}
                      </span>
                    </Cell>
                    <Cell label="Total" className="amount-cell nowrap">{money(invoice.total)}</Cell>
                    <Cell label="Margin" className="nowrap">
                      {margin > 0 ? <span className="text-success">{money(margin)}</span> : "—"}
                    </Cell>
                    <Cell label="Dibayar" className="nowrap">
                      {invoice.paidAmount > 0 ? money(invoice.paidAmount) : "—"}
                    </Cell>
                    <Cell label="Sisa" className="nowrap">
                      {invoice.outstandingAmount > 0 ? (
                        <span className={current === "OVERDUE" ? "text-danger" : undefined}>
                          {money(invoice.outstandingAmount)}
                        </span>
                      ) : (
                        <span className="text-success">Lunas</span>
                      )}
                    </Cell>
                    <Cell label="Status" className="nowrap"><Status invoice={invoice} /></Cell>
                    <Cell label="Aksi" className="row-actions">
                      <IconAction label={`Kirim WhatsApp ${invoice.invoiceNumber}`} onClick={() => sendInvoiceWhatsapp(invoice, business, onNotify)}>
                        <MessageCircle size={15} />
                      </IconAction>
                      <IconAction label={`Unduh PDF ${invoice.invoiceNumber}`} onClick={() => saveInvoicePdf(invoice, business, onNotify)}>
                        <Download size={15} />
                      </IconAction>
                      <IconAction label={`Edit ${invoice.invoiceNumber}`} onClick={() => goInvoice(invoice.id, "edit")}>
                        <Pencil size={15} />
                      </IconAction>
                      {invoice.outstandingAmount > 0 && (
                        <IconAction label={`Catat pembayaran ${invoice.invoiceNumber}`} onClick={() => requestPayment({ invoiceId: invoice.id })}>
                          <CreditCard size={15} />
                        </IconAction>
                      )}
                      <IconAction label={`Hapus ${invoice.invoiceNumber}`} danger onClick={() => goInvoice(invoice.id, "delete")}>
                        <Trash2 size={15} />
                      </IconAction>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={invoicePage.current} total={invoices.length} pageSize={25} onPage={setPageNumber} />
          </>
        ) : (
          <>
            <div className="resto-toolbar resource-toolbar">
              <div>
                <h2 className="panel-title">Riwayat Pembayaran</h2>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => requestPayment({})}
              >
                <Plus size={16} />
                Catat pembayaran
              </button>
            </div>
            <div className="resto-toolbar resource-toolbar">
              <SearchBox
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPageNumber(1);
                }}
                placeholder="Cari nomor, pelanggan, tanggal…"
              />
            </div>
            <Table
              columns={["Tanggal", "Invoice", "Metode", "Referensi", "Nominal", "Aksi"]}
              count={payments.length}
              empty={
                query
                  ? "Tidak ada pembayaran yang cocok dengan pencarian."
                  : "Belum ada catatan pembayaran. Gunakan Catat pembayaran atau buka detail invoice."
              }
            >
              {paymentPage.rows.map((payment) => {
                const invoice = business.invoices.find(
                  (item) => item.id === payment.invoiceId,
                );
                return (
                  <tr key={payment.id}>
                    <Cell label="Tanggal" className="nowrap">{payment.date}</Cell>
                    <Cell label="Invoice" className="resource-primary-cell">
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => openInvoice(payment.invoiceId)}
                      >
                        {invoice?.invoiceNumber ?? "Invoice tidak ditemukan"}
                      </button>
                      <small className="cell-sub">{invoice?.customerName ?? "—"}</small>
                    </Cell>
                    <Cell label="Metode">{payment.method}</Cell>
                    <Cell label="Referensi">{payment.reference || "—"}</Cell>
                    <Cell label="Nominal" className="amount-cell nowrap">
                      <span className="text-success">+{money(payment.amount)}</span>
                    </Cell>
                    <Cell label="Aksi" className="row-actions">
                      <IconAction label={`Edit pembayaran ${payment.date}`} onClick={() => requestPayment({ payment })}>
                        <Edit2 size={15} />
                      </IconAction>
                      <IconAction label={`Hapus pembayaran ${payment.date}`} danger onClick={() => removePayment(payment)}>
                        <Trash2 size={15} />
                      </IconAction>
                    </Cell>
                  </tr>
                );
              })}
            </Table>
            <Pager page={paymentPage.current} total={payments.length} pageSize={25} onPage={setPageNumber} />
          </>
        )}
      </section>
      {!isInvoices && (
        <section className="panel invoice-section">
          <h2>Invoice belum lunas</h2>
          {unpaid.map((item) => (
            <div className="batch-item" key={item.id}>
              <div>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => openInvoice(item.id)}
                >
                  {item.invoiceNumber} · {item.customerName}
                </button>
                <small>Jatuh tempo {item.dueDate}</small>
              </div>
              <strong>{money(item.outstandingAmount)}</strong>
            </div>
          ))}
          {unpaid.length === 0 && (
            <p className="invoice-hint">Semua invoice sudah lunas.</p>
          )}
        </section>
      )}
    </div>
  );
}

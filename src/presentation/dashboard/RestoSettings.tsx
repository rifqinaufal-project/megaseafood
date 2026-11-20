"use client";

import { useState, type FormEvent } from "react";
import { Building2, Save, UserRound } from "lucide-react";
import type { BusinessCommands } from "@/src/application/use-cases/business-commands";
import type { AuthAccount } from "@/src/domain/auth-account";
import type { BusinessState, CompanyProfile } from "@/src/domain/business-state";
import { BANK_OPTIONS, auditActionLabels, currentUser } from "@/src/domain/settings";
import { Cell, FormField, PageHead, Pager, SearchBox, StatusChip, Table, Tabs, matches, paginate, report, type Notify } from "@/src/presentation/dashboard/resto-ui";

type SettingsTab = "company" | "users" | "audit";
type Props = { business: BusinessState; accountUsers?: AuthAccount[]; commands: BusinessCommands; onNotify: Notify };

const dateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const companyFields: { key: keyof CompanyProfile; label: string; placeholder: string; span?: boolean; type?: string; mono?: boolean }[] = [
  { key: "name", label: "Nama bisnis *", placeholder: "megaseafood", span: true },
  { key: "address", label: "Alamat kantor atau gudang", placeholder: "Alamat lengkap bisnis", span: true },
  { key: "phone", label: "Telepon atau WhatsApp", placeholder: "0812XXXXXXXX" },
  { key: "email", label: "Email bisnis", placeholder: "info@bisnis.id", type: "email" },
  { key: "website", label: "Website (opsional)", placeholder: "www.bisnis.id" },
  { key: "npwp", label: "NPWP (opsional)", placeholder: "00.000.000.0-000.000", mono: true },
];

function CompanyForm({ business, commands, onNotify }: Props) {
  const [draft, setDraft] = useState<CompanyProfile>(business.company);
  const [initial] = useState(() => JSON.stringify(business.company));
  const dirty = JSON.stringify(draft) !== initial;
  const set = (key: keyof CompanyProfile, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    report(onNotify, commands.updateCompany(draft));
  };
  const banks = BANK_OPTIONS.includes(draft.bankName) || !draft.bankName ? BANK_OPTIONS : [draft.bankName, ...BANK_OPTIONS];

  return (
    <form className="settings-layout" onSubmit={submit} data-unsaved={dirty ? "true" : "false"}>
      <div className="settings-main">
        <section className="panel">
          <div className="ie-section-head">
            <i className="side-icon"><Building2 size={16} /></i>
            <div>
              <h2>Identitas bisnis</h2>
              <p>Data ini menjadi identitas pada dokumen penjualan.</p>
            </div>
          </div>
          <div className="form-grid">
            {companyFields.map((field) => (
              <FormField key={field.key} label={field.label} span={field.span}>
                {field.key === "address" ? (
                  <textarea rows={3} value={draft.address} placeholder={field.placeholder} onChange={(event) => set("address", event.target.value)} />
                ) : (
                  <input
                    type={field.type ?? "text"}
                    required={field.key === "name"}
                    className={field.mono ? "mono" : undefined}
                    value={draft[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) => set(field.key, event.target.value)}
                  />
                )}
              </FormField>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="ie-section-head">
            <i className="side-icon"><Building2 size={16} /></i>
            <div>
              <h2>Rekening pembayaran</h2>
              <p>Pelanggan melihat rekening ini pada petunjuk pembayaran invoice.</p>
            </div>
          </div>
          <div className="form-grid">
            <FormField label="Nama bank">
              <select value={draft.bankName} onChange={(event) => set("bankName", event.target.value)}>
                {banks.map((bank) => <option key={bank}>{bank}</option>)}
              </select>
            </FormField>
            <FormField label="Nomor rekening">
              <input className="mono" inputMode="numeric" value={draft.bankAccount} placeholder="1234567890" onChange={(event) => set("bankAccount", event.target.value)} />
            </FormField>
            <FormField label="Nama pemilik rekening" span>
              <input value={draft.bankHolder} placeholder="Nama sesuai buku tabungan" onChange={(event) => set("bankHolder", event.target.value)} />
            </FormField>
          </div>
        </section>
      </div>

      <aside className="settings-aside">
        <section className="panel settings-preview">
          <p className="chart-kicker">Pratinjau invoice</p>
          <strong>{draft.name || "Nama bisnis"}</strong>
          <p>{draft.address || "Alamat bisnis akan tampil di sini"}</p>
          <small>{[draft.phone, draft.email].filter(Boolean).join(" · ") || "Kontak bisnis belum diisi"}</small>
          <div className="settings-bank">
            <span>Pembayaran transfer</span>
            <b>{draft.bankName || "Nama bank"}</b>
            <code>{draft.bankAccount || "0000000000"}</code>
            <small>a.n. {draft.bankHolder || "Nama pemilik rekening"}</small>
          </div>
        </section>
        <section className="panel">
          <p className="side-title">Simpan profil bisnis</p>
          <p className="invoice-hint">Perubahan tercatat pada Audit log.</p>
          <button className="primary-button settings-save" type="submit" disabled={!dirty}>
            <Save size={15} /> Simpan perubahan
          </button>
        </section>
      </aside>
    </form>
  );
}

function UsersPanel({ business, accountUsers }: Props) {
  const active = currentUser(business);
  const accounts = accountUsers ?? [];
  return (
    <>
      <section className="panel settings-profile">
        <div className="ie-section-head">
          <i className="side-icon"><UserRound size={16} /></i>
          <div>
            <h2>Akun login</h2>
            <p>Daftar akun yang dapat masuk ke aplikasi. Setiap perubahan dicatat pada Audit log.</p>
          </div>
        </div>
        <dl className="settings-profile-grid">
          <div><dt>Akun aktif</dt><dd>{accounts.length || (active ? 1 : 0)}</dd></div>
          <div><dt>Login saat ini</dt><dd>{accounts[0]?.username ?? active?.name ?? "—"}</dd></div>
          <div><dt>Akses data</dt><dd>Satu data bisnis bersama</dd></div>
        </dl>
      </section>
      <section className="panel">
        <div className="resto-toolbar resource-toolbar">
          <h2 className="panel-title">Daftar pengguna</h2>
        </div>
        <Table columns={["Username", "Dibuat", "Status"]} count={accounts.length} empty="Belum ada akun login.">
          {accounts.map((account) => (
            <tr key={account.id}>
              <Cell label="Username" className="resource-primary-cell"><strong>{account.username}</strong></Cell>
              <Cell label="Dibuat" className="mono">{dateTime(account.createdAt)}</Cell>
              <Cell label="Status"><StatusChip tone="lunas">Aktif</StatusChip></Cell>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function AuditPanel({ business }: { business: BusinessState }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const logs = [...business.auditLogs]
    .reverse()
    .filter((log) => matches(search, log.userName, log.entityName, log.reference, auditActionLabels[log.action] ?? log.action));
  const { current, rows } = paginate(logs, page);
  return (
    <section className="panel">
      <div className="resto-toolbar resource-toolbar">
        <h2 className="panel-title">Riwayat aktivitas</h2>
        <SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Cari aktivitas" />
      </div>
      <Table columns={["Waktu", "Pengguna", "Entitas", "Aksi"]} count={logs.length} empty="Belum ada aktivitas tercatat.">
        {rows.map((log) => (
          <tr key={log.id}>
            <Cell label="Waktu" className="nowrap mono">{dateTime(log.createdAt)}</Cell>
            <Cell label="Pengguna">{log.userName}</Cell>
            <Cell label="Entitas">{log.entityName}{log.reference && <small className="cell-sub">{log.reference}</small>}</Cell>
            <Cell label="Aksi"><strong>{auditActionLabels[log.action] ?? log.action}</strong></Cell>
          </tr>
        ))}
      </Table>
      <div className="report-foot"><span>{logs.length} aktivitas</span></div>
      <Pager page={current} total={logs.length} pageSize={25} onPage={setPage} />
    </section>
  );
}

const titles: Record<SettingsTab, { title: string; description: string }> = {
  company: { title: "Profil bisnis", description: "Atur identitas dan rekening yang tampil pada invoice dan halaman pelanggan." },
  users: { title: "Pengguna", description: "Profil akun dan daftar pengguna yang tercatat pada audit log." },
  audit: { title: "Audit log", description: "Riwayat aktivitas penting pada data bisnis." },
};

export function RestoSettingsPage(props: Props) {
  const [tab, setTab] = useState<SettingsTab>("company");
  return (
    <div className="workspace-page resto-settings">
      <PageHead eyebrow="Resto & Online / Pengaturan" title={titles[tab].title} description={titles[tab].description} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "company", label: "Profil bisnis" },
          { value: "users", label: "Pengguna" },
          { value: "audit", label: "Audit log" },
        ]}
      />
      {tab === "company" && <CompanyForm {...props} />}
      {tab === "users" && <UsersPanel {...props} />}
      {tab === "audit" && <AuditPanel business={props.business} />}
    </div>
  );
}

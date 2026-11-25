import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Dashboard</p>
        <h1>Halaman tidak ditemukan</h1>
        <p>URL dashboard yang kamu buka tidak tersedia.</p>
        <Link className="primary-button" href="/dashboard">
          Kembali ke dashboard
        </Link>
      </section>
    </main>
  );
}

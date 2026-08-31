import { APP_CONFIG } from './config/app';

export function App() {
  return (
    <main className="foundation-shell">
      <section className="foundation-card" aria-labelledby="app-title">
        <p className="foundation-eyebrow">P0 · Foundation</p>
        <h1 id="app-title">{APP_CONFIG.name}</h1>
        <p className="foundation-copy">Local-first foundation ready.</p>
      </section>
    </main>
  );
}

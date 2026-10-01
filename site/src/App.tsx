const ETSY_URL =
  'https://www.etsy.com/listing/4584653165/desktopdugout-live-desktop-scoreboard';

export function App() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Desktop Dugout</p>
        <h1>Live baseball scores, on your desk.</h1>
        <p className="lede">
          A 3D-printed scoreboard that pulls live game state over Wi-Fi and drives its own
          seven-segment displays. Pick your team, plug it in, and watch every pitch update
          in near real time.
        </p>
      </header>

      <section className="specs">
        <ul>
          <li>Follows any baseball team</li>
          <li>Refreshes about once per minute during live games</li>
          <li>Wi-Fi setup from your phone; no app required</li>
          <li>Micro-USB powered, always-on</li>
          <li>3D-printed enclosure with a slatted diffuser front</li>
          <li>Over-the-air firmware updates</li>
        </ul>
      </section>

      <section className="cta">
        <a
          className="btn"
          href={ETSY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Buy now on Etsy
        </a>
      </section>
    </main>
  );
}

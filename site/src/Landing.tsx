const ETSY_URL =
  'https://www.etsy.com/listing/4584653165/desktopdugout-live-desktop-scoreboard';

const HERO_VIDEO_SRC: string | null = null;
const HERO_POSTER = '/photos/overall_photo.jpg';

const SHIP_FROM_CITY = 'Denver, CO';

export function Landing() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Desktop Dugout</p>
        <h1>A handmade baseball scoreboard &mdash; live, on your desk.</h1>
        <p className="lede">
          A 3D-printed desktop scoreboard inspired by the manual boards of old
          ballparks. Plug it in, pick a team, and watch digits flip inning by
          inning &mdash; no app, no account.
        </p>
        <div className="cta cta-hero">
          <a
            className="btn btn-lg"
            href={ETSY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy on Etsy
          </a>
          <a className="btn-link" href="/setup">
            See how setup works &rarr;
          </a>
        </div>
      </header>

      <figure className="hero-media">
        {HERO_VIDEO_SRC ? (
          <video
            src={HERO_VIDEO_SRC}
            poster={HERO_POSTER}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={HERO_POSTER}
            alt="The scoreboard sitting on a kitchen counter, plugged in, showing a live inning-by-inning line score."
            width="900"
            height="1600"
            fetchPriority="high"
          />
        )}
      </figure>

      <section className="trust" aria-label="At a glance">
        <ul>
          <li>
            <span className="trust-k">Handmade</span>
            <span className="trust-v">in {SHIP_FROM_CITY}</span>
          </li>
          <li>
            <span className="trust-k">Follows</span>
            <span className="trust-v">any of the 30 teams</span>
          </li>
          <li>
            <span className="trust-k">2-minute</span>
            <span className="trust-v">Wi-Fi setup, no app</span>
          </li>
          <li>
            <span className="trust-k">Updates</span>
            <span className="trust-v">over the air</span>
          </li>
        </ul>
      </section>

      <section className="details">
        <h2>What it is</h2>
        <p>
          A desk-sized tribute to the slat-and-digit manual scoreboards that
          still stand in a handful of old ballparks. Inside the 3D-printed
          shell, a small microcontroller pulls live baseball game state over
          your home Wi-Fi and drives its own seven-segment digits &mdash; so
          the line score on your desk is the line score of the game, roughly
          once a minute, from first pitch to final out.
        </p>
        <ul className="details-list">
          <li>Pick any of the 30 teams from your phone during setup.</li>
          <li>Refreshes about once per minute while the game is live.</li>
          <li>
            Holds the last score on-screen between games and during Wi-Fi
            hiccups.
          </li>
          <li>Micro-USB powered, meant to stay on.</li>
          <li>New features arrive automatically via over-the-air updates.</li>
        </ul>
      </section>

      <section className="gallery" aria-label="On real desks">
        <figure>
          <img
            src="/photos/customer_photo.jpg"
            alt="The scoreboard on a wooden desk alongside notes and a map, showing a mid-game line score."
            width="900"
            height="1200"
            loading="lazy"
          />
        </figure>
        <figure>
          <img
            src="/photos/customer_photo2.jpg"
            alt="The scoreboard on a kitchen counter, powered by a wall adapter, showing the opening of a game."
            width="900"
            height="1600"
            loading="lazy"
          />
        </figure>
      </section>

      <section className="quick-answers">
        <h2>Quick answers</h2>
        <dl>
          <dt>Is setup actually easy?</dt>
          <dd>
            Plug it in, join its Wi-Fi network from your phone for a minute,
            pick your home Wi-Fi and your team, done.{' '}
            <a href="/setup">Step-by-step guide &rarr;</a>
          </dd>

          <dt>What if my Wi-Fi hiccups mid-game?</dt>
          <dd>
            The last good score stays on the display. It reconnects
            automatically and picks the game back up on its own.
          </dd>

          <dt>Do I need an app or an account?</dt>
          <dd>
            Neither. Setup is a web page your phone opens on its own; after
            that the scoreboard just runs.
          </dd>

          <dt>Can I change teams later?</dt>
          <dd>
            Yes &mdash; from any browser on the same Wi-Fi. Takes a few
            seconds.
          </dd>
        </dl>
      </section>

      <section className="cta cta-final">
        <a
          className="btn btn-lg"
          href={ETSY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Buy on Etsy
        </a>
      </section>
    </main>
  );
}

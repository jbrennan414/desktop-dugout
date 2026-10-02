export function Setup() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">
          <a href="/" className="back">&larr; Back</a>
        </p>
        <h1>Setup</h1>
        <p className="lede">
          First-time setup takes about two minutes. You'll need the scoreboard, a
          Micro-USB cable, and the phone or laptop you'd normally use to connect to
          Wi-Fi.
        </p>
      </header>

      <section className="guide">
        <h2>First-time setup</h2>
        <ol>
          <li>
            Plug the scoreboard into power with the Micro-USB cable. The LCD lights up
            and briefly shows <code>firmware: v1.0.x</code>, then{' '}
            <code>wifi setup: DesktopDugout</code>.
          </li>
          <li>
            On your phone, open Wi-Fi settings and join the network named{' '}
            <strong>DesktopDugout</strong>. It's open (no password). Your phone may
            warn that this network has no internet &mdash; that's expected; stay
            connected.
          </li>
          <li>
            A setup page should pop up automatically after a few seconds. If it
            doesn't, open any website in your browser and the page will appear.
          </li>
          <li>
            On the setup page:
            <ul>
              <li>Pick your home Wi-Fi network from the dropdown.</li>
              <li>Type its password. (Tap "Show password" to double-check it.)</li>
              <li>Pick your team.</li>
              <li>Tap <strong>Save</strong>.</li>
            </ul>
          </li>
          <li>
            The scoreboard will show <code>connecting...</code> while it joins your
            Wi-Fi, then flash two screens: your team and network, followed by its
            local IP address prefixed with <code>setup: http://</code>.{' '}
            <strong>Write that IP down</strong> &mdash; you'll use it to change teams
            later.
            <figure className="guide-media">
              <img
                src="/photos/setup_screen.jpg"
                alt="LCD showing 'setup: http://' on the top row and the IP address 192.168.1.63 on the bottom row."
                width="900"
                height="1200"
                loading="lazy"
              />
              <figcaption>
                That bottom row is the address you'll open in a browser.
              </figcaption>
            </figure>
          </li>
          <li>
            After about eight seconds, live game data appears. You're done.
          </li>
        </ol>
      </section>

      <section className="guide">
        <h2>Change your team</h2>
        <ol>
          <li>
            On a phone or laptop connected to the same Wi-Fi network as the
            scoreboard, open a browser and go to{' '}
            <code>http://&lt;scoreboard-ip&gt;/</code> (the IP you wrote down).
          </li>
          <li>
            Pick a new team from the dropdown and tap <strong>Save</strong>. The
            display updates within a few seconds.
          </li>
        </ol>
        <p className="note">
          If your browser says "connection refused," make sure you typed{' '}
          <code>http://</code> and not <code>https://</code>. The scoreboard serves
          plain HTTP on your local network.
        </p>
      </section>

      <section className="guide">
        <h2>Change your Wi-Fi network</h2>
        <ol>
          <li>
            Open <code>http://&lt;scoreboard-ip&gt;/</code> in a browser.
          </li>
          <li>
            Scroll down and tap the red <strong>Change Wi-Fi network</strong>{' '}
            button, then confirm.
          </li>
          <li>
            The scoreboard reboots and re-opens its <strong>DesktopDugout</strong>{' '}
            setup network. Follow the first-time setup steps above to connect it to
            a new Wi-Fi.
          </li>
        </ol>
      </section>

      <section className="guide">
        <h2>Troubleshooting</h2>
        <dl className="faq">
          <dt>I missed the IP on the LCD.</dt>
          <dd>
            Unplug and replug the scoreboard. The IP shows for five seconds after
            boot.
          </dd>

          <dt>The setup page never appeared on my phone.</dt>
          <dd>
            Open a browser and type any URL (like <code>example.com</code>) while
            connected to the <strong>DesktopDugout</strong> network &mdash; the
            captive-portal page should load.
          </dd>

          <dt>The LCD says "wifi failed, rebooting..."</dt>
          <dd>
            Wrong Wi-Fi password, or the signal is too weak where the scoreboard
            sits. The device reboots and reopens the setup network so you can try
            again.
          </dd>

          <dt>Live scores stopped updating.</dt>
          <dd>
            The scoreboard polls the Desktop Dugout service about once a minute. If
            your home Wi-Fi drops or the service is briefly unavailable, the last
            good score stays on the LCD. Unplugging and replugging will reconnect.
          </dd>
        </dl>
      </section>

      <section className="cta">
        <a className="btn btn-ghost" href="/">&larr; Back to home</a>
      </section>
    </main>
  );
}

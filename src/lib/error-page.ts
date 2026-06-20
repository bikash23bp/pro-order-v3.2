export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body {
        font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: oklch(0.16 0.04 270);
        color: oklch(0.97 0.01 270);
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .card {
        max-width: 26rem;
        width: 100%;
        text-align: center;
        padding: 2.5rem;
        background: oklch(0.21 0.05 270);
        border: 1px solid oklch(1 0 0 / 10%);
        border-radius: 0.75rem;
        box-shadow: 0 10px 40px -10px oklch(0 0 0 / 40%);
      }
      .icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 1.25rem;
        color: oklch(0.58 0.22 275);
      }
      h1 {
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0 0 0.5rem;
      }
      p {
        color: oklch(0.7 0.04 270);
        margin: 0 0 1.75rem;
        line-height: 1.6;
      }
      .actions {
        display: flex;
        gap: 0.625rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      button, a {
        padding: 0.625rem 1.25rem;
        border-radius: 0.5rem;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        transition: opacity 0.15s ease;
      }
      button:hover, a:hover { opacity: 0.9; }
      .primary {
        background: oklch(0.58 0.22 275);
        color: oklch(0.99 0.01 270);
      }
      .secondary {
        background: oklch(0.27 0.06 270);
        color: oklch(0.97 0.01 270);
        border-color: oklch(1 0 0 / 10%);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}

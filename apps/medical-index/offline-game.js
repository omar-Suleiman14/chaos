/* Offline runner shared by Chaos and Chaos Index. No network, tracking or external assets. */
(() => {
  "use strict";
  const root = document.getElementById("offlineGame");
  if (!root) return;
  const canvas = root.querySelector("canvas");
  const ctx = canvas?.getContext("2d");
  const status = root.querySelector("[data-game-status]");
  const scoreEl = root.querySelector("[data-game-score]");
  const button = root.querySelector("[data-game-jump]");
  if (!ctx || !status || !scoreEl || !button) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false, ended = false, y = 0, velocity = 0, score = 0, speed = 4, last = 0, obstacle = 680, raf = 0;
  const ground = 145, playerX = 70, playerW = 27, playerH = 31;
  function rect(x, yy, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, yy, w, h); }
  function render() {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const ink = dark ? "#d6d6d6" : "#404040";
    const muted = dark ? "#686868" : "#b0b0b0";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    rect(0, ground + 1, 680, 1, muted);
    for (let i = 0; i < 22; i++) rect((i * 41 - (score * 0.5) % 41 + 680) % 680, ground + 9, 9, 1, muted);
    rect(playerX, ground - playerH - y, playerW, playerH, ink);
    rect(playerX + 17, ground - playerH - y + 7, 4, 4, dark ? "#151515" : "#fff");
    rect(obstacle, ground - 26, 18, 26, muted);
    rect(obstacle + 5, ground - 34, 8, 8, muted);
  }
  function stop() {
    running = false; ended = true;
    cancelAnimationFrame(raf);
    status.textContent = "Connection still lost. Game over — retry when ready.";
    button.textContent = "Play again";
  }
  function step(now) {
    if (!running) return;
    const frames = Math.min((now - last) / 16.67 || 1, 2);
    last = now;
    velocity -= 0.6 * frames;
    y = Math.max(0, y + velocity * frames);
    if (y === 0) velocity = 0;
    obstacle -= speed * frames;
    if (obstacle < -20) { obstacle = 680 + Math.random() * 160; score += 1; speed = Math.min(9, speed + 0.12); scoreEl.textContent = String(score); }
    if (obstacle < playerX + playerW - 4 && obstacle + 18 > playerX + 4 && y < 26) { stop(); render(); return; }
    render(); raf = requestAnimationFrame(step);
  }
  function jump() {
    if (reduced) {
      status.textContent = "Motion is reduced on this device. Use Retry connection above when you're online.";
      return;
    }
    if (!running) {
      running = true; ended = false; y = 0; velocity = 0; score = 0; speed = 4; obstacle = 530;
      scoreEl.textContent = "0"; button.textContent = "Jump";
      status.textContent = "Playing. Press Space, Up Arrow, or Jump to avoid obstacles.";
      last = performance.now(); raf = requestAnimationFrame(step); return;
    }
    if (y === 0) velocity = 11.2;
  }
  button.addEventListener("click", jump);
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    if (/input|textarea|select/i.test(e.target?.tagName || "") || e.target?.isContentEditable) return;
    e.preventDefault();
    jump();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running) { running = false; cancelAnimationFrame(raf); status.textContent = "Paused. Press Jump to resume."; }
  });
  window.addEventListener("online", () => { status.textContent = "Connection restored! You can retry the page."; });
  render();
})();
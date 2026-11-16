/* Optional, self-contained game shared by the app and the offline fallback. */
(() => {
  window.MaxPaperHop = {
    mount(host) {
      const root = host.shadowRoot || host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>:host{display:block;color:inherit;font:14px system-ui,sans-serif}button{font:inherit;cursor:pointer;border:1px solid #92969b;background:transparent;color:inherit;border-radius:8px;padding:9px 16px}button:focus-visible{outline:3px solid #3c6ea8;outline-offset:3px}canvas{width:100%;height:auto;display:block;border:1px solid #92969b55;border-radius:14px;margin-top:14px;background:linear-gradient(180deg,#859dbb13,transparent);touch-action:manipulation}p{line-height:1.6;margin:12px 0}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.best{opacity:.7;font-size:12px}.row button{min-height:44px}.sound{margin-inline-start:auto}button:hover{background:#8882}.score{margin-inline-start:auto;font-variant-numeric:tabular-nums}small{opacity:.8}</style><div class="row"><strong>Paper hop</strong><span class="best">Best: 0</span><span class="score" role="status" aria-live="polite">Score: 0</span></div><canvas width="600" height="200" role="img" aria-label="A butterfly jumping over stacks of paper"></canvas><p>Give your ideas a little lift. Space, ↑, or tap the game to hop over the paper stacks.</p><div class="row"><button type="button">Start playing</button><small><span class="hint">One more hop?</span></small><button class="sound" type="button" aria-pressed="false">Sound off</button><button class="hop" type="button">Hop ?</button></div>`;
      const canvas = root.querySelector("canvas");
      const context = canvas.getContext("2d");
      const button = root.querySelector("button");
      const scoreText = root.querySelector(".score");
      const soundButton = root.querySelector(".sound");
      const hopButton = root.querySelector(".hop");
      const bestText = root.querySelector(".best");
      let best = 0;
      try { best = Number(localStorage.getItem("max:paper-hop-best")) || 0; } catch {}
      bestText.textContent = `Best: ${best}`;
      let sound = false;
      let audio;
      const tone = (frequency, length = .09, slide = 1.4) => {
        if (!sound) return;
        try {
          audio ||= new (window.AudioContext || window.webkitAudioContext)();
          void audio.resume();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(frequency * slide, audio.currentTime + length);
          gain.gain.setValueAtTime(.045, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length);
          oscillator.connect(gain); gain.connect(audio.destination);
          oscillator.start(); oscillator.stop(audio.currentTime + length);
        } catch { sound = false; soundButton.textContent = "Sound unavailable"; soundButton.setAttribute("aria-pressed", "false"); soundButton.disabled = true; }
      };
      soundButton.addEventListener("click", () => {
        sound = !sound;
        soundButton.textContent = sound ? "Sound on" : "Sound off";
        soundButton.setAttribute("aria-pressed", String(sound));
        if (sound) tone(480);
      });
      if (!context) {
        scoreText.textContent = "This browser cannot draw the game.";
        return () => {
          root.replaceChildren();
        };
      }
      let frame = 0,
        running = false,
        over = false,
        y = 0,
        velocity = 0,
        score = 0,
        last = 0,
        next = 1100,
        obstacles = [],
        announced = -1;
      let gameInk = getComputedStyle(host).color;
      const ink = () => gameInk;
      const themeChanged = () => {
        gameInk = getComputedStyle(host).color;
        if (!running) draw();
      };
      const themeObserver = new MutationObserver(themeChanged);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      const colorScheme = matchMedia("(prefers-color-scheme: dark)");
      colorScheme.addEventListener("change", themeChanged);
      const draw = () => {
        context.clearRect(0, 0, 600, 200);
        context.fillStyle = ink();
        context.strokeStyle = ink();
        context.lineWidth = 2;
        context.globalAlpha = .16;
        context.beginPath(); context.moveTo(0, 182); context.lineTo(600, 182); context.stroke();
        for (let i = 0; i < 6; i++) {
          const x = ((i * 121 - score * 19) % 680 + 680) % 680;
          context.beginPath(); context.ellipse(x, 40 + (i % 3) * 20, 25, 5, 0, 0, Math.PI * 2); context.stroke();
        }
        context.globalAlpha = 1;
        context.beginPath();
        context.ellipse(57, 160 + y, 10, 16, -0.7, 0, Math.PI * 2);
        context.ellipse(73, 160 + y, 10, 16, 0.7, 0, Math.PI * 2);
        context.fill();
        context.fillRect(63, 157 + y, 4, 16);
        for (const obstacle of obstacles) {
          context.strokeRect(obstacle.x, 180 - obstacle.height, 23, obstacle.height);
          for (let line = 188 - obstacle.height; line < 178; line += 7) {
            context.beginPath();
            context.moveTo(obstacle.x + 5, line);
            context.lineTo(obstacle.x + 18, line);
            context.stroke();
          }
        }
        if (!running) {
          context.font = "16px system-ui";
          context.textAlign = "center";
          context.fillText(over ? "A soft landing. Try another flight?" : "A small break for a wandering mind.", 340, 100);
        }
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(frame);
        button.textContent = over ? "Play again" : "Resume playing";
        draw();
      };
      const tick = (now) => {
        if (!running) return;
        const dt = Math.min(32, now - last);
        last = now;
        velocity += dt * 0.0018;
        y = Math.min(0, y + velocity * dt);
        if (y === 0) velocity = 0;
        next -= dt;
        if (next <= 0) {
          obstacles.push({ x: 620, height: 22 + Math.random() * 18 });
          next = 1450 + Math.random() * 650;
        }
        for (const obstacle of obstacles) obstacle.x -= dt * (0.24 + Math.min(score, 40) * 0.001);
        obstacles = obstacles.filter((obstacle) => {
          if (obstacle.x < -24) {
            score++;
            tone(660, .07, 1.2);
            return false;
          }
          return true;
        });
        if (score !== announced) {
          scoreText.textContent = `Score: ${score}`;
          announced = score;
        }
        if (obstacles.some((obstacle) => obstacle.x < 82 && obstacle.x + 23 > 51 && 175 + y > 180 - obstacle.height)) {
          over = true;
          tone(220, .22, .35);
          if (score > best) {
            best = score;
            bestText.textContent = `Best: ${best}`;
            try { localStorage.setItem("max:paper-hop-best", String(best)); } catch {}
          }
          stop();
          return;
        }
        draw();
        frame = requestAnimationFrame(tick);
      };
      const start = () => {
        if (running) {
          stop();
          return;
        }
        if (over) {
          obstacles = [];
          score = 0;
          next = 1100;
          y = 0;
          velocity = 0;
          over = false;
        }
        running = true;
        last = performance.now();
        button.textContent = "Pause game";
        canvas.focus();
        frame = requestAnimationFrame(tick);
      };
      const jump = () => {
        if (!running) start();
        if (running && y === 0) { velocity = -0.65; tone(340, .12, 2); }
      };
      const key = (event) => {
        if (event.target instanceof HTMLButtonElement) return;
        if ((event.code === "Space" || event.code === "ArrowUp") ) {
          event.preventDefault();
          jump();
        }
      };
      const pause = () => {
        if (document.hidden && running) stop();
      };
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", "Paper hop playfield. Press Space or Up to jump while playing.");
      button.addEventListener("click", start);
      hopButton.addEventListener("click", jump);
      canvas.addEventListener("pointerdown", jump);
      root.addEventListener("keydown", key);
      document.addEventListener("visibilitychange", pause);
      draw();
      return () => {
        running = false;
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", pause);
        themeObserver.disconnect();
        colorScheme.removeEventListener("change", themeChanged);
        root.removeEventListener("keydown", key);
        void audio?.close();
        root.replaceChildren();
      };
    },
  };
})();

(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const CONFETTI_COLORS = ["#edb43f", "#d76550", "#f5e3a2", "#5e9b7b", "#c676aa"];

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawTreeLine(ctx, width, height, horizon) {
    ctx.fillStyle = "#6c805d";
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.5) * width / 8;
      const crownY = horizon - height * (0.045 + (i % 3) * 0.018);
      const radius = height * (0.12 + (i % 2) * 0.018);
      ctx.fillRect(x - radius * 0.14, crownY, radius * 0.28, height * 0.2);
      ctx.beginPath();
      ctx.arc(x, crownY, radius, Math.PI, TAU);
      ctx.arc(x - radius * 0.56, crownY + radius * 0.42, radius * 0.67, Math.PI * 0.8, TAU * 1.8);
      ctx.arc(x + radius * 0.55, crownY + radius * 0.43, radius * 0.7, Math.PI * 1.2, TAU * 0.2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(62, 80, 57, .8)";
    for (let i = 0; i < 7; i++) {
      const x = i * width / 6;
      const treeH = height * (0.2 + (i % 3) * 0.027);
      const treeW = Math.max(20, width * 0.055);
      ctx.beginPath();
      ctx.moveTo(x, horizon + height * 0.11);
      ctx.lineTo(x - treeW * 0.62, horizon + height * 0.11);
      ctx.lineTo(x, horizon - treeH);
      ctx.lineTo(x + treeW * 0.62, horizon + height * 0.11);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFinishBanner(ctx, width, height) {
    const x = width * 0.055;
    const y = height * 0.245;
    const bannerW = width * 0.89;
    const bannerH = Math.max(38, height * 0.115);
    const poleW = Math.max(4, height * 0.012);
    const poleBottom = height * 0.69;

    ctx.strokeStyle = "#715d43";
    ctx.lineWidth = poleW;
    ctx.beginPath();
    ctx.moveTo(x + poleW, y + bannerH * 0.48);
    ctx.lineTo(x + poleW, poleBottom);
    ctx.moveTo(x + bannerW - poleW, y + bannerH * 0.48);
    ctx.lineTo(x + bannerW - poleW, poleBottom);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 237, 192, .48)";
    ctx.lineWidth = Math.max(1, poleW * 0.26);
    ctx.beginPath();
    ctx.moveTo(x, y + bannerH * 0.48);
    ctx.lineTo(x, poleBottom);
    ctx.moveTo(x + bannerW, y + bannerH * 0.48);
    ctx.lineTo(x + bannerW, poleBottom);
    ctx.stroke();

    ctx.fillStyle = "rgba(58, 49, 37, .2)";
    roundedRect(ctx, x - 2, y + 5, bannerW + 4, bannerH, 5);
    ctx.fill();
    roundedRect(ctx, x, y, bannerW, bannerH, 5);
    ctx.fillStyle = "#f5e8c8";
    ctx.fill();
    ctx.strokeStyle = "#655744";
    ctx.lineWidth = Math.max(1.4, height * 0.003);
    ctx.stroke();

    const cols = 2;
    const checkerSize = Math.min((bannerH - 10) / 4, bannerW * 0.075);
    const checkerW = checkerSize * 2;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < cols; col++) {
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = "#554b3c";
          ctx.fillRect(x + 7 + col * checkerSize, y + 5 + row * checkerSize, checkerSize, checkerSize);
          ctx.fillRect(x + bannerW - 7 - (col + 1) * checkerSize, y + 5 + row * checkerSize, checkerSize, checkerSize);
        }
      }
    }
    const centerW = bannerW - checkerW * 2 - 18;
    const centerX = x + (bannerW - centerW) / 2;
    ctx.fillStyle = "#efe0bc";
    roundedRect(ctx, centerX, y + 5, centerW, bannerH - 10, 4);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#64533f";
    ctx.font = `bold ${Math.max(16, Math.min(height * 0.052, width * 0.075))}px Georgia, serif`;
    ctx.fillText("FINISH", width / 2, y + bannerH * 0.51);

    // Small ribbon tails make the finish marker read like a race-day celebration.
    for (const side of [-1, 1]) {
      const startX = side < 0 ? x + 2 : x + bannerW - 2;
      const direction = side;
      ctx.fillStyle = side < 0 ? "#bd775c" : "#82946b";
      ctx.beginPath();
      ctx.moveTo(startX, y + bannerH * 0.63);
      ctx.lineTo(startX + direction * width * 0.07, y + bannerH * 0.78);
      ctx.lineTo(startX + direction * width * 0.055, y + bannerH * 0.98);
      ctx.lineTo(startX, y + bannerH * 0.83);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFirework(ctx, x, y, radius, phase, color, still) {
    const cycle = still ? 0.55 : (phase % 1 + 1) % 1;
    const bloom = still ? 0.76 : 0.42 + cycle * 0.58;
    const fade = still ? 0.62 : Math.sin(Math.PI * cycle);
    const r = radius * bloom;
    ctx.save();
    ctx.globalAlpha = still ? 0.58 : 0.25 + fade * 0.72;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, radius * 0.018);
    for (let i = 0; i < 14; i++) {
      const angle = i * TAU / 14;
      const inner = r * (0.28 + (i % 3) * 0.025);
      const outer = r * (0.72 + (i % 2) * 0.1);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer, Math.max(1.2, radius * 0.025), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 237, 192, .82)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, r * 0.06), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawConfetti(ctx, width, height, elapsed, still) {
    const count = Math.max(26, Math.min(68, Math.floor(width / 10)));
    const fallHeight = height * 0.71;
    for (let i = 0; i < count; i++) {
      const seedX = (i * 83 + 29) % 997;
      const seedY = (i * 137 + 41) % 991;
      const x = seedX / 997 * width;
      const speed = 18 + (i % 5) * 7;
      const y = ((seedY / 991 * fallHeight) + (still ? 0 : elapsed * speed)) % fallHeight;
      const size = Math.max(2, Math.min(width, height) * (0.009 + (i % 3) * 0.002));
      const sway = still ? 0 : Math.sin(elapsed * 1.1 + i * 0.8) * size * 1.8;
      ctx.save();
      ctx.translate(x + sway, y + height * 0.04);
      if (!still) ctx.rotate(Math.sin(elapsed * 1.8 + i) * 0.45);
      ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.62, 0, TAU);
        ctx.fill();
      } else {
        roundedRect(ctx, -size * 0.45, -size * 0.75, size * 0.9, size * 1.5, size * 0.18);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawTrack(ctx, width, height, groundY) {
    const ground = ctx.createLinearGradient(0, groundY, 0, height);
    ground.addColorStop(0, "#71834f");
    ground.addColorStop(1, "#526944");
    ctx.fillStyle = ground;
    ctx.fillRect(0, groundY, width, height - groundY);

    const trackTop = groundY + height * 0.04;
    ctx.fillStyle = "#b77d5e";
    ctx.beginPath();
    ctx.moveTo(width * 0.27, trackTop);
    ctx.lineTo(width * 0.73, trackTop);
    ctx.lineTo(width * 1.06, height);
    ctx.lineTo(-width * 0.06, height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f0dcae";
    ctx.lineWidth = Math.max(2, height * 0.007);
    ctx.beginPath();
    ctx.moveTo(width * 0.27, trackTop);
    ctx.lineTo(-width * 0.06, height);
    ctx.moveTo(width * 0.73, trackTop);
    ctx.lineTo(width * 1.06, height);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 232, 191, .52)";
    ctx.lineWidth = Math.max(1, height * 0.003);
    for (let i = 0; i < 4; i++) {
      const y = trackTop + (height - trackTop) * (i + 1) / 5;
      const progress = (y - trackTop) / (height - trackTop);
      const half = width * (0.23 + progress * 0.33);
      ctx.beginPath();
      ctx.moveTo(width / 2 - half, y);
      ctx.lineTo(width / 2 + half, y);
      ctx.stroke();
    }
  }

  function drawBackground(ctx, width, height, time, still) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#d7a56c");
    sky.addColorStop(0.38, "#e8bd82");
    sky.addColorStop(0.72, "#bdad73");
    sky.addColorStop(1, "#82915d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, height * 0.31, 0, width * 0.5, height * 0.31, Math.max(width, height) * 0.72);
    glow.addColorStop(0, "rgba(255, 233, 177, .52)");
    glow.addColorStop(1, "rgba(255, 233, 177, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const horizon = height * 0.67;
    drawTreeLine(ctx, width, height, horizon);

    drawFirework(ctx, width * 0.16, height * 0.14, Math.min(width, height) * 0.15, time * 0.31 + 0.1, "#d45c50", still);
    drawFirework(ctx, width * 0.83, height * 0.16, Math.min(width, height) * 0.135, time * 0.27 + 0.47, "#fff0bb", still);
    drawFirework(ctx, width * 0.5, height * 0.45, Math.min(width, height) * 0.17, time * 0.38 + 0.29, "#4f887e", still);
    drawConfetti(ctx, width, height, time, still);
    drawFinishBanner(ctx, width, height);
    drawTrack(ctx, width, height, horizon);
    return horizon;
  }

  function drawWoodlandWarmupScene(ctx, width, height, elapsedSeconds, drawCharacter, reducedMotion = false) {
    if (!ctx || typeof drawCharacter !== "function" || width <= 0 || height <= 0) return;
    const time = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    const still = Boolean(reducedMotion);
    const groundY = drawBackground(ctx, width, height, time, still);
    const scale = Math.min((width - 32) / 220, height / 190, 4.2);
    const baseline = groundY + height * 0.13 - 18 * scale;
    const spacing = scale * 74;
    const characters = [
      { type: "mac", x: width * 0.225, period: 1.12, phase: 0.1, height: 11 },
      { type: "reggie", x: width * 0.5, period: 1.39, phase: 1.8, height: 13 },
      { type: "sebal", x: width * 0.775, period: 0.98, phase: 3.2, height: 10 }
    ];

    // Keep the friends close together as one finish-line portrait.
    characters[0].x = width / 2 + 5 * scale - spacing;
    characters[1].x = width / 2 + 5 * scale;
    characters[2].x = width / 2 + 5 * scale + spacing;
    for (const friend of characters) {
      const jump = still ? 0 : (1 - Math.cos((time * TAU / friend.period) + friend.phase)) * 0.5 * friend.height * scale;
      ctx.save();
      ctx.translate(friend.x, baseline - jump);
      ctx.scale(scale, scale);
      drawCharacter(ctx, friend.type, 0, 0, false, 0, false);
      ctx.restore();
    }
  }

  window.drawWoodlandWarmupScene = drawWoodlandWarmupScene;
})();

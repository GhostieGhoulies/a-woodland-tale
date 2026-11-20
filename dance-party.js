(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const COLORS = ["#f04fce", "#36d8ef", "#a45dff", "#ffd04d", "#ff6684"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function rgbaFromHex(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function drawBeam(ctx, x, y, angle, length, width, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(0, 0, 0, length);
    gradient.addColorStop(0, rgbaFromHex(color, alpha));
    gradient.addColorStop(1, rgbaFromHex(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-width * 0.14, 0);
    ctx.lineTo(width * 0.14, 0);
    ctx.lineTo(width, length);
    ctx.lineTo(-width, length);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDiscoBall(ctx, cx, cy, radius, time, still) {
    const spin = still ? 0.28 : time * 0.72;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(247, 222, 164, .62)";
    ctx.lineWidth = Math.max(1, radius * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, -radius - 1);
    ctx.lineTo(0, -radius * 2.1);
    ctx.stroke();
    ctx.fillStyle = "#e8d19b";
    ctx.beginPath();
    ctx.arc(0, -radius * 2.1, Math.max(2, radius * 0.09), 0, TAU);
    ctx.fill();

    ctx.rotate(spin);
    const ball = ctx.createRadialGradient(-radius * 0.36, -radius * 0.42, 1, 0, 0, radius * 1.2);
    ball.addColorStop(0, "#fff5d2");
    ball.addColorStop(0.32, "#c9d5cb");
    ball.addColorStop(0.7, "#849397");
    ball.addColorStop(1, "#435357");
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.98, 0, TAU);
    ctx.clip();
    const tiles = 7;
    for (let row = -3; row <= 3; row++) {
      for (let col = -4; col <= 4; col++) {
        const x = col * radius * 0.31 + (row % 2) * radius * 0.13;
        const y = row * radius * 0.29;
        const shine = 0.26 + 0.5 * (0.5 + 0.5 * Math.sin(time * 1.4 + row * 1.7 + col * 2.1));
        ctx.fillStyle = `rgba(255, 248, 218, ${shine})`;
        ctx.strokeStyle = "rgba(56, 68, 67, .48)";
        ctx.lineWidth = Math.max(0.45, radius * 0.018);
        ctx.beginPath();
        ctx.rect(x - radius * 0.14, y - radius * 0.115, radius * 0.28, radius * 0.23);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.restore();
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 3.7);
    glow.addColorStop(0, "rgba(255, 227, 156, .15)");
    glow.addColorStop(1, "rgba(255, 227, 156, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 3.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSpecks(ctx, w, h, time, still) {
    for (let i = 0; i < 28; i++) {
      const x = ((i * 137.5 + 29) % 997) / 997 * w;
      const baseY = ((i * 71.3 + 17) % 613) / 613 * h;
      const y = (baseY + (still ? 0 : time * (3 + i % 4))) % h;
      const alpha = 0.18 + 0.26 * (0.5 + 0.5 * Math.sin((still ? 0 : time) * 1.7 + i * 2.4));
      ctx.fillStyle = `rgba(255, 232, 170, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, i % 5 === 0 ? 1.8 : 1, 0, TAU);
      ctx.fill();
    }
  }

  function drawFloor(ctx, w, h, floorY, time, still) {
    const floorHeight = h - floorY;
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, "#604a3b");
    floor.addColorStop(0.2, "#49392f");
    floor.addColorStop(1, "#302c29");
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, w, floorHeight);

    // Perspective parquet catches the beat in soft, saturated pools of color.
    const floorPalette = ["#f04fce", "#36d8ef", "#a45dff", "#ffd04d"];
    const center = w * 0.5;
    const tileRows = 5;
    const columns = 12;
    for (let row = 0; row < tileRows; row++) {
      const nearP = (row + 1) / tileRows;
      const farP = row / tileRows;
      const nearY = floorY + floorHeight * nearP * nearP;
      const farY = floorY + floorHeight * farP * farP;
      const nearScale = 0.12 + nearP * 0.88;
      const farScale = 0.12 + farP * 0.88;
      for (let col = 0; col < columns; col++) {
        const u0 = col / columns * 2 - 1;
        const u1 = (col + 1) / columns * 2 - 1;
        const x0f = center + u0 * w * 0.5 * farScale;
        const x1f = center + u1 * w * 0.5 * farScale;
        const x0n = center + u0 * w * 0.5 * nearScale;
        const x1n = center + u1 * w * 0.5 * nearScale;
        const color = floorPalette[(col + row * 2) % floorPalette.length];
        const beat = still ? 0.48 : 0.5 + 0.5 * Math.sin(time * 2.4 - row * 0.72 + col * 0.52);
        const alpha = 0.14 + beat * 0.2;
        ctx.fillStyle = rgbaFromHex(color, alpha);
        ctx.beginPath();
        ctx.moveTo(x0f, farY);
        ctx.lineTo(x1f, farY);
        ctx.lineTo(x1n, nearY);
        ctx.lineTo(x0n, nearY);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.56;
    ctx.strokeStyle = "#e9bb77";
    ctx.lineWidth = Math.max(1, h * 0.002);
    const vanishingX = w * 0.5;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(vanishingX, floorY);
      ctx.lineTo(vanishingX + i * w * 0.24, h);
      ctx.stroke();
    }
    const rows = 5;
    for (let row = 1; row <= rows; row++) {
      const p = row / rows;
      const yy = floorY + floorHeight * p * p;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }
    ctx.restore();

    const pulse = still ? 0.2 : 0.17 + 0.14 * (0.5 + 0.5 * Math.sin(time * 2.4));
    const pool = ctx.createRadialGradient(w * 0.5, floorY + floorHeight * 0.12, 0, w * 0.5, floorY, w * 0.52);
    pool.addColorStop(0, `rgba(248, 207, 128, ${pulse})`);
    pool.addColorStop(1, "rgba(248, 207, 128, 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, floorY, w, floorHeight);

    ctx.fillStyle = "rgba(242, 206, 143, .72)";
    ctx.fillRect(0, floorY - 2, w, Math.max(2, h * 0.004));
  }

  function drawName(ctx, label, x, y, scale, color) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.max(10, 12 * scale)}px Georgia, serif`;
    ctx.fillStyle = "rgba(38, 31, 27, .7)";
    roundedRect(ctx, x - 34 * scale, y - 9 * scale, 68 * scale, 18 * scale, 9 * scale);
    ctx.fill();
    ctx.strokeStyle = "rgba(238, 210, 161, .48)";
    ctx.lineWidth = Math.max(0.7, scale);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, x, y + 0.5 * scale);
    ctx.restore();
  }

  function drawWoodlandDanceScene(ctx, width, height, elapsedSeconds, drawCharacter, reducedMotion = false) {
    if (!ctx || typeof drawCharacter !== "function" || width <= 0 || height <= 0) return;
    const w = width;
    const h = height;
    const time = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    const still = Boolean(reducedMotion);
    const motionTime = still ? 0 : time;
    const phone = w < 540;
    const landscape = w > h * 1.15;
    const floorY = h * (phone ? 0.69 : landscape ? 0.72 : 0.74);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#291e3e");
    bg.addColorStop(0.48, "#263b4d");
    bg.addColorStop(1, "#47344d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const warmHaze = ctx.createRadialGradient(w * 0.5, h * 0.43, 0, w * 0.5, h * 0.43, Math.max(w, h) * 0.72);
    warmHaze.addColorStop(0, "rgba(206, 88, 199, .25)");
    warmHaze.addColorStop(0.48, "rgba(53, 192, 221, .1)");
    warmHaze.addColorStop(1, "rgba(190, 134, 86, 0)");
    ctx.fillStyle = warmHaze;
    ctx.fillRect(0, 0, w, h);

    const sweep = still ? 0 : Math.sin(motionTime * 0.42) * 0.22;
    const gentlePulse = still ? 0.21 : 0.18 + 0.035 * (0.5 + 0.5 * Math.sin(motionTime * 1.8));
    drawBeam(ctx, w * 0.12, h * 0.02, 0.42 + sweep, h * 0.94, w * 0.24, COLORS[0], gentlePulse);
    drawBeam(ctx, w * 0.34, h * 0.01, 0.12 - sweep * 0.68, h * 0.86, w * 0.18, COLORS[1], gentlePulse * 0.9);
    drawBeam(ctx, w * 0.66, h * 0.01, -0.12 - sweep * 0.68, h * 0.86, w * 0.18, COLORS[2], gentlePulse * 0.9);
    drawBeam(ctx, w * 0.88, h * 0.02, -0.42 - sweep, h * 0.94, w * 0.24, COLORS[3], gentlePulse);
    drawBeam(ctx, w * 0.5, h * 0.01, 0.02 + sweep * 0.45, h * 0.84, w * 0.14, COLORS[4], gentlePulse * 0.72);

    ctx.save();
    ctx.globalAlpha = 0.23;
    ctx.fillStyle = "#182b27";
    for (let i = 0; i < 9; i++) {
      const side = i < 5 ? -1 : 1;
      const j = i < 5 ? i : i - 5;
      const x = side < 0 ? w * (0.015 + j * 0.055) : w * (0.985 - j * 0.055);
      const base = floorY + (j % 2) * h * 0.04;
      const treeH = h * (0.26 + (j % 3) * 0.045);
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x - w * 0.045, base);
      ctx.lineTo(x, base - treeH);
      ctx.lineTo(x + w * 0.05, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    drawSpecks(ctx, w, h, motionTime, still);
    const ballRadius = clamp(Math.min(w, h) * 0.055, phone ? 14 : 17, 31);
    const ballY = Math.max(ballRadius * 2.8, h * (phone ? 0.19 : 0.15));
    drawDiscoBall(ctx, w * 0.5, ballY, ballRadius, motionTime, still);

    // A few warm bulbs frame the tiny, secret forest-floor dance hall.
    const bulbCount = Math.max(5, Math.floor(w / 95));
    for (let i = 0; i < bulbCount; i++) {
      const x = (i + 0.5) * w / bulbCount;
      const twinkle = still ? 0.62 : 0.46 + 0.34 * (0.5 + 0.5 * Math.sin(motionTime * 2 + i * 1.6));
      ctx.fillStyle = `rgba(255, 220, 150, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(x, h * 0.035, clamp(w * 0.004, 1.8, 4), 0, TAU);
      ctx.fill();
    }

    drawFloor(ctx, w, h, floorY, motionTime, still);

    const names = [
      { type: "mac", label: "Mac", tint: "#f5d9bf" },
      { type: "reggie", label: "Reggie", tint: "#e5d3b8" },
      { type: "sebal", label: "Sebastian", tint: "#f4d1a6" }
    ];
    const spacing = Math.min(w * (phone ? 0.32 : 0.285), h * (phone ? 0.49 : 0.64));
    const centerX = w * 0.5;
    const centers = [centerX - spacing, centerX, centerX + spacing];
    const characterScale = phone
      ? clamp(Math.min(w / 320, h / 420), 0.88, 1.36)
      : clamp(Math.min(w / 470, h / 440), 0.9, 1.36);
    const baseline = floorY - 17 * characterScale;

    names.forEach((character, index) => {
      const phase = motionTime * 2.7 + index * 1.95;
      const sway = still ? 0 : Math.sin(phase) * 0.11;
      const hop = still ? 0 : (0.5 + 0.5 * Math.sin(phase * 2)) * 5 * characterScale;
      const step = still ? 0 : Math.sin(phase * 2) * 3.5;
      const x = centers[index];
      const y = baseline - hop;

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#171c19";
      ctx.beginPath();
      ctx.ellipse(x, floorY + 3 * characterScale, 30 * characterScale, 7 * characterScale, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      ctx.scale(characterScale, characterScale);
      drawCharacter(ctx, character.type, 0, 0, false, (motionTime * 18 + index * 13) + step, true);
      ctx.restore();

      drawName(ctx, character.label, x, floorY + h * 0.055, characterScale, character.tint);

      if (!still) {
        const sparkleX = x + Math.sin(phase * 1.4) * 25 * characterScale;
        const sparkleY = floorY - 41 * characterScale - (0.5 + 0.5 * Math.sin(phase * 1.8)) * 15;
        ctx.strokeStyle = `rgba(255, 235, 184, ${0.35 + 0.35 * (0.5 + 0.5 * Math.sin(phase))})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sparkleX - 3, sparkleY);
        ctx.lineTo(sparkleX + 3, sparkleY);
        ctx.moveTo(sparkleX, sparkleY - 3);
        ctx.lineTo(sparkleX, sparkleY + 3);
        ctx.stroke();
      }
    });

    // Gentle color washes keep the light show celebratory rather than strobing.
    const wash = still ? 0.055 : 0.045 + 0.035 * (0.5 + 0.5 * Math.sin(motionTime * 1.4));
    ctx.fillStyle = `rgba(196, 106, 230, ${wash})`;
    ctx.fillRect(0, 0, w, h);
  }

  window.drawWoodlandDanceScene = drawWoodlandDanceScene;
})();

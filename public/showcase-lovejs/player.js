(() => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  let payload = { tool: 'idle' };
  let tick = 0;

  function resize() {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function drawGrid(width, height) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawShaderPreview(width, height) {
    const size = Math.min(width, height) * 0.44;
    const x = width * 0.5;
    const y = height * 0.5;
    const shape = payload.previewShape || 'circle';
    const color = payload.previewColor || '#38bdf8';
    const pad = size * 0.22;

    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (shape === 'rectangle') {
      ctx.fillRect(x - size / 2 + pad, y - size / 2 + pad, size - pad * 2, size - pad * 2);
    } else if (shape === 'line') {
      ctx.lineWidth = Math.max(6, size * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - size / 2 + pad, y + size / 2 - pad);
      ctx.lineTo(x + size / 2 - pad, y - size / 2 + pad);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(payload.shaderName || 'shader graph'), x, y + size * 0.3 + 28);
  }

  function drawParticles(width, height) {
    const system = payload.activeSystem || {};
    const rate = Number(system.properties?.emissionRate || 80);
    const count = Math.max(24, Math.min(180, Math.floor(rate)));
    const cx = width * 0.5 + Number(system.x || 0);
    const cy = height * 0.56 + Number(system.y || 0);
    const speed = Number(system.properties?.speedMax || 140);
    ctx.globalCompositeOperation = system.blendMode === 'add' ? 'lighter' : 'source-over';
    for (let i = 0; i < count; i += 1) {
      const p = (i / count + tick * 0.00008 * (speed / 120)) % 1;
      const angle = i * 2.399 + tick * 0.001;
      const spread = 26 + p * Math.min(220, speed);
      const x = cx + Math.cos(angle) * spread * (0.25 + p);
      const y = cy - p * 210 + Math.sin(angle * 1.7) * spread * 0.18;
      const alpha = Math.max(0, 1 - p);
      ctx.fillStyle = `rgba(255, ${Math.floor(140 + 90 * alpha)}, ${Math.floor(40 + 120 * p)}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 2 + 8 * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    tick += 16;
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);
    drawGrid(width, height);

    if (payload.tool === 'particle-system-playground') drawParticles(width, height);
    else drawShaderPreview(width, height);

    ctx.fillStyle = 'rgba(215, 221, 232, 0.72)';
    ctx.font = '11px Inter, ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Feather standalone preview bridge', 12, 22);
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'feather-showcase' || event.data?.type !== 'preview:update') return;
    payload = event.data.payload || payload;
  });

  resize();
  draw();
})();

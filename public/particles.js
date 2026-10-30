(() => {
  const canvas = document.getElementById("particles");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  let dots = [];
  let raf = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.min(70, Math.floor((canvas.width * canvas.height) / 18000));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.45 + 0.15,
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 0 || d.x > canvas.width) d.vx *= -1;
      if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
      ctx.beginPath();
      ctx.fillStyle = `rgba(62, 199, 255, ${d.a})`;
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  resize();
  tick();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else tick();
  });
})();

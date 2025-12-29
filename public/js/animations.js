// ==========================================
// ANIMATIONS - Multi-Screen Sync
// ==========================================

const Animations = {
  
  // ==========================================
  // GRADIENT - Horizontal color sweep
  // ==========================================
  gradient(ctx, width, height, time) {
    const offset = (time * 0.5) % 1;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    
    // Rotating hue gradient
    for (let i = 0; i <= 10; i++) {
      const hue = ((i / 10 + offset) * 360) % 360;
      gradient.addColorStop(i / 10, `hsl(${hue}, 100%, 50%)`);
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  },
  
  // ==========================================
  // RADIAL - Expanding circles from center
  // ==========================================
  radial(ctx, width, height, time) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // Draw multiple rings
    const numRings = 5;
    for (let i = 0; i < numRings; i++) {
      const phase = (time * 0.8 + i / numRings) % 1;
      const radius = phase * maxRadius;
      const hue = (i * 72 + time * 50) % 360;
      const alpha = 1 - phase;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
      ctx.lineWidth = maxRadius / numRings * 0.8;
      ctx.stroke();
    }
  },
  
  // ==========================================
  // RAINBOW - Rotating hue wheel
  // ==========================================
  rainbow(ctx, width, height, time) {
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Create radial gradient that rotates
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const angle = Math.atan2(dy, dx);
        const hue = ((angle / (Math.PI * 2) + 0.5 + time * 0.3) % 1) * 360;
        
        const rgb = hslToRgb(hue / 360, 1, 0.5);
        const i = (y * width + x) * 4;
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
        data[i + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  },
  
  // ==========================================
  // BOUNCE - Ball bouncing around
  // ==========================================
  bounce(ctx, width, height, time) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    // Ball physics
    const ballRadius = width * 0.15;
    const speed = 0.7;
    
    // Calculate position with bouncing
    let x = (time * speed) % 2;
    let y = (time * speed * 0.7) % 2;
    
    // Bounce back
    if (x > 1) x = 2 - x;
    if (y > 1) y = 2 - y;
    
    const ballX = x * (width - ballRadius * 2) + ballRadius;
    const ballY = y * (height - ballRadius * 2) + ballRadius;
    
    // Draw ball with gradient
    const gradient = ctx.createRadialGradient(
      ballX - ballRadius * 0.3, 
      ballY - ballRadius * 0.3, 
      0,
      ballX, 
      ballY, 
      ballRadius
    );
    
    const hue = (time * 60) % 360;
    gradient.addColorStop(0, `hsl(${hue}, 100%, 70%)`);
    gradient.addColorStop(0.5, `hsl(${hue}, 100%, 50%)`);
    gradient.addColorStop(1, `hsl(${hue}, 100%, 20%)`);
    
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw trail/glow
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius * 1.5, 0, Math.PI * 2);
    const glowGradient = ctx.createRadialGradient(ballX, ballY, ballRadius, ballX, ballY, ballRadius * 1.5);
    glowGradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.5)`);
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fill();
  },
  
  // ==========================================
  // PULSE - Synchronized heartbeat
  // ==========================================
  pulse(ctx, width, height, time) {
    // Heartbeat pattern: quick double pulse
    const beatPeriod = 1.2;
    const t = (time % beatPeriod) / beatPeriod;
    
    let intensity;
    if (t < 0.1) {
      intensity = t / 0.1;
    } else if (t < 0.15) {
      intensity = 1 - (t - 0.1) / 0.05;
    } else if (t < 0.25) {
      intensity = (t - 0.15) / 0.1 * 0.8;
    } else if (t < 0.35) {
      intensity = 0.8 - (t - 0.25) / 0.1 * 0.8;
    } else {
      intensity = 0;
    }
    
    // Ease the intensity
    intensity = intensity * intensity;
    
    const red = Math.round(255 * intensity);
    ctx.fillStyle = `rgb(${red}, 0, ${Math.round(red * 0.3)})`;
    ctx.fillRect(0, 0, width, height);
  },
  
  // ==========================================
  // SWEEP - White bar sweeping left to right
  // ==========================================
  sweep(ctx, width, height, time) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    // Bar properties
    const barWidth = width * 0.15; // 15% of canvas width
    const speed = 0.5; // Time to complete one sweep
    
    // Calculate bar position (loops every 'speed' seconds)
    const progress = (time * speed) % 1.2; // 1.2 to allow bar to fully exit
    const barX = progress * (width + barWidth) - barWidth;
    
    // Draw the white bar with soft edges
    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, 0, barWidth, height);
  },
  
  // ==========================================
  // MATRIX - Digital rain effect
  // ==========================================
  matrix(ctx, width, height, time) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);
    
    const columns = 10;
    const cellWidth = width / columns;
    
    // Use deterministic "random" based on time
    const seed = Math.floor(time * 10);
    
    for (let col = 0; col < columns; col++) {
      // Each column has its own drop
      const dropSpeed = 0.5 + (col % 3) * 0.2;
      const dropY = ((time * dropSpeed + col * 0.3) % 1.5) * height;
      
      // Only draw if drop is visible
      if (dropY < height) {
        const brightness = Math.max(0, 1 - dropY / height);
        const green = Math.round(100 + brightness * 155);
        
        ctx.fillStyle = `rgb(0, ${green}, 0)`;
        ctx.fillRect(col * cellWidth, dropY, cellWidth, cellWidth);
      }
    }
    },

    // ==========================================
    // CIRCLE SWEEP - Expanding halo
    // ==========================================
    circleSweep(ctx, width, height, time) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const maxR = Math.hypot(centerX, centerY);
      const progress = (time * 0.6) % 1;
      const radius = progress * maxR;
      const ringWidth = Math.max(width * 0.05, 8);
      const gradient = ctx.createRadialGradient(centerX, centerY, radius - ringWidth, centerX, centerY, radius + ringWidth);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + ringWidth, 0, Math.PI * 2);
      ctx.arc(centerX, centerY, Math.max(0, radius - ringWidth), 0, Math.PI * 2, true);
      ctx.fill();
    },

    // ==========================================
    // CROSS SWEEP - Horizontal + vertical bars
    // ==========================================
    crossSweep(ctx, width, height, time) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const barW = width * 0.12;
      const barH = height * 0.12;
      const speed = 0.55;
      const p = (time * speed) % 1;
      const x = p * (width + barW) - barW;
      const y = (1 - p) * (height + barH) - barH;
      const gradX = ctx.createLinearGradient(x, 0, x + barW, 0);
      gradX.addColorStop(0, 'rgba(255,255,255,0)');
      gradX.addColorStop(0.4, 'rgba(255,255,255,0.9)');
      gradX.addColorStop(1, 'rgba(255,255,255,0)');
      const gradY = ctx.createLinearGradient(0, y, 0, y + barH);
      gradY.addColorStop(0, 'rgba(255,255,255,0)');
      gradY.addColorStop(0.4, 'rgba(255,255,255,0.9)');
      gradY.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradX;
      ctx.fillRect(x, 0, barW, height);
      ctx.fillStyle = gradY;
      ctx.fillRect(0, y, width, barH);
    },

    // ==========================================
    // SPIRAL - Color spiral sweep
    // ==========================================
    spiral(ctx, width, height, time) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const turns = 3;
      const maxR = Math.hypot(cx, cy);
      ctx.lineWidth = 6;
      for (let i = 0; i < 220; i++) {
        const t = i / 220;
        const angle = t * Math.PI * 2 * turns + time * 1.5;
        const r = t * maxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const hue = (t * 360 + time * 120) % 360;
        ctx.strokeStyle = `hsla(${hue},100%,60%,0.7)`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
        ctx.stroke();
      }
    },

    // ==========================================
    // RIPPLE - Soft concentric waves
    // ==========================================
    ripple(ctx, width, height, time) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.hypot(cx, cy);
      const waves = 4;
      for (let i = 0; i < waves; i++) {
        const phase = (time * 0.8 + i / waves) % 1;
        const radius = phase * maxR;
        const alpha = 1 - phase;
        const hue = (200 + i * 25 + time * 40) % 360;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 90%, 60%, ${alpha})`;
        ctx.lineWidth = 10 * alpha + 2;
        ctx.stroke();
      }
  }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function hslToRgb(h, s, l) {
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// Export for module systems (if used)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Animations;
}

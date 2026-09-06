import React, { useEffect, useRef } from 'react';

export default function MjOrb({ state = 'IDLE', audioLevel = 0, isMuted = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let rotation = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 65;

      rotation += 0.015;

      // Color scheme according to state
      let color1, color2, glowColor;
      switch (state) {
        case 'LISTENING':
          color1 = '#00f2fe';
          color2 = '#4facfe';
          glowColor = 'rgba(0, 242, 254, 0.6)';
          break;
        case 'THINKING':
          color1 = '#9d4edd';
          color2 = '#7b2cbf';
          glowColor = 'rgba(157, 78, 221, 0.6)';
          break;
        case 'WORKING':
          color1 = '#00e676';
          color2 = '#00b0ff';
          glowColor = 'rgba(0, 230, 118, 0.6)';
          break;
        case 'SPEAKING':
          color1 = '#ff2a85';
          color2 = '#00f2fe';
          glowColor = 'rgba(255, 42, 133, 0.6)';
          break;
        case 'WAITING_FOR_CONFIRMATION':
          color1 = '#ffb703';
          color2 = '#fb8500';
          glowColor = 'rgba(255, 183, 3, 0.6)';
          break;
        case 'ERROR':
          color1 = '#ff0055';
          color2 = '#d90429';
          glowColor = 'rgba(255, 0, 85, 0.6)';
          break;
        case 'IDLE':
        default:
          color1 = '#00f2fe';
          color2 = '#9d4edd';
          glowColor = 'rgba(0, 242, 254, 0.3)';
          break;
      }

      if (isMuted) {
        color1 = '#64748b';
        color2 = '#334155';
        glowColor = 'rgba(100, 116, 139, 0.2)';
      }

      // Dynamic reactive radius
      const dynamicRadius = baseRadius + (state === 'LISTENING' || state === 'SPEAKING' ? audioLevel * 25 : Math.sin(rotation * 2) * 4);

      // 1. Outer Ambient Glow Halo
      const outerGlow = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, dynamicRadius * 1.8);
      outerGlow.addColorStop(0, glowColor);
      outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.save();
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, dynamicRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Animated Orbiting Ring
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.strokeStyle = color1;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, dynamicRadius + 14, 0, Math.PI * 1.4);
      ctx.stroke();

      ctx.rotate(-rotation * 2);
      ctx.strokeStyle = color2;
      ctx.beginPath();
      ctx.arc(0, 0, dynamicRadius + 22, 0, Math.PI * 1.2);
      ctx.stroke();
      ctx.restore();

      // 3. Central Core Orb Gradient
      const coreGradient = ctx.createRadialGradient(
        centerX - dynamicRadius * 0.3,
        centerY - dynamicRadius * 0.3,
        dynamicRadius * 0.1,
        centerX,
        centerY,
        dynamicRadius
      );
      coreGradient.addColorStop(0, '#ffffff');
      coreGradient.addColorStop(0.3, color1);
      coreGradient.addColorStop(0.8, color2);
      coreGradient.addColorStop(1, '#0a0c14');

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(10, dynamicRadius), 0, Math.PI * 2);
      ctx.fillStyle = coreGradient;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.restore();

      // 4. Subtle Inner Swirl Particles
      ctx.save();
      ctx.translate(centerX, centerY);
      for (let i = 0; i < 3; i++) {
        const angle = rotation * (i + 1) * 0.8;
        const px = Math.cos(angle) * (dynamicRadius * 0.4);
        const py = Math.sin(angle) * (dynamicRadius * 0.4);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, audioLevel, isMuted]);

  return (
    <div className="flex flex-col items-center justify-center relative">
      <canvas
        ref={canvasRef}
        width={240}
        height={240}
        className="floating-orb cursor-pointer"
      />
    </div>
  );
}
